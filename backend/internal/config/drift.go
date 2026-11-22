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
	"sort"
)

// Drift is one field whose file value differs from the panel's intended value.
type Drift struct {
	Key      string `json:"key"`
	InFile   any    `json:"in_file"`
	Expected any    `json:"expected"`
	// Secret marks a value whose contents must not be shown, only its presence.
	Secret bool `json:"secret"`
}

// DriftReport is what a reconcile pass found.
type DriftReport struct {
	Drift   []Drift  `json:"drift"`
	Missing []string `json:"missing"`
	// Unmodelled lists top-level keys the panel leaves alone. They are reported so
	// an operator can see the panel is not claiming to own the whole file.
	Unmodelled []string `json:"unmodelled"`
}

// HasDrift reports whether anything differs.
func (r *DriftReport) HasDrift() bool {
	return r != nil && (len(r.Drift) > 0 || len(r.Missing) > 0)
}

// DetectDrift compares a document against desired managed values.
//
// Only Managed keys are compared. A ReadOnly key that differs is not drift: the
// panel never claimed to own it, and reporting it would train operators to
// ignore the banner.
func DetectDrift(doc *Document, desired map[string]any) *DriftReport {
	report := &DriftReport{}

	keys := make([]string, 0, len(desired))
	for key := range desired {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	for _, key := range keys {
		rule, ok := Lookup(key)
		if !ok || rule.Owner != Managed {
			continue
		}

		existing, present := doc.Get(key)
		if !present {
			// A managed key the file lacks is written by the next save, so it is
			// reported separately from a value that disagrees.
			report.Missing = append(report.Missing, key)
			continue
		}

		if equalValue(existing, desired[key]) {
			continue
		}

		drift := Drift{Key: key, Expected: desired[key], Secret: rule.Secret}
		if rule.Secret {
			// Compare secrets by presence only. Showing either side would put a
			// credential into the API response, and comparing contents across a
			// hashed store is not reliable anyway.
			drift.InFile = present
			drift.Expected = true
			if present {
				continue
			}
		} else {
			drift.InFile = existing
		}
		report.Drift = append(report.Drift, drift)
	}

	report.Unmodelled = unmodelledTopLevelKeys(doc.Keys())
	return report
}

// SecretPaths returns the registry keys marked secret.
func SecretPaths() []string {
	out := make([]string, 0, 4)
	for _, rule := range Registry {
		if rule.Secret {
			out = append(out, rule.Key)
		}
	}
	return out
}
