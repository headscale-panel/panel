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
	v1 "github.com/juanfont/headscale/gen/go/headscale/v1"
	"headscale-panel/model"
	"headscale-panel/pkg/acl"
	"headscale-panel/pkg/unifyerror"
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
	if policy.ACLs == nil && policy.Grants == nil {
		return true, nil
	}

	for _, rule := range policy.ACLs {
		if rule.Action != "accept" {
			continue
		}
		for name := range scope.headscaleNames {
			if acl.IsUserInRuleSources(policy, name, rule) && acl.DoesRuleAllowIP(policy, rule, targetIP) {
				return true, nil
			}
		}
	}
	for _, grant := range policy.Grants {
		for name := range scope.headscaleNames {
			if acl.IsUserInGrantSources(policy, name, grant) && acl.DoesGrantAllowIP(policy, grant, targetIP) {
				return true, nil
			}
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
	if policy.ACLs == nil && policy.Grants == nil {
		return resources, nil
	}

	var actorRules []model.ACLRule
	for _, rule := range policy.ACLs {
		if rule.Action != "accept" {
			continue
		}
		for name := range scope.headscaleNames {
			if acl.IsUserInRuleSources(policy, name, rule) {
				actorRules = append(actorRules, rule)
				break
			}
		}
	}
	var actorGrants []model.GrantRule
	for _, grant := range policy.Grants {
		if !acl.GrantHasNetworkAccess(grant) {
			continue
		}
		for name := range scope.headscaleNames {
			if acl.IsUserInGrantSources(policy, name, grant) {
				actorGrants = append(actorGrants, grant)
				break
			}
		}
	}

	filtered := make([]model.Resource, 0, len(resources))
	for _, res := range resources {
		ip := res.IPAddress
		allowed := false
		for _, rule := range actorRules {
			if acl.DoesRuleAllowIP(policy, rule, ip) {
				allowed = true
				break
			}
		}
		if !allowed {
			for _, grant := range actorGrants {
				if acl.DoesGrantAllowIP(policy, grant, ip) {
					allowed = true
					break
				}
			}
		}
		if allowed {
			filtered = append(filtered, res)
		}
	}
	return filtered, nil
}

// fetchACLPolicyRaw fetches the current ACL policy from Headscale without permission checks.
func fetchACLPolicyRaw(ctx context.Context) (*model.ACLPolicyStructure, error) {
	client, err := headscaleServiceClient()
	if err != nil {
		return nil, unifyerror.GRPCError(err)
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, grpcErr := client.GetPolicy(queryCtx, &v1.GetPolicyRequest{})
	if grpcErr != nil {
		return nil, unifyerror.GRPCError(grpcErr)
	}

	raw := strings.TrimSpace(resp.Policy)
	if raw == "" || strings.EqualFold(raw, "null") {
		return &model.ACLPolicyStructure{}, nil
	}

	var policy model.ACLPolicyStructure
	if err := json.Unmarshal([]byte(raw), &policy); err != nil {
		return nil, unifyerror.ServerError(err)
	}
	return &policy, nil
}
