package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"headscale-panel/model"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"headscale-panel/pkg/utils/serializer"
	"strconv"
	"strings"
	"sync"
)

type aclService struct {
	mu sync.Mutex
}

var ACLService = &aclService{}

// InitPolicy ensures ACL policy exists in Headscale during startup.
func (s *aclService) InitPolicy() error {
	return s.InitPolicyWithContext(context.Background())
}

func (s *aclService) InitPolicyWithContext(ctx context.Context) error {
	client, err := headscaleServiceClient()
	if err != nil {
		return err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	_, err = client.GetPolicy(queryCtx, &v1.GetPolicyRequest{})
	if err == nil {
		return nil
	}

	// Initialize a minimal policy once so subsequent reads are stable.
	if _, setErr := client.SetPolicy(queryCtx, &v1.SetPolicyRequest{Policy: "{}"}); setErr != nil {
		return err
	}

	_, err = client.GetPolicy(queryCtx, &v1.GetPolicyRequest{})
	return err
}

// GetPolicy retrieves the current ACL policy from Headscale
func (s *aclService) GetPolicy(actorUserID uint) (*model.ACLPolicyStructure, error) {
	return s.GetPolicyWithContext(context.Background(), actorUserID)
}

func (s *aclService) GetPolicyWithContext(ctx context.Context, actorUserID uint) (*model.ACLPolicyStructure, error) {
	if err := RequirePermission(actorUserID, "headscale:acl:view"); err != nil {
		return nil, err
	}

	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, err := client.GetPolicy(queryCtx, &v1.GetPolicyRequest{})
	if err != nil {
		return nil, err
	}

	rawPolicy := strings.TrimSpace(resp.Policy)
	if rawPolicy == "" || strings.EqualFold(rawPolicy, "null") {
		return &model.ACLPolicyStructure{}, nil
	}

	var policy model.ACLPolicyStructure
	if err := json.Unmarshal([]byte(rawPolicy), &policy); err != nil {
		return nil, err
	}

	return &policy, nil
}

// UpdatePolicy updates the ACL policy in Headscale
func (s *aclService) UpdatePolicy(actorUserID uint, policy *model.ACLPolicyStructure) error {
	return s.UpdatePolicyWithContext(context.Background(), actorUserID, policy)
}

func (s *aclService) UpdatePolicyWithContext(ctx context.Context, actorUserID uint, policy *model.ACLPolicyStructure) error {
	if err := RequirePermission(actorUserID, "headscale:acl:update"); err != nil {
		return err
	}

	if err := normalizeACLPolicyStructure(policy); err != nil {
		return err
	}

	client, err := headscaleServiceClient()
	if err != nil {
		return err
	}

	policyBytes, err := json.MarshalIndent(policy, "", "  ")
	if err != nil {
		return err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	_, err = client.SetPolicy(queryCtx, &v1.SetPolicyRequest{
		Policy: string(policyBytes),
	})
	return wrapACLPolicyApplyError(err)
}

// SetPolicyRaw sets the ACL policy from raw JSON string
func (s *aclService) SetPolicyRaw(actorUserID uint, policyJSON string) error {
	return s.SetPolicyRawWithContext(context.Background(), actorUserID, policyJSON)
}

func (s *aclService) SetPolicyRawWithContext(ctx context.Context, actorUserID uint, policyJSON string) error {
	if err := RequirePermission(actorUserID, "headscale:acl:update"); err != nil {
		return err
	}

	normalizedPolicyJSON, err := normalizeRawACLPolicyJSON(policyJSON)
	if err != nil {
		return err
	}

	client, err := headscaleServiceClient()
	if err != nil {
		return err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	_, err = client.SetPolicy(queryCtx, &v1.SetPolicyRequest{
		Policy: normalizedPolicyJSON,
	})
	return wrapACLPolicyApplyError(err)
}

func normalizeACLPolicyStructure(policy *model.ACLPolicyStructure) error {
	if policy == nil {
		return serializer.NewError(serializer.CodeParamErr, "ACL 策略不能为空", nil)
	}

	for ruleIndex := range policy.ACLs {
		sources := make([]string, 0, len(policy.ACLs[ruleIndex].Src))
		for _, source := range policy.ACLs[ruleIndex].Src {
			trimmed := strings.TrimSpace(source)
			if trimmed == "" {
				return serializer.NewError(
					serializer.CodeParamErr,
					fmt.Sprintf("ACL 规则第 %d 条包含空的来源标识", ruleIndex+1),
					nil,
				)
			}
			sources = append(sources, trimmed)
		}
		policy.ACLs[ruleIndex].Src = sources

		destinations := make([]string, 0, len(policy.ACLs[ruleIndex].Dst))
		for _, destination := range policy.ACLs[ruleIndex].Dst {
			normalizedDestination, err := normalizeACLDestination(destination)
			if err != nil {
				return serializer.NewError(
					serializer.CodeParamErr,
					fmt.Sprintf("ACL 规则第 %d 条的目标 %q 格式不正确", ruleIndex+1, strings.TrimSpace(destination)),
					err,
				)
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
		return "", serializer.NewError(serializer.CodeParamErr, "ACL 策略不能为空", nil)
	}

	var raw map[string]any
	if err := json.Unmarshal([]byte(trimmed), &raw); err != nil {
		return "", serializer.NewError(serializer.CodeParamErr, "ACL 策略不是合法的 JSON", err)
	}

	if err := normalizeRawACLRules(raw); err != nil {
		return "", err
	}

	normalized, err := json.MarshalIndent(raw, "", "  ")
	if err != nil {
		return "", serializer.NewError(serializer.CodeParamErr, "ACL 策略序列化失败", err)
	}

	return string(normalized), nil
}

func normalizeRawACLRules(raw map[string]any) error {
	aclsRaw, ok := raw["acls"]
	if !ok {
		return nil
	}

	acls, ok := aclsRaw.([]any)
	if !ok {
		return serializer.NewError(serializer.CodeParamErr, "`acls` 必须是数组", nil)
	}

	for ruleIndex, aclRaw := range acls {
		aclRule, ok := aclRaw.(map[string]any)
		if !ok {
			return serializer.NewError(
				serializer.CodeParamErr,
				fmt.Sprintf("ACL 规则第 %d 条格式不正确", ruleIndex+1),
				nil,
			)
		}

		sourcesRaw, hasSources := aclRule["src"]
		if hasSources {
			sources, ok := sourcesRaw.([]any)
			if !ok {
				return serializer.NewError(
					serializer.CodeParamErr,
					fmt.Sprintf("ACL 规则第 %d 条的 `src` 必须是字符串数组", ruleIndex+1),
					nil,
				)
			}

			normalizedSources := make([]any, 0, len(sources))
			for _, sourceRaw := range sources {
				source, ok := sourceRaw.(string)
				if !ok {
					return serializer.NewError(
						serializer.CodeParamErr,
						fmt.Sprintf("ACL 规则第 %d 条的 `src` 必须全部为字符串", ruleIndex+1),
						nil,
					)
				}

				trimmed := strings.TrimSpace(source)
				if trimmed == "" {
					return serializer.NewError(
						serializer.CodeParamErr,
						fmt.Sprintf("ACL 规则第 %d 条包含空的来源标识", ruleIndex+1),
						nil,
					)
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
			return serializer.NewError(
				serializer.CodeParamErr,
				fmt.Sprintf("ACL 规则第 %d 条的 `dst` 必须是字符串数组", ruleIndex+1),
				nil,
			)
		}

		normalizedDestinations := make([]any, 0, len(destinations))
		for _, destinationRaw := range destinations {
			destination, ok := destinationRaw.(string)
			if !ok {
				return serializer.NewError(
					serializer.CodeParamErr,
					fmt.Sprintf("ACL 规则第 %d 条的 `dst` 必须全部为字符串", ruleIndex+1),
					nil,
				)
			}

			normalizedDestination, err := normalizeACLDestination(destination)
			if err != nil {
				return serializer.NewError(
					serializer.CodeParamErr,
					fmt.Sprintf("ACL 规则第 %d 条的目标 %q 格式不正确", ruleIndex+1, strings.TrimSpace(destination)),
					err,
				)
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
		return "", errors.New("目标不能为空")
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

	return serializer.NewError(serializer.CodeParamErr, "ACL 策略格式不合法，请检查目标地址是否包含端口，例如 group:admin:*", err)
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
		resolvedDests := s.resolveDestinations(rule.Dst, policy.Hosts, policy.Groups)

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
func (s *aclService) resolveDestinations(destinations []string, hosts map[string]string, groups map[string][]string) []string {
	var resolved []string
	for _, dst := range destinations {
		parts := strings.Split(dst, ":")
		if len(parts) >= 1 {
			hostPart := parts[0]
			portPart := ""
			if len(parts) >= 2 {
				portPart = parts[1]
			}

			if ip, ok := hosts[hostPart]; ok {
				if portPart != "" {
					resolved = append(resolved, ip+":"+portPart)
				} else {
					resolved = append(resolved, ip)
				}
			} else if strings.HasPrefix(hostPart, "group:") {
				// group:xxx:* format - means all devices of users in that group
				resolved = append(resolved, dst)
			} else {
				// It's already an IP or other format
				resolved = append(resolved, dst)
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

func (s *aclService) SyncResourcesAsHostsWithContext(ctx context.Context, actorUserID uint) error {
	if err := RequirePermission(actorUserID, "headscale:acl:sync"); err != nil {
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

	return s.UpdatePolicyWithContext(ctx, actorUserID, policy)
}

// AddRule adds a new ACL rule
func (s *aclService) AddRule(actorUserID uint, name string, sources []string, destinations []string, action string) error {
	return s.AddRuleWithContext(context.Background(), actorUserID, name, sources, destinations, action)
}

func (s *aclService) AddRuleWithContext(ctx context.Context, actorUserID uint, name string, sources []string, destinations []string, action string) error {
	if err := RequirePermission(actorUserID, "headscale:acl:update"); err != nil {
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
	return s.UpdatePolicyWithContext(ctx, actorUserID, policy)
}

// UpdateRule updates an existing ACL rule by index
func (s *aclService) UpdateRuleByIndex(actorUserID uint, index int, name string, sources []string, destinations []string, action string) error {
	return s.UpdateRuleByIndexWithContext(context.Background(), actorUserID, index, name, sources, destinations, action)
}

func (s *aclService) UpdateRuleByIndexWithContext(ctx context.Context, actorUserID uint, index int, name string, sources []string, destinations []string, action string) error {
	if err := RequirePermission(actorUserID, "headscale:acl:update"); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	policy, err := s.GetPolicyWithContext(ctx, actorUserID)
	if err != nil {
		return err
	}

	if index < 0 || index >= len(policy.ACLs) {
		return errors.New("规则索引超出范围")
	}

	policy.ACLs[index] = model.ACLRule{
		HaMeta: &model.ACLRuleMeta{
			Name: name,
			Open: false,
		},
		Action: action,
		Src:    sources,
		Dst:    destinations,
	}

	return s.UpdatePolicyWithContext(ctx, actorUserID, policy)
}

// DeleteRuleByIndex deletes an ACL rule by index
func (s *aclService) DeleteRuleByIndex(actorUserID uint, index int) error {
	return s.DeleteRuleByIndexWithContext(context.Background(), actorUserID, index)
}

func (s *aclService) DeleteRuleByIndexWithContext(ctx context.Context, actorUserID uint, index int) error {
	if err := RequirePermission(actorUserID, "headscale:acl:update"); err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	policy, err := s.GetPolicyWithContext(ctx, actorUserID)
	if err != nil {
		return err
	}

	if index < 0 || index >= len(policy.ACLs) {
		return errors.New("规则索引超出范围")
	}

	policy.ACLs = append(policy.ACLs[:index], policy.ACLs[index+1:]...)
	return s.UpdatePolicyWithContext(ctx, actorUserID, policy)
}

// ACL Policy Management (Version history)

func (s *aclService) Generate(actorUserID uint) (*model.ACLPolicy, error) {
	return s.GenerateWithContext(context.Background(), actorUserID)
}

func (s *aclService) GenerateWithContext(ctx context.Context, actorUserID uint) (*model.ACLPolicy, error) {
	if err := RequirePermission(actorUserID, "headscale:acl:generate"); err != nil {
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

	// Build groups from database
	var dbGroups []model.Group
	if err := model.DB.Preload("Users").Find(&dbGroups).Error; err == nil {
		if policy.Groups == nil {
			policy.Groups = make(map[string][]string)
		}
		for _, g := range dbGroups {
			var members []string
			for _, u := range g.Users {
				name := u.HeadscaleName
				if name == "" {
					name = u.Username
				}
				members = append(members, name+"@")
			}
			if len(members) > 0 {
				policy.Groups["group:"+strings.ToLower(g.Name)] = members
			}
		}
	}

	contentBytes, err := json.MarshalIndent(policy, "", "  ")
	if err != nil {
		return nil, err
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
		return nil, serializer.ErrDatabase.WithError(err)
	}

	return aclPolicy, nil
}

func (s *aclService) ListPolicies(actorUserID uint, page, pageSize int) ([]model.ACLPolicy, int64, error) {
	if err := RequirePermission(actorUserID, "headscale:acl:history:list"); err != nil {
		return nil, 0, err
	}

	var policies []model.ACLPolicy
	var total int64

	db := model.DB.Model(&model.ACLPolicy{})
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, serializer.ErrDatabase.WithError(err)
	}

	if err := db.Order("version desc").Offset((page - 1) * pageSize).Limit(pageSize).Find(&policies).Error; err != nil {
		return nil, 0, serializer.ErrDatabase.WithError(err)
	}

	return policies, total, nil
}

func (s *aclService) Apply(actorUserID uint, id uint) error {
	return s.ApplyWithContext(context.Background(), actorUserID, id)
}

func (s *aclService) ApplyWithContext(ctx context.Context, actorUserID uint, id uint) error {
	if err := RequirePermission(actorUserID, "headscale:acl:apply"); err != nil {
		return err
	}

	var policy model.ACLPolicy
	if err := model.DB.First(&policy, id).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}

	return s.SetPolicyRawWithContext(ctx, actorUserID, policy.Content)
}
