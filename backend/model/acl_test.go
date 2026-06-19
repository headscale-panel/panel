// Copyright (C) 2026
// SPDX-License-Identifier: AGPL-3.0-or-later

package model

import (
	"encoding/json"
	"testing"
)

func TestACLPolicyStructureRoundTripsModernPolicyFields(t *testing.T) {
	raw := []byte(`{
  "groups": {"group:ops": ["alice@"]},
  "grants": [],
  "nodeAttrs": [{"target": ["*"], "attr": ["magicdns-aaaa"]}],
  "autoApprovers": {"exitNode": ["tag:exit"]},
  "randomizeClientPort": true,
  "sshTests": [{"src": "alice@", "accept": ["root@server"]}],
  "futurePolicyField": {"enabled": true}
}`)

	var policy ACLPolicyStructure
	if err := json.Unmarshal(raw, &policy); err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(&policy)
	if err != nil {
		t.Fatal(err)
	}

	var got map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &got); err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"grants", "nodeAttrs", "autoApprovers", "randomizeClientPort", "sshTests", "futurePolicyField"} {
		if _, ok := got[field]; !ok {
			t.Fatalf("field %q was lost during round trip: %s", field, encoded)
		}
	}
	if string(got["grants"]) != "[]" {
		t.Fatalf("empty grants must be retained to preserve deny-all semantics, got %s", got["grants"])
	}
}

func TestACLPolicyStructureRetainsEmptyLegacyACLs(t *testing.T) {
	var policy ACLPolicyStructure
	if err := json.Unmarshal([]byte(`{"acls":[]}`), &policy); err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(&policy)
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) != `{"acls":[]}` {
		t.Fatalf("empty ACL deny-all policy changed: %s", encoded)
	}
}
