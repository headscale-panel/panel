package services

import (
	"context"
	"encoding/json"
	"headscale-panel/model"
	"headscale-panel/pkg/acl"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"strings"
)

// CanActorAccessIP checks whether the actor (by panel user ID) can reach targetIP
// according to ACL rules. Admin users always have access.
func CanActorAccessIP(ctx context.Context, actorUserID uint, targetIP string) (bool, error) {
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return false, err
	}
	if scope.isAdmin {
		return true, nil
	}

	policy, err := fetchACLPolicyRaw(ctx)
	if err != nil {
		return false, nil
	}

	for _, rule := range policy.ACLs {
		if rule.Action != "accept" {
			continue
		}
		if acl.IsUserInRuleSources(policy, scope.headscaleName, rule) && acl.DoesRuleAllowIP(policy, rule, targetIP) {
			return true, nil
		}
	}
	return false, nil
}

// FilterResourcesByACL filters resources so that non-admin users only see
// resources whose IP they can reach via ACL rules.
func FilterResourcesByACL(ctx context.Context, actorUserID uint, resources []model.Resource) ([]model.Resource, error) {
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, err
	}
	if scope.isAdmin {
		return resources, nil
	}

	policy, err := fetchACLPolicyRaw(ctx)
	if err != nil {
		return []model.Resource{}, nil
	}

	var actorRules []model.ACLRule
	for _, rule := range policy.ACLs {
		if rule.Action != "accept" {
			continue
		}
		if acl.IsUserInRuleSources(policy, scope.headscaleName, rule) {
			actorRules = append(actorRules, rule)
		}
	}

	filtered := make([]model.Resource, 0, len(resources))
	for _, res := range resources {
		ip := res.IPAddress
		for _, rule := range actorRules {
			if acl.DoesRuleAllowIP(policy, rule, ip) {
				filtered = append(filtered, res)
				break
			}
		}
	}
	return filtered, nil
}

// fetchACLPolicyRaw fetches the current ACL policy from Headscale without permission checks.
func fetchACLPolicyRaw(ctx context.Context) (*model.ACLPolicyStructure, error) {
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

	raw := strings.TrimSpace(resp.Policy)
	if raw == "" || strings.EqualFold(raw, "null") {
		return &model.ACLPolicyStructure{}, nil
	}

	var policy model.ACLPolicyStructure
	if err := json.Unmarshal([]byte(raw), &policy); err != nil {
		return nil, err
	}
	return &policy, nil
}
