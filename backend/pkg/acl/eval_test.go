package acl

import (
	"headscale-panel/model"
	"testing"
)

func TestMatchUserToMember(t *testing.T) {
	tests := []struct {
		name     string
		userName string
		member   string
		want     bool
	}{
		{"exact match", "alice", "alice@", true},
		{"exact match no trailing @", "alice", "alice", true},
		{"email match", "gggxbbb", "gggxbbb@foxmail.com", true},
		{"case insensitive", "Alice", "alice@", true},
		{"prefix dash", "alice", "alice-local@", true},
		{"prefix underscore", "alice", "alice_work@", true},
		{"substring match long user", "alice", "xalicex@", true},
		{"reverse substring", "gggxbbb", "gggxbbb@foxmail.com", true},
		{"no match", "bob", "alice@", false},
		{"short user no substring", "ab", "xabx@", false},
		{"short member no reverse", "alice", "ab@", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := MatchUserToMember(tt.userName, tt.member)
			if got != tt.want {
				t.Errorf("MatchUserToMember(%q, %q) = %v, want %v", tt.userName, tt.member, got, tt.want)
			}
		})
	}
}

func TestGetGroupMembers(t *testing.T) {
	policy := &model.ACLPolicyStructure{
		Groups: map[string][]string{
			"group:devs": {"alice@", "bob@foxmail.com"},
		},
	}

	members := GetGroupMembers(policy, "group:devs")
	if len(members) != 2 {
		t.Fatalf("expected 2 members, got %d", len(members))
	}

	members = GetGroupMembers(policy, "group:ops")
	if len(members) != 0 {
		t.Fatalf("expected 0 members for unknown group, got %d", len(members))
	}

	members = GetGroupMembers(nil, "group:devs")
	if members != nil {
		t.Fatalf("expected nil for nil policy, got %v", members)
	}
}

func TestIsUserInACLSource(t *testing.T) {
	policy := &model.ACLPolicyStructure{
		Groups: map[string][]string{
			"group:devs": {"alice@", "bob@foxmail.com"},
		},
	}

	tests := []struct {
		name     string
		userName string
		src      string
		want     bool
	}{
		{"wildcard", "anyone", "*", true},
		{"group member", "alice", "group:devs", true},
		{"group non-member", "charlie", "group:devs", false},
		{"direct pattern", "alice", "alice@", true},
		{"direct no match", "charlie", "alice@", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsUserInACLSource(policy, tt.userName, tt.src)
			if got != tt.want {
				t.Errorf("IsUserInACLSource(%q, %q) = %v, want %v", tt.userName, tt.src, got, tt.want)
			}
		})
	}
}

func TestIsUserInRuleSources(t *testing.T) {
	policy := &model.ACLPolicyStructure{
		Groups: map[string][]string{
			"group:devs": {"alice@"},
		},
	}
	rule := model.ACLRule{
		Src: []string{"group:devs", "bob@"},
	}

	if !IsUserInRuleSources(policy, "alice", rule) {
		t.Error("alice should match group:devs")
	}
	if !IsUserInRuleSources(policy, "bob", rule) {
		t.Error("bob should match bob@")
	}
	if IsUserInRuleSources(policy, "charlie", rule) {
		t.Error("charlie should not match any source")
	}
}

func TestDoesRuleAllowIP(t *testing.T) {
	policy := &model.ACLPolicyStructure{
		Hosts: map[string]string{
			"myserver": "10.0.0.5/32",
			"subnet":   "192.168.1.0/24",
		},
	}

	tests := []struct {
		name     string
		dst      []string
		targetIP string
		want     bool
	}{
		{"wildcard *:*", []string{"*:*"}, "10.0.0.1/32", true},
		{"wildcard *", []string{"*"}, "10.0.0.1/32", true},
		{"host alias exact", []string{"myserver:*"}, "10.0.0.5/32", true},
		{"host alias no match", []string{"myserver:*"}, "10.0.0.6/32", false},
		{"host alias subnet", []string{"subnet:*"}, "192.168.1.50/32", true},
		{"host alias subnet no match", []string{"subnet:*"}, "192.168.2.1/32", false},
		{"direct IP match", []string{"10.0.0.5:443"}, "10.0.0.5/32", true},
		{"direct IP no match", []string{"10.0.0.6:443"}, "10.0.0.5/32", false},
		{"CIDR match", []string{"10.0.0.0/24:*"}, "10.0.0.5/32", true},
		{"CIDR no match", []string{"10.0.1.0/24:*"}, "10.0.0.5/32", false},
		{"no destinations", []string{}, "10.0.0.1/32", false},
		{"group destination skipped", []string{"group:devs:*"}, "10.0.0.1/32", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rule := model.ACLRule{Dst: tt.dst}
			got := DoesRuleAllowIP(policy, rule, tt.targetIP)
			if got != tt.want {
				t.Errorf("DoesRuleAllowIP(dst=%v, ip=%q) = %v, want %v", tt.dst, tt.targetIP, got, tt.want)
			}
		})
	}
}

func TestIPMatchesCIDR(t *testing.T) {
	tests := []struct {
		name       string
		resourceIP string
		cidr       string
		want       bool
	}{
		{"exact IP match", "10.0.0.5/32", "10.0.0.5", true},
		{"CIDR contains", "10.0.0.5/32", "10.0.0.0/24", true},
		{"CIDR not contains", "10.0.1.5/32", "10.0.0.0/24", false},
		{"bare IP resourceIP", "10.0.0.5", "10.0.0.5", true},
		{"bare IP no match", "10.0.0.5", "10.0.0.6", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IPMatchesCIDR(tt.resourceIP, tt.cidr)
			if got != tt.want {
				t.Errorf("IPMatchesCIDR(%q, %q) = %v, want %v", tt.resourceIP, tt.cidr, got, tt.want)
			}
		})
	}
}
