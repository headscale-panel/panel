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
	Groups              map[string][]string        `json:"groups,omitempty"`
	Hosts               map[string]string          `json:"hosts,omitempty"`
	TagOwners           map[string][]string        `json:"tagOwners,omitempty"`
	ACLs                []ACLRule                  `json:"acls,omitempty"`
	Grants              []GrantRule                `json:"grants,omitempty"`
	AutoApprovers       json.RawMessage            `json:"autoApprovers,omitempty"`
	SSH                 []json.RawMessage          `json:"ssh,omitempty"`
	Tests               []ACLTest                  `json:"tests,omitempty"`
	SSHTests            []json.RawMessage          `json:"sshTests,omitempty"`
	NodeAttrs           []NodeAttrRule             `json:"nodeAttrs,omitempty"`
	RandomizeClientPort *bool                      `json:"randomizeClientPort,omitempty"`
	Extra               map[string]json.RawMessage `json:"-"`

	aclsSet   bool
	grantsSet bool
}

// GrantRule is the network/application capability rule recommended by current
// Headscale releases. IP and App remain raw JSON because capability values are
// deliberately extensible and must round-trip without Panel interpreting them.
type GrantRule struct {
	Src []string                   `json:"src"`
	Dst []string                   `json:"dst"`
	IP  json.RawMessage            `json:"ip,omitempty"`
	App map[string]json.RawMessage `json:"app,omitempty"`
	Via []string                   `json:"via,omitempty"`
}

type NodeAttrRule struct {
	Target []string `json:"target"`
	Attr   []string `json:"attr"`
}

// UnmarshalJSON keeps policy extensions that Panel does not understand. This
// prevents a visual edit (or resource sync) from silently deleting new fields
// introduced by Headscale.
func (p *ACLPolicyStructure) UnmarshalJSON(data []byte) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}

	decode := func(name string, dst any) error {
		raw, ok := fields[name]
		if !ok {
			return nil
		}
		delete(fields, name)
		return json.Unmarshal(raw, dst)
	}

	if _, p.aclsSet = fields["acls"]; p.aclsSet {
		// decoded below
	}
	if _, p.grantsSet = fields["grants"]; p.grantsSet {
		// decoded below
	}

	for _, item := range []struct {
		name string
		dst  any
	}{
		{"groups", &p.Groups}, {"hosts", &p.Hosts}, {"tagOwners", &p.TagOwners},
		{"acls", &p.ACLs}, {"grants", &p.Grants}, {"autoApprovers", &p.AutoApprovers},
		{"ssh", &p.SSH}, {"tests", &p.Tests}, {"sshTests", &p.SSHTests},
		{"nodeAttrs", &p.NodeAttrs}, {"randomizeClientPort", &p.RandomizeClientPort},
	} {
		if err := decode(item.name, item.dst); err != nil {
			return err
		}
	}

	p.Extra = fields
	return nil
}

func (p ACLPolicyStructure) MarshalJSON() ([]byte, error) {
	fields := make(map[string]json.RawMessage, len(p.Extra)+11)
	for key, value := range p.Extra {
		fields[key] = value
	}

	put := func(name string, value any, include bool) error {
		if !include {
			return nil
		}
		raw, err := json.Marshal(value)
		if err == nil {
			fields[name] = raw
		}
		return err
	}

	items := []struct {
		name    string
		value   any
		include bool
	}{
		{"groups", p.Groups, p.Groups != nil}, {"hosts", p.Hosts, p.Hosts != nil},
		{"tagOwners", p.TagOwners, p.TagOwners != nil}, {"acls", p.ACLs, p.aclsSet || p.ACLs != nil},
		{"grants", p.Grants, p.grantsSet || p.Grants != nil}, {"autoApprovers", p.AutoApprovers, len(p.AutoApprovers) > 0},
		{"ssh", p.SSH, p.SSH != nil}, {"tests", p.Tests, p.Tests != nil},
		{"sshTests", p.SSHTests, p.SSHTests != nil}, {"nodeAttrs", p.NodeAttrs, p.NodeAttrs != nil},
		{"randomizeClientPort", p.RandomizeClientPort, p.RandomizeClientPort != nil},
	}
	for _, item := range items {
		if err := put(item.name, item.value, item.include); err != nil {
			return nil, err
		}
	}

	return json.Marshal(fields)
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
	Proto  string       `json:"proto,omitempty"`
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
