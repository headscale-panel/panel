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

package config

import (
	"fmt"
	"sort"
	"strings"
)

// Change is one field the merge intends to write.
type Change struct {
	Key       string    `json:"key"`
	From      any       `json:"from"`
	To        any       `json:"to"`
	Rule      FieldRule `json:"-"`
	Bootstrap bool      `json:"bootstrap"`
}

// MergeResult reports what a merge did.
type MergeResult struct {
	Document *Document `json:"-"`
	Changes  []Change  `json:"changes"`
	// Preserved lists top-level keys the panel does not model, which the merge
	// left untouched. Surfacing them is how an operator can see that the panel is
	// not silently owning their whole file.
	Preserved []string `json:"preserved"`
	// Blocked lists keys a caller tried to write but may not, with the reason.
	Blocked []BlockedWrite `json:"blocked"`
}

// BlockedWrite explains why a value was not applied.
type BlockedWrite struct {
	Key    string `json:"key"`
	Reason string `json:"reason"`
}

// MergeOptions controls how strict the merge is.
type MergeOptions struct {
	// Bootstrap allows ReadOnly fields whose policy is BootstrapIfMissing to be
	// created when absent. Only the HSBootstrap flow sets this.
	Bootstrap bool
	// OwnershipMode is "managed" or "observed". In observed mode the merge
	// produces the document but no Managed value is applied, so an operator can
	// see the panel's opinion without it overwriting hand edits.
	OwnershipObserved bool
}

// Merge applies desired values to a document.
//
// desired is a dotted-key map. Every key is checked against the registry:
//
//   - Managed keys are written.
//   - ReadOnly keys are refused unless Bootstrap is set, the field is absent and
//     its policy permits creation.
//   - Unknown keys are refused. Silently writing them would let a caller inject
//     arbitrary YAML into a file headscale parses.
//
// Keys not mentioned in desired are never touched, which is what preserves both
// comments and settings the panel does not model.
func Merge(base *Document, desired map[string]any, opts MergeOptions) (*MergeResult, error) {
	if base == nil {
		base = NewDocument()
	}

	// Work on a copy so a failed merge cannot half-apply.
	doc := base.Clone()
	result := &MergeResult{Document: doc}

	keys := make([]string, 0, len(desired))
	for key := range desired {
		keys = append(keys, key)
	}
	// Deterministic order keeps the resulting diff stable between saves.
	sort.Strings(keys)

	for _, key := range keys {
		rule, ok := Lookup(key)
		if !ok {
			result.Blocked = append(result.Blocked, BlockedWrite{
				Key:    key,
				Reason: "this key is not in the panel's registry, so the panel will not write it",
			})
			continue
		}

		value := desired[key]
		exists := doc.Has(key)
		existing, _ := doc.Get(key)

		switch rule.Owner {
		case Managed:
			if opts.OwnershipObserved {
				// Observed mode reports the intended value without applying it.
				if !equalValue(existing, value) {
					result.Changes = append(result.Changes, Change{
						Key: key, From: existing, To: value, Rule: rule,
					})
				}
				continue
			}

		case ReadOnly:
			if !opts.Bootstrap {
				result.Blocked = append(result.Blocked, BlockedWrite{
					Key:    key,
					Reason: "read-only: only the bootstrap flow may write this field",
				})
				continue
			}
			if rule.Bootstrap != BootstrapIfMissing {
				result.Blocked = append(result.Blocked, BlockedWrite{
					Key:    key,
					Reason: "bootstrap will not invent this value; set it by hand",
				})
				continue
			}
			if exists {
				// Bootstrap repairs a missing file; it does not overwrite a value an
				// operator already chose.
				continue
			}

		default:
			result.Blocked = append(result.Blocked, BlockedWrite{
				Key:    key,
				Reason: "passthrough field, not writable",
			})
			continue
		}

		if exists && equalValue(existing, value) {
			continue
		}

		if err := doc.Set(key, value); err != nil {
			return nil, fmt.Errorf("setting %s: %w", key, err)
		}
		result.Changes = append(result.Changes, Change{
			Key:       key,
			From:      existing,
			To:        value,
			Rule:      rule,
			Bootstrap: rule.Owner == ReadOnly,
		})
	}

	result.Preserved = unmodelledTopLevelKeys(base.Keys())
	return result, nil
}

// ApplyDelete removes a managed subtree.
//
// Used when a feature is turned off and its block must disappear rather than be
// emptied: an `oidc:` mapping with no fields is not the same as no `oidc:` block
// to headscale, and leaving one behind is how a disabled provider comes back.
func ApplyDelete(base *Document, prefix string) (*Document, error) {
	for _, rule := range Registry {
		if !strings.HasPrefix(rule.Key, prefix+".") && rule.Key != prefix {
			continue
		}
		if rule.Owner == ReadOnly {
			return nil, fmt.Errorf("refusing to delete %s: it contains read-only keys", prefix)
		}
	}

	doc := base.Clone()
	doc.Delete(prefix)
	return doc, nil
}

// unmodelledTopLevelKeys lists top-level keys the registry says nothing about.
func unmodelledTopLevelKeys(keys []string) []string {
	out := make([]string, 0, len(keys))
	for _, key := range keys {
		modelled := false
		for _, rule := range Registry {
			if rule.Key == key || strings.HasPrefix(rule.Key, key+".") {
				modelled = true
				break
			}
		}
		if !modelled {
			out = append(out, key)
		}
	}
	sort.Strings(out)
	return out
}

// equalValue compares two decoded YAML values.
func equalValue(a, b any) bool {
	switch left := a.(type) {
	case []string:
		right, ok := b.([]string)
		if !ok || len(left) != len(right) {
			return false
		}
		for i := range left {
			if left[i] != right[i] {
				return false
			}
		}
		return true

	case map[string]any:
		right, ok := b.(map[string]any)
		if !ok || len(left) != len(right) {
			return false
		}
		for key, value := range left {
			if !equalValue(value, right[key]) {
				return false
			}
		}
		return true

	case int:
		switch right := b.(type) {
		case int:
			return left == right
		case int64:
			return int64(left) == right
		}
		return false

	case nil:
		return b == nil

	default:
		return a == b
	}
}
