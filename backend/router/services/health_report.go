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
	"context"
	"headscale-panel/model"
	"headscale-panel/pkg/headscale"
	"headscale-panel/pkg/hsapi"
)

// HealthReport is the aggregated system state shown on the dashboard.
type HealthReport struct {
	Panel     PanelHealth     `json:"panel"`
	Headscale HeadscaleHealth `json:"headscale"`
	Config    ConfigHealth    `json:"config"`
	Identity  IdentityHealth  `json:"identity"`
}

// PanelHealth is the panel's own state.
type PanelHealth struct {
	SchemaVersion int    `json:"schema_version"`
	Version       string `json:"version"`
	Initialized   bool   `json:"initialized"`
}

// HeadscaleHealth is the upstream connection state.
type HeadscaleHealth struct {
	State       string `json:"state"`
	Detail      string `json:"detail,omitempty"`
	Commit      string `json:"commit,omitempty"`
	InBaseline  bool   `json:"in_baseline"`
	BaselineTip string `json:"baseline_commit"`
}

// ConfigHealth reports drift between the panel's model and the live config.
type ConfigHealth struct {
	Configured bool `json:"configured"`
}

// IdentityHealth reports unbound and orphaned identities.
type IdentityHealth struct {
	Unbound  int `json:"unbound_identities"`
	Orphaned int `json:"orphaned_bindings"`
	Tagged   int `json:"tagged_owners"`
}

// SystemHealth assembles the health report.
//
// A dependency being down is reported, never turned into an error: the whole
// point of this endpoint is to describe a degraded system, so failing it would
// remove the only way to see why the system is degraded.
func SystemHealth(ctx context.Context) (*HealthReport, error) {
	report := &HealthReport{
		Panel: PanelHealth{
			SchemaVersion: 0,
			Version:       model.CurrentVersion,
			Initialized:   setupInitialized(),
		},
		Headscale: HeadscaleHealth{
			State:       string(hsapi.StateUnreachable),
			BaselineTip: hsapi.AdaptedHeadscaleCommit,
		},
	}

	if probe, detail := probeCurrentConnection(ctx); probe != nil {
		report.Headscale = HeadscaleHealth{
			State:       string(probe.State),
			Detail:      firstNonEmpty(probe.Detail, detail),
			Commit:      probe.Commit,
			InBaseline:  probe.Baseline == hsapi.BaselineMatch,
			BaselineTip: hsapi.AdaptedHeadscaleCommit,
		}
	}

	report.Config.Configured = headscale.Connected()

	if snap, err := IdentitySnapshot(ctx); err == nil && snap != nil {
		for i := range snap.Identities {
			if snap.Identities[i].Binding == nil && !snap.Identities[i].Tagged {
				report.Identity.Unbound++
			}
			if snap.Identities[i].Tagged {
				report.Identity.Tagged++
			}
		}
	}
	if orphans, err := Network.Orphans(ctx); err == nil {
		report.Identity.Orphaned = len(orphans)
	}

	return report, nil
}

func setupInitialized() bool {
	ok, err := SetupStateService.IsInitialized()
	return err == nil && ok
}

// probeCurrentConnection probes headscale with the current runtime settings.
func probeCurrentConnection(ctx context.Context) (*hsapi.ProbeResult, string) {
	client, err := CurrentHeadscaleClient()
	if err != nil {
		return nil, err.Error()
	}
	result := client.Probe(ctx)
	return &result, ""
}
