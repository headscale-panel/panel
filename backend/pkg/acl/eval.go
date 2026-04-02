package acl

import (
	"headscale-panel/model"
	"net/netip"
	"strings"
)

// MatchUserToMember checks if a Headscale user name matches an ACL member pattern.
// Member patterns: "user@", "user@domain.com", "email@domain.com", etc.
func MatchUserToMember(userName string, member string) bool {
	memberClean := strings.TrimSuffix(member, "@")
	memberBase := strings.Split(memberClean, "@")[0]
	userNameLower := strings.ToLower(userName)
	memberBaseLower := strings.ToLower(memberBase)

	if userNameLower == memberBaseLower {
		return true
	}

	if strings.HasPrefix(memberBaseLower, userNameLower+"-") || strings.HasPrefix(memberBaseLower, userNameLower+"_") {
		return true
	}

	if strings.Contains(memberBaseLower, userNameLower) && len(userNameLower) >= 3 {
		return true
	}

	if strings.Contains(userNameLower, memberBaseLower) && len(memberBaseLower) >= 3 {
		return true
	}

	return false
}

// GetGroupMembers returns the member patterns that belong to a given ACL group.
func GetGroupMembers(policy *model.ACLPolicyStructure, groupName string) []string {
	if policy == nil {
		return nil
	}
	members, ok := policy.Groups[groupName]
	if !ok {
		return nil
	}
	return members
}

// IsUserInACLSource checks if the given Headscale user name is matched by an ACL source pattern.
// Source can be: "*", "group:xxx", or a user pattern like "user@".
func IsUserInACLSource(policy *model.ACLPolicyStructure, userName string, src string) bool {
	if src == "*" {
		return true
	}
	if strings.HasPrefix(src, "group:") {
		members := GetGroupMembers(policy, src)
		for _, member := range members {
			if MatchUserToMember(userName, member) {
				return true
			}
		}
		return false
	}
	return MatchUserToMember(userName, src)
}

// IsUserInRuleSources checks if the given user matches any source in an ACL rule.
func IsUserInRuleSources(policy *model.ACLPolicyStructure, userName string, rule model.ACLRule) bool {
	for _, src := range rule.Src {
		if IsUserInACLSource(policy, userName, src) {
			return true
		}
	}
	return false
}

// IPMatchesCIDR checks if an IP address (in CIDR notation like "10.0.0.1/32") falls within a CIDR range.
func IPMatchesCIDR(resourceIP string, cidr string) bool {
	resAddr, err := netip.ParseAddr(strings.Split(resourceIP, "/")[0])
	if err != nil {
		return false
	}

	if strings.Contains(cidr, "/") {
		prefix, err := netip.ParsePrefix(cidr)
		if err != nil {
			return false
		}
		return prefix.Contains(resAddr)
	}

	targetAddr, err := netip.ParseAddr(cidr)
	if err != nil {
		return false
	}
	return resAddr == targetAddr
}

// DoesRuleAllowIP checks if any destination in an ACL rule covers the given IP.
// Destination formats: "*:*", "*", "group:xxx:*", "hostname:port", "ip:port", "ip/cidr:port", etc.
func DoesRuleAllowIP(policy *model.ACLPolicyStructure, rule model.ACLRule, targetIP string) bool {
	for _, dst := range rule.Dst {
		if doesDstMatchIP(policy, dst, targetIP) {
			return true
		}
	}
	return false
}

func doesDstMatchIP(policy *model.ACLPolicyStructure, dst string, targetIP string) bool {
	if dst == "*:*" || dst == "*" {
		return true
	}

	if strings.HasPrefix(dst, "group:") {
		return false
	}

	target := dst
	if idx := strings.LastIndex(dst, ":"); idx >= 0 {
		candidate := dst[:idx]
		if candidate != "" {
			target = candidate
		}
	}

	if policy != nil && policy.Hosts != nil {
		if hostIP, ok := policy.Hosts[target]; ok {
			if IPMatchesCIDR(targetIP, hostIP) {
				return true
			}
		}
	}

	if IPMatchesCIDR(targetIP, target) {
		return true
	}

	return false
}

// ResolveACLSourceUsers returns all Headscale user names that match the sources of a rule.
func ResolveACLSourceUsers(policy *model.ACLPolicyStructure, rule model.ACLRule, allUserNames []string) []string {
	var matched []string
	for _, name := range allUserNames {
		if IsUserInRuleSources(policy, name, rule) {
			matched = append(matched, name)
		}
	}
	return matched
}

// GetUserDevices returns device IDs belonging to users matching the given group's members.
func GetUserDevices(policy *model.ACLPolicyStructure, groupName string, userToDevices map[string][]string) []string {
	members := GetGroupMembers(policy, groupName)
	if members == nil {
		return nil
	}
	var deviceIDs []string
	for _, member := range members {
		for userName, devices := range userToDevices {
			if MatchUserToMember(userName, member) {
				deviceIDs = append(deviceIDs, devices...)
			}
		}
	}
	return deviceIDs
}
