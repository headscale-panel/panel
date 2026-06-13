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
	"encoding/json"
	"testing"
)

func TestNormalizeACLDestination(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		in   string
		want string
	}{
		{name: "group gets wildcard port", in: "group:admin", want: "group:admin:*"},
		{name: "tag keeps explicit port", in: "tag:server:443", want: "tag:server:443"},
		{name: "autogroup gets wildcard port", in: "autogroup:self", want: "autogroup:self:*"},
		{name: "host alias gets wildcard port", in: "db-primary", want: "db-primary:*"},
		{name: "host alias keeps explicit port", in: "nas:22", want: "nas:22"},
		{name: "user alias gets wildcard port", in: "alice@", want: "alice@:*"},
		{name: "user alias keeps explicit port", in: "boss@:22", want: "boss@:22"},
		{name: "ipv4 keeps explicit port", in: "100.64.0.1:22", want: "100.64.0.1:22"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, err := normalizeACLDestination(tc.in)
			if err != nil {
				t.Fatalf("normalizeACLDestination(%q) returned error: %v", tc.in, err)
			}
			if got != tc.want {
				t.Fatalf("normalizeACLDestination(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestNormalizeRawACLPolicyJSON(t *testing.T) {
	t.Parallel()

	raw := `{
		"groups": {
			"group:admin": ["alice@"]
		},
		"acls": [
			{
				"action": "accept",
				"src": ["group:admin"],
				"dst": ["group:admin", "db-primary", "alice@"]
			}
		]
	}`

	normalized, err := normalizeRawACLPolicyJSON(raw)
	if err != nil {
		t.Fatalf("normalizeRawACLPolicyJSON returned error: %v", err)
	}

	var parsed struct {
		ACLs []struct {
			Dst []string `json:"dst"`
		} `json:"acls"`
	}
	if err := json.Unmarshal([]byte(normalized), &parsed); err != nil {
		t.Fatalf("normalized JSON should be valid: %v", err)
	}

	if len(parsed.ACLs) != 1 {
		t.Fatalf("expected 1 ACL rule, got %d", len(parsed.ACLs))
	}

	got := parsed.ACLs[0].Dst
	want := []string{"group:admin:*", "db-primary:*", "alice@:*"}
	if len(got) != len(want) {
		t.Fatalf("expected %d dst entries, got %d", len(want), len(got))
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("dst[%d] = %q, want %q", index, got[index], want[index])
		}
	}
}

func TestNormalizeRawACLPolicyJSONSupportsHuJSONComments(t *testing.T) {
	t.Parallel()

	raw := `{
		// Operators can reach tagged services.
		"acls": [
			{
				"action": "accept",
				"src": ["group:ops"],
				"dst": ["tag:service"],
			},
		],
	}`

	normalized, err := normalizeRawACLPolicyJSON(raw)
	if err != nil {
		t.Fatalf("normalizeRawACLPolicyJSON should accept HuJSON comments: %v", err)
	}

	var parsed struct {
		ACLs []struct {
			Dst []string `json:"dst"`
		} `json:"acls"`
	}
	if err := json.Unmarshal([]byte(normalized), &parsed); err != nil {
		t.Fatalf("normalized HuJSON should be valid JSON: %v", err)
	}

	if len(parsed.ACLs) != 1 || len(parsed.ACLs[0].Dst) != 1 {
		t.Fatalf("expected one normalized ACL destination, got %#v", parsed.ACLs)
	}

	if parsed.ACLs[0].Dst[0] != "tag:service:*" {
		t.Fatalf("expected normalized destination to include wildcard port, got %q", parsed.ACLs[0].Dst[0])
	}
}
