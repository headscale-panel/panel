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
