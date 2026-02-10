package model

import "encoding/json"

// ACLPolicyStructure represents the Headscale/Tailscale ACL policy structure
type ACLPolicyStructure struct {
	Groups    map[string][]string `json:"groups,omitempty"`
	Hosts     map[string]string   `json:"hosts,omitempty"`
	TagOwners map[string][]string `json:"tagOwners,omitempty"`
	ACLs      []ACLRule           `json:"acls,omitempty"`
	SSH       []json.RawMessage   `json:"ssh,omitempty"`
	Tests     []ACLTest           `json:"tests,omitempty"`
}

// ACLRuleMeta contains metadata for an ACL rule
type ACLRuleMeta struct {
	Name string `json:"name"`
	Open bool   `json:"open"`
}

// ACLRule represents a single ACL rule with optional metadata
type ACLRule struct {
	HaMeta *ACLRuleMeta `json:"#ha-meta,omitempty"` // Headscale-admin metadata
	Action string       `json:"action"`             // "accept"
	Src    []string     `json:"src"`
	Dst    []string     `json:"dst"`
}

type ACLTest struct {
	Src    string   `json:"src"`
	Accept []string `json:"accept"`
	Deny   []string `json:"deny"`
}

// AccessResult represents the result of an access check for frontend display
type AccessResult struct {
	Source      string `json:"source"`
	Destination string `json:"destination"`
	Protocol    string `json:"protocol"` // "tcp", "udp", "icmp"
	Port        string `json:"port"`
	Access      string `json:"access"` // "allow", "deny"
}

// ParsedACLRule represents an ACL rule with resolved groups and hosts for frontend display
type ParsedACLRule struct {
	ID              uint     `json:"id"`
	Name            string   `json:"name"`
	Action          string   `json:"action"`
	Sources         []string `json:"sources"`          // Original sources
	Destinations    []string `json:"destinations"`     // Original destinations
	ResolvedSources []string `json:"resolved_sources"` // Resolved user/group names
	ResolvedDests   []string `json:"resolved_dests"`   // Resolved host IPs
}
