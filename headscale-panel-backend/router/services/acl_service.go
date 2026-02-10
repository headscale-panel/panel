package services

import (
	"context"
	"encoding/json"
	"errors"
	"headscale-panel/model"
	"headscale-panel/pkg/headscale"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"headscale-panel/pkg/utils/serializer"
	"strings"
)

type aclService struct{}

var ACLService = &aclService{}

// GetPolicy retrieves the current ACL policy from Headscale
func (s *aclService) GetPolicy() (*model.ACLPolicyStructure, error) {
	ctx := context.Background()
	resp, err := headscale.GlobalClient.Service.GetPolicy(ctx, &v1.GetPolicyRequest{})
	if err != nil {
		return nil, err
	}

	var policy model.ACLPolicyStructure
	if err := json.Unmarshal([]byte(resp.Policy), &policy); err != nil {
		return nil, err
	}

	return &policy, nil
}

// UpdatePolicy updates the ACL policy in Headscale
func (s *aclService) UpdatePolicy(policy *model.ACLPolicyStructure) error {
	policyBytes, err := json.MarshalIndent(policy, "", "  ")
	if err != nil {
		return err
	}

	ctx := context.Background()
	_, err = headscale.GlobalClient.Service.SetPolicy(ctx, &v1.SetPolicyRequest{
		Policy: string(policyBytes),
	})
	return err
}

// SetPolicyRaw sets the ACL policy from raw JSON string
func (s *aclService) SetPolicyRaw(policyJSON string) error {
	ctx := context.Background()
	_, err := headscale.GlobalClient.Service.SetPolicy(ctx, &v1.SetPolicyRequest{
		Policy: policyJSON,
	})
	return err
}

// GetParsedRules returns ACL rules with resolved groups and hosts for frontend display
func (s *aclService) GetParsedRules() ([]model.ParsedACLRule, error) {
	policy, err := s.GetPolicy()
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
func (s *aclService) SyncResourcesAsHosts() error {
	// Get current policy
	policy, err := s.GetPolicy()
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

	return s.UpdatePolicy(policy)
}

// AddRule adds a new ACL rule
func (s *aclService) AddRule(name string, sources []string, destinations []string, action string) error {
	policy, err := s.GetPolicy()
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
	return s.UpdatePolicy(policy)
}

// UpdateRule updates an existing ACL rule by index
func (s *aclService) UpdateRuleByIndex(index int, name string, sources []string, destinations []string, action string) error {
	policy, err := s.GetPolicy()
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

	return s.UpdatePolicy(policy)
}

// DeleteRuleByIndex deletes an ACL rule by index
func (s *aclService) DeleteRuleByIndex(index int) error {
	policy, err := s.GetPolicy()
	if err != nil {
		return err
	}

	if index < 0 || index >= len(policy.ACLs) {
		return errors.New("规则索引超出范围")
	}

	policy.ACLs = append(policy.ACLs[:index], policy.ACLs[index+1:]...)
	return s.UpdatePolicy(policy)
}

// ACL Policy Management (Version history)

func (s *aclService) Generate(userID uint) (*model.ACLPolicy, error) {
	// Get current policy from Headscale
	policy, err := s.GetPolicy()
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
		CreatedBy: userID,
	}

	if err := model.DB.Create(aclPolicy).Error; err != nil {
		return nil, serializer.ErrDatabase
	}

	return aclPolicy, nil
}

func (s *aclService) ListPolicies(page, pageSize int) ([]model.ACLPolicy, int64, error) {
	var policies []model.ACLPolicy
	var total int64

	db := model.DB.Model(&model.ACLPolicy{})
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, serializer.ErrDatabase
	}

	if err := db.Order("version desc").Offset((page - 1) * pageSize).Limit(pageSize).Find(&policies).Error; err != nil {
		return nil, 0, serializer.ErrDatabase
	}

	return policies, total, nil
}

func (s *aclService) Apply(id uint) error {
	var policy model.ACLPolicy
	if err := model.DB.First(&policy, id).Error; err != nil {
		return serializer.ErrDatabase
	}

	return s.SetPolicyRaw(policy.Content)
}
