// Copyright (C) 2026
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"headscale-panel/model"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/hsapi"
	"headscale-panel/pkg/unifyerror"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/tailscale/hujson"
)

type aclService struct {
	mu sync.Mutex
}

var ACLService = &aclService{}

// InitPolicy seeds an empty ACL policy when Headscale has never stored one.
//
// headscale answers GET /api/v1/policy with HTTP 500 for two very different
// situations: no policy has ever been saved, and the read itself failed. Only
// the first may be repaired by writing an empty policy - treating a transient
// database error as "no policy" would silently replace a live ACL with "{}".
// hsapi distinguishes the two via ErrNoPolicy.
func (s *aclService) InitPolicy() error {
	return s.InitPolicyWithContext(context.Background())
}

func (s *aclService) InitPolicyWithContext(ctx context.Context) error {
	client, err := headscaleRESTClient()
	if err != nil {
		return err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	return initPolicyWithClient(queryCtx, client)
}

// initPolicyWithClient holds the decision logic so it can be exercised against
// a stub server without touching the global client.
func initPolicyWithClient(ctx context.Context, client policyStore) error {
	_, getErr := client.GetPolicy(ctx)
	if getErr == nil {
		return nil
	}
	if !errors.Is(getErr, hsapi.ErrNoPolicy) {
		return unifyerror.HeadscaleAPIError(getErr)
	}

	if _, setErr := client.SetPolicy(ctx, "{}"); setErr != nil {
		return unifyerror.HeadscaleAPIError(setErr)
	}
	return nil
}

// policyStore is the slice of the Headscale client the init path needs.
type policyStore interface {
	GetPolicy(ctx context.Context) (*hsapi.PolicyResponseBody, error)
	SetPolicy(ctx context.Context, policy string) (*hsapi.PolicyResponseBody, error)
}

// GetPolicy retrieves the current ACL policy from Headscale
func (s *aclService) GetPolicy(actorUserID uint) (*model.ACLPolicyStructure, error) {
	return s.GetPolicyWithContext(context.Background(), actorUserID)
}

func (s *aclService) GetPolicyWithContext(ctx context.Context, actorUserID uint) (*model.ACLPolicyStructure, error) {
	if err := RequirePermission(actorUserID, constants.PermACLPolicyRead); err != nil {
		return nil, err
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, apiErr := client.GetPolicy(queryCtx)
	if apiErr != nil {
		// No policy stored yet is not an error: the panel renders an empty editor.
		if errors.Is(apiErr, hsapi.ErrNoPolicy) {
			return &model.ACLPolicyStructure{}, nil
		}
		return nil, unifyerror.HeadscaleAPIError(apiErr)
	}

	rawPolicy := ""
	if resp != nil {
		rawPolicy = strings.TrimSpace(resp.Policy)
	}
	if rawPolicy == "" || strings.EqualFold(rawPolicy, "null") {
		return &model.ACLPolicyStructure{}, nil
	}

	standardizedPolicy, err := standardizeACLPolicyJSON(rawPolicy)
	if err != nil {
		return nil, err
	}

	var policy model.ACLPolicyStructure
	if err := json.Unmarshal(standardizedPolicy, &policy); err != nil {
		return nil, unifyerror.ServerError(err)
	}

	return &policy, nil
}

// UpdatePolicy updates the ACL policy in Headscale
func (s *aclService) UpdatePolicy(actorUserID uint, policy *model.ACLPolicyStructure) error {
	return s.UpdatePolicyWithContext(context.Background(), actorUserID, policy, "")
}

// UpdatePolicyWithContext saves a policy, refusing the write when the stored policy
// changed since the client read it.
//
// expectedUpdatedAt is the token the client got from GetPolicy. An empty value means
// the caller is not participating in the lock, which is allowed for internal flows
// but means a concurrent edit is not detected for that call.
func (s *aclService) UpdatePolicyWithContext(ctx context.Context, actorUserID uint, policy *model.ACLPolicyStructure, expectedUpdatedAt string) error {
	if err := RequirePermission(actorUserID, constants.PermACLPolicyUpdate); err != nil {
		return err
	}

	if err := normalizeACLPolicyStructure(policy); err != nil {
		return err
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return err
	}

	policyBytes, marshalErr := json.MarshalIndent(policy, "", "  ")
	if marshalErr != nil {
		return unifyerror.ServerError(marshalErr)
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	if err := ensurePolicyUnchanged(queryCtx, client, expectedUpdatedAt); err != nil {
		return err
	}

	if err := checkPolicyREST(queryCtx, client, string(policyBytes)); err != nil {
		return err
	}

	if _, apiErr := client.SetPolicy(queryCtx, string(policyBytes)); apiErr != nil {
		return wrapACLPolicyApplyError(apiErr)
	}
	return nil
}

// PolicyUpdatedAt returns the stored policy's modification time, or an empty string
// when there is no policy yet or the read failed.
//
// It never returns an error: an empty token degrades the client to the old
// last-write-wins behaviour rather than blocking the page.
func (s *aclService) PolicyUpdatedAt(ctx context.Context) string {
	client, err := headscaleRESTClient()
	if err != nil {
		return ""
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, apiErr := client.GetPolicy(queryCtx)
	if apiErr != nil || resp == nil {
		return ""
	}
	if resp.UpdatedAt.IsZero() {
		return ""
	}
	return resp.UpdatedAt.UTC().Format(time.RFC3339Nano)
}

// ensurePolicyUnchanged compares the stored updatedAt with what the client last saw.
//
// Only a client that supplied a token is checked, and a policy that does not exist
// yet cannot have changed. The comparison is by time, not by content: the point is
// to detect that someone else wrote in between, and their write may not have altered
// anything the current editor can see in its own draft.
func ensurePolicyUnchanged(ctx context.Context, client *hsapi.Client, expectedUpdatedAt string) error {
	expected := strings.TrimSpace(expectedUpdatedAt)
	if expected == "" {
		return nil
	}

	resp, err := client.GetPolicy(ctx)
	if err != nil {
		if errors.Is(err, hsapi.ErrNoPolicy) {
			// Nothing is stored, so nothing can have been overwritten.
			return nil
		}
		return unifyerror.HeadscaleAPIError(err)
	}
	if resp == nil || resp.UpdatedAt.IsZero() {
		return nil
	}

	actual := resp.UpdatedAt.UTC().Format(time.RFC3339Nano)
	if !sameInstant(actual, expected) {
		return unifyerror.New(http.StatusConflict, unifyerror.CodeConflict,
			"the ACL policy was changed by someone else after you loaded it; reload before saving")
	}
	return nil
}

// sameInstant compares two RFC3339 timestamps, falling back to string equality when
// either side is not parseable.
func sameInstant(a, b string) bool {
	parsedA, errA := time.Parse(time.RFC3339Nano, a)
	parsedB, errB := time.Parse(time.RFC3339Nano, b)
	if errA != nil || errB != nil {
		return a == b
	}
	return parsedA.Equal(parsedB)
}

// SetPolicyRaw sets the ACL policy from raw JSON string
func (s *aclService) SetPolicyRaw(actorUserID uint, policyJSON string) error {
	return s.SetPolicyRawWithContext(context.Background(), actorUserID, policyJSON)
}

func (s *aclService) SetPolicyRawWithContext(ctx context.Context, actorUserID uint, policyJSON string) error {
	if err := RequirePermission(actorUserID, constants.PermACLPolicyUpdate); err != nil {
		return err
	}

	normalizedPolicyJSON, err := normalizeRawACLPolicyJSON(policyJSON)
	if err != nil {
		return err
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()
	if err := checkPolicyREST(queryCtx, client, normalizedPolicyJSON); err != nil {
		return err
	}

	if _, apiErr := client.SetPolicy(queryCtx, normalizedPolicyJSON); apiErr != nil {
		return wrapACLPolicyApplyError(apiErr)
	}
	return nil
}

// SetPolicyRawWithLock is SetPolicyRawWithContext plus the optimistic-lock check.
func (s *aclService) SetPolicyRawWithLock(ctx context.Context, actorUserID uint, policyJSON, expectedUpdatedAt string) error {
	if err := RequirePermission(actorUserID, constants.PermACLPolicyUpdate); err != nil {
		return err
	}

	normalizedPolicyJSON, err := normalizeRawACLPolicyJSON(policyJSON)
	if err != nil {
		return err
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	if err := ensurePolicyUnchanged(queryCtx, client, expectedUpdatedAt); err != nil {
		return err
	}

	if err := checkPolicyREST(queryCtx, client, normalizedPolicyJSON); err != nil {
		return err
	}

	if _, apiErr := client.SetPolicy(queryCtx, normalizedPolicyJSON); apiErr != nil {
		return wrapACLPolicyApplyError(apiErr)
	}
	return nil
}

// CheckPolicyRawWithContext validates a policy with Headscale v0.29 without
// persisting it. Headscale also evaluates tests and sshTests in this call.
func (s *aclService) CheckPolicyRawWithContext(ctx context.Context, actorUserID uint, policyJSON string) error {
	if err := RequirePermission(actorUserID, constants.PermACLPolicyUpdate); err != nil {
		return err
	}
	normalizedPolicyJSON, err := normalizeRawACLPolicyJSON(policyJSON)
	if err != nil {
		return err
	}
	client, err := headscaleRESTClient()
	if err != nil {
		return err
	}
	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()
	return checkPolicyREST(queryCtx, client, normalizedPolicyJSON)
}

// checkPolicyREST validates a policy without persisting it.
//
// headscale evaluates policy tests and sshTests during this call, so it is the
// real pre-flight check rather than a syntax-only one.
func checkPolicyREST(ctx context.Context, client *hsapi.Client, policy string) error {
	if err := client.CheckPolicy(ctx, policy); err != nil {
		detail := strings.TrimSpace(hsapi.AsError("checking policy", err).Detail)
		if detail == "" {
			detail = constants.MsgACLPolicyFormatInvalid
		}
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, detail)
	}
	return nil
}

func normalizeACLPolicyStructure(policy *model.ACLPolicyStructure) error {
	if policy == nil {
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, constants.MsgACLPolicyEmpty)
	}

	for ruleIndex := range policy.ACLs {
		sources := make([]string, 0, len(policy.ACLs[ruleIndex].Src))
		for _, source := range policy.ACLs[ruleIndex].Src {
			trimmed := strings.TrimSpace(source)
			if trimmed == "" {
				return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, fmt.Sprintf(constants.MsgACLRuleEmptySource, ruleIndex+1))
			}
			sources = append(sources, trimmed)
		}
		policy.ACLs[ruleIndex].Src = sources

		destinations := make([]string, 0, len(policy.ACLs[ruleIndex].Dst))
		for _, destination := range policy.ACLs[ruleIndex].Dst {
			normalizedDestination, err := normalizeACLDestination(destination)
			if err != nil {
				return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, fmt.Sprintf(constants.MsgACLRuleDstFormatInvalid, ruleIndex+1, strings.TrimSpace(destination)))
			}
			destinations = append(destinations, normalizedDestination)
		}
		policy.ACLs[ruleIndex].Dst = destinations
	}

	return nil
}

func normalizeRawACLPolicyJSON(policyJSON string) (string, error) {
	trimmed := strings.TrimSpace(policyJSON)
	if trimmed == "" {
		return "", unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, constants.MsgACLPolicyEmpty)
	}

	standardizedPolicy, err := standardizeACLPolicyJSON(trimmed)
	if err != nil {
		return "", err
	}

	var raw map[string]any
	if err := json.Unmarshal(standardizedPolicy, &raw); err != nil {
		return "", unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, constants.MsgACLPolicyInvalidJSON)
	}

	if err := normalizeRawACLRules(raw); err != nil {
		return "", err
	}

	normalized, marshalErr := json.MarshalIndent(raw, "", "  ")
	if marshalErr != nil {
		return "", unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, constants.MsgACLPolicySerializeFailed)
	}

	return string(normalized), nil
}

func standardizeACLPolicyJSON(policyJSON string) ([]byte, error) {
	ast, err := hujson.Parse([]byte(policyJSON))
	if err != nil {
		return nil, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, constants.MsgACLPolicyInvalidJSON)
	}

	ast.Standardize()
	return ast.Pack(), nil
}

func normalizeRawACLRules(raw map[string]any) error {
	aclsRaw, ok := raw["acls"]
	if !ok {
		return nil
	}

	acls, ok := aclsRaw.([]any)
	if !ok {
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, constants.MsgACLMustBeArray)
	}

	for ruleIndex, aclRaw := range acls {
		aclRule, ok := aclRaw.(map[string]any)
		if !ok {
			return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, fmt.Sprintf(constants.MsgACLRuleFormatInvalid, ruleIndex+1))
		}

		sourcesRaw, hasSources := aclRule["src"]
		if hasSources {
			sources, ok := sourcesRaw.([]any)
			if !ok {
				return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, fmt.Sprintf(constants.MsgACLRuleSrcMustBeStrArray, ruleIndex+1))
			}

			normalizedSources := make([]any, 0, len(sources))
			for _, sourceRaw := range sources {
				source, ok := sourceRaw.(string)
				if !ok {
					return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, fmt.Sprintf(constants.MsgACLRuleSrcMustBeStrings, ruleIndex+1))
				}

				trimmed := strings.TrimSpace(source)
				if trimmed == "" {
					return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, fmt.Sprintf(constants.MsgACLRuleEmptySource, ruleIndex+1))
				}
				normalizedSources = append(normalizedSources, trimmed)
			}
			aclRule["src"] = normalizedSources
		}

		destinationsRaw, hasDestinations := aclRule["dst"]
		if !hasDestinations {
			continue
		}

		destinations, ok := destinationsRaw.([]any)
		if !ok {
			return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, fmt.Sprintf(constants.MsgACLRuleDstMustBeStrArray, ruleIndex+1))
		}

		normalizedDestinations := make([]any, 0, len(destinations))
		for _, destinationRaw := range destinations {
			destination, ok := destinationRaw.(string)
			if !ok {
				return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, fmt.Sprintf(constants.MsgACLRuleDstMustBeStrings, ruleIndex+1))
			}

			normalizedDestination, err := normalizeACLDestination(destination)
			if err != nil {
				return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, fmt.Sprintf(constants.MsgACLRuleDstFormatInvalid, ruleIndex+1, strings.TrimSpace(destination)))
			}
			normalizedDestinations = append(normalizedDestinations, normalizedDestination)
		}
		aclRule["dst"] = normalizedDestinations
	}

	return nil
}

func normalizeACLDestination(destination string) (string, error) {
	trimmed := strings.TrimSpace(destination)
	if trimmed == "" {
		return "", unifyerror.WrongParam("destination")
	}

	switch {
	case strings.HasPrefix(trimmed, "["):
		if strings.Contains(trimmed, "]:") {
			return trimmed, nil
		}
		return trimmed + ":*", nil
	case strings.HasPrefix(trimmed, "group:"),
		strings.HasPrefix(trimmed, "tag:"),
		strings.HasPrefix(trimmed, "autogroup:"):
		if hasExplicitACLPort(trimmed) {
			return trimmed, nil
		}
		return trimmed + ":*", nil
	case strings.Count(trimmed, ":") == 0:
		return trimmed + ":*", nil
	default:
		return trimmed, nil
	}
}

func hasExplicitACLPort(destination string) bool {
	lastColon := strings.LastIndex(destination, ":")
	if lastColon == -1 || lastColon == len(destination)-1 {
		return false
	}

	return isACLPortExpression(destination[lastColon+1:])
}

func isACLPortExpression(value string) bool {
	part := strings.TrimSpace(value)
	if part == "" {
		return false
	}
	if part == "*" {
		return true
	}
	if strings.Contains(part, ",") {
		segments := strings.Split(part, ",")
		if len(segments) == 0 {
			return false
		}
		for _, segment := range segments {
			if !isACLPortExpression(segment) {
				return false
			}
		}
		return true
	}
	if strings.Contains(part, "-") {
		bounds := strings.Split(part, "-")
		if len(bounds) != 2 {
			return false
		}
		start, err := strconv.Atoi(strings.TrimSpace(bounds[0]))
		if err != nil || start < 0 || start > 65535 {
			return false
		}
		end, err := strconv.Atoi(strings.TrimSpace(bounds[1]))
		if err != nil || end < 0 || end > 65535 || end < start {
			return false
		}
		return true
	}

	port, err := strconv.Atoi(part)
	return err == nil && port >= 0 && port <= 65535
}

func wrapACLPolicyApplyError(err error) error {
	if err == nil {
		return nil
	}

	return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, constants.MsgACLPolicyFormatInvalid)
}

// GetParsedRules returns ACL rules with resolved groups and hosts for frontend display
func (s *aclService) GetParsedRules(actorUserID uint) ([]model.ParsedACLRule, error) {
	return s.GetParsedRulesWithContext(context.Background(), actorUserID)
}

func (s *aclService) GetParsedRulesWithContext(ctx context.Context, actorUserID uint) ([]model.ParsedACLRule, error) {
	policy, err := s.GetPolicyWithContext(ctx, actorUserID)
	if err != nil {
		return nil, err
	}

	var parsedRules []model.ParsedACLRule
	for i, rule := range policy.ACLs {
		name := ""
		if rule.HaMeta != nil {
			name = rule.HaMeta.Name
		}

		// Resolve sources
		resolvedSources := s.resolveSources(rule.Src, policy.Groups)

		// Resolve destinations
		resolvedDests := s.resolveDestinations(rule.Dst, policy.Hosts)

		parsedRules = append(parsedRules, model.ParsedACLRule{
			ID:              uint(i + 1),
			Name:            name,
			Action:          rule.Action,
			Sources:         rule.Src,
			Destinations:    rule.Dst,
			ResolvedSources: resolvedSources,
			ResolvedDests:   resolvedDests,
		})
	}

	return parsedRules, nil
}

// resolveSources resolves source patterns to actual user/group names
func (s *aclService) resolveSources(sources []string, groups map[string][]string) []string {
	var resolved []string
	for _, src := range sources {
		if strings.HasPrefix(src, "group:") {
			// It's a group reference
			if members, ok := groups[src]; ok {
				resolved = append(resolved, members...)
			} else {
				resolved = append(resolved, src)
			}
		} else {
			resolved = append(resolved, src)
		}
	}
	return resolved
}

// resolveDestinations resolves destination patterns to actual IP addresses
func (s *aclService) resolveDestinations(destinations []string, hosts map[string]string) []string {
	var resolved []string
	for _, dst := range destinations {
		hostPart := dst
		portPart := ""
		if lastColon := strings.LastIndex(dst, ":"); lastColon > 0 && lastColon < len(dst)-1 {
			hostPart = dst[:lastColon]
			portPart = dst[lastColon+1:]
		}

		if ip, ok := hosts[hostPart]; ok {
			if portPart != "" {
				resolved = append(resolved, ip+":"+portPart)
			} else {
				resolved = append(resolved, ip)
			}
		} else {
			resolved = append(resolved, dst)
		}
	}
	return resolved
}

// SyncResourcesAsHosts syncs all resources to ACL hosts
func (s *aclService) SyncResourcesAsHosts(actorUserID uint) error {
	return s.SyncResourcesAsHostsWithContext(context.Background(), actorUserID)
}

// SyncResourcesFromPolicy imports host aliases declared in the live policy into
// the panel's resource table.
//
// This is the reverse of SyncResourcesAsHosts and is always an explicit action:
// silently importing would resurrect hosts an operator deleted from the panel,
// because the policy still mentions them.
func (s *aclService) SyncResourcesFromPolicy(ctx context.Context, actorUserID uint) error {
	if err := RequirePermission(actorUserID, constants.PermACLPolicyUpdate); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	policy, err := s.GetPolicyWithContext(ctx, actorUserID)
	if err != nil {
		return err
	}

	for name, target := range policy.Hosts {
		name = strings.TrimSpace(name)
		target = strings.TrimSpace(target)
		if name == "" || target == "" {
			continue
		}
		if err := ResourceService.UpsertFromPolicy(name, target, actorUserID); err != nil {
			return err
		}
	}
	return nil
}

func (s *aclService) SyncResourcesAsHostsWithContext(ctx context.Context, actorUserID uint) error {
	if err := RequirePermission(actorUserID, constants.PermACLPolicyUpdate); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Get current policy
	policy, err := s.GetPolicyWithContext(ctx, actorUserID)
	if err != nil {
		return err
	}

	// Get all resources
	hosts, err := ResourceService.GetAllAsHosts()
	if err != nil {
		return err
	}

	if policy.Hosts == nil {
		policy.Hosts = make(map[string]string)
	}

	for name, ip := range hosts {
		policy.Hosts[name] = ip
	}

	return s.UpdatePolicyWithContext(ctx, actorUserID, policy, "")
}

// AddRule adds a new ACL rule
func (s *aclService) AddRule(actorUserID uint, name string, sources []string, destinations []string, action string) error {
	return s.AddRuleWithContext(context.Background(), actorUserID, name, sources, destinations, action)
}

func (s *aclService) AddRuleWithContext(ctx context.Context, actorUserID uint, name string, sources []string, destinations []string, action string) error {
	if err := RequirePermission(actorUserID, constants.PermACLPolicyUpdate); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	policy, err := s.GetPolicyWithContext(ctx, actorUserID)
	if err != nil {
		return err
	}

	newRule := model.ACLRule{
		HaMeta: &model.ACLRuleMeta{
			Name: name,
			Open: false,
		},
		Action: action,
		Src:    sources,
		Dst:    destinations,
	}

	policy.ACLs = append(policy.ACLs, newRule)
	return s.UpdatePolicyWithContext(ctx, actorUserID, policy, "")
}

// UpdateRule updates an existing ACL rule by index
func (s *aclService) UpdateRuleByIndex(actorUserID uint, index int, name string, sources []string, destinations []string, action string) error {
	return s.UpdateRuleByIndexWithContext(context.Background(), actorUserID, index, name, sources, destinations, action)
}

func (s *aclService) UpdateRuleByIndexWithContext(ctx context.Context, actorUserID uint, index int, name string, sources []string, destinations []string, action string) error {
	if err := RequirePermission(actorUserID, constants.PermACLPolicyUpdate); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	policy, err := s.GetPolicyWithContext(ctx, actorUserID)
	if err != nil {
		return err
	}

	if index < 0 || index >= len(policy.ACLs) {
		return unifyerror.WrongParam("rule index")
	}

	policy.ACLs[index] = model.ACLRule{
		HaMeta: &model.ACLRuleMeta{
			Name: name,
			Open: false,
		},
		Action: action,
		Proto:  policy.ACLs[index].Proto,
		Src:    sources,
		Dst:    destinations,
	}

	return s.UpdatePolicyWithContext(ctx, actorUserID, policy, "")
}

// DeleteRuleByIndex deletes an ACL rule by index
func (s *aclService) DeleteRuleByIndex(actorUserID uint, index int) error {
	return s.DeleteRuleByIndexWithContext(context.Background(), actorUserID, index)
}

func (s *aclService) DeleteRuleByIndexWithContext(ctx context.Context, actorUserID uint, index int) error {
	if err := RequirePermission(actorUserID, constants.PermACLPolicyUpdate); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	policy, err := s.GetPolicyWithContext(ctx, actorUserID)
	if err != nil {
		return err
	}

	if index < 0 || index >= len(policy.ACLs) {
		return unifyerror.WrongParam("rule index")
	}

	policy.ACLs = append(policy.ACLs[:index], policy.ACLs[index+1:]...)
	return s.UpdatePolicyWithContext(ctx, actorUserID, policy, "")
}

// ACL Policy Management (Version history)

func (s *aclService) Generate(actorUserID uint) (*model.ACLPolicy, error) {
	return s.GenerateWithContext(context.Background(), actorUserID)
}

func (s *aclService) GenerateWithContext(ctx context.Context, actorUserID uint) (*model.ACLPolicy, error) {
	if err := RequirePermission(actorUserID, constants.PermACLPolicyUpdate); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Get current policy from Headscale
	policy, err := s.GetPolicyWithContext(ctx, actorUserID)
	if err != nil {
		return nil, err
	}

	// Sync resources as hosts
	hosts, _ := ResourceService.GetAllAsHosts()
	if policy.Hosts == nil {
		policy.Hosts = make(map[string]string)
	}
	for name, ip := range hosts {
		policy.Hosts[name] = ip
	}

	// Build ACL groups from panel roles.
	//
	// Roles, not a separate "groups" table: a second grouping concept would
	// drift from the one that actually decides permissions, and an operator
	// would have to maintain the same membership twice.
	groups, groupErr := policyGroupsFromRoles(ctx)
	if groupErr == nil && len(groups) > 0 {
		if policy.Groups == nil {
			policy.Groups = make(map[string][]string)
		}
		for name, members := range groups {
			policy.Groups[name] = members
		}
	}

	contentBytes, marshalErr := json.MarshalIndent(policy, "", "  ")
	if marshalErr != nil {
		return nil, unifyerror.ServerError(marshalErr)
	}

	var lastVersion model.ACLPolicy
	newVersion := 1
	if err := model.DB.Order("version desc").First(&lastVersion).Error; err == nil {
		newVersion = lastVersion.Version + 1
	}

	aclPolicy := &model.ACLPolicy{
		Version:   newVersion,
		Content:   string(contentBytes),
		CreatedBy: actorUserID,
	}

	if err := model.DB.Create(aclPolicy).Error; err != nil {
		return nil, unifyerror.DbError(err)
	}

	return aclPolicy, nil
}

func (s *aclService) ListPolicies(actorUserID uint, page, pageSize int) ([]model.ACLPolicy, int64, error) {
	if err := RequirePermission(actorUserID, constants.PermACLPolicyRead); err != nil {
		return nil, 0, err
	}

	var policies []model.ACLPolicy
	var total int64

	db := model.DB.Model(&model.ACLPolicy{})
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, unifyerror.DbError(err)
	}

	if err := db.Order("version desc").Offset((page - 1) * pageSize).Limit(pageSize).Find(&policies).Error; err != nil {
		return nil, 0, unifyerror.DbError(err)
	}

	return policies, total, nil
}

func (s *aclService) Apply(actorUserID uint, id uint) error {
	return s.ApplyWithContext(context.Background(), actorUserID, id)
}

func (s *aclService) ApplyWithContext(ctx context.Context, actorUserID uint, id uint) error {
	if err := RequirePermission(actorUserID, constants.PermACLPolicyUpdate); err != nil {
		return err
	}

	var policy model.ACLPolicy
	if err := model.DB.First(&policy, id).Error; err != nil {
		return unifyerror.DbError(err)
	}

	return s.SetPolicyRawWithContext(ctx, actorUserID, policy.Content)
}
