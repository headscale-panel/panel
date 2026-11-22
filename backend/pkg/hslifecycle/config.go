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

// Package hslifecycle starts, stops and restarts the headscale container.
//
// It is off by default and reports why when it cannot act. That matters more than
// the feature: granting a web application control over a container is a
// deliberate deployment decision, and a silent no-op would leave an operator
// believing a restart happened when it did not.
package hslifecycle

import (
	"regexp"
	"strings"

	"headscale-panel/pkg/conf"
)

// Reason values. Every caller names why it wants a restart so the audit trail
// explains itself.
const (
	ReasonConfigSaved       = "config_saved"
	ReasonBootstrapGenerate = "bootstrap_generate"
	ReasonBootstrapRepair   = "bootstrap_repair"
	ReasonBootstrapResync   = "bootstrap_resync"
	ReasonIDPEnabled        = "idp_enabled"
	ReasonIDPDisabled       = "idp_disabled"
	ReasonIdentitySourceSet = "identity_source_changed"
	ReasonDerpSaved         = "derp_saved"
	ReasonExtraRecordsSaved = "extra_records_written"
	ReasonPolicyModeChanged = "policy_mode_changed"
	ReasonManualRestart     = "manual_restart"
	ReasonManualStart       = "manual_start"
	ReasonManualStop        = "manual_stop"
)

// containerNamePattern bounds what may reach the docker CLI.
//
// The name is interpolated into an exec argument list, not a shell, but a value
// starting with "-" would still be parsed as a flag.
var containerNamePattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$`)

// config is the resolved runtime settings for this package.
type config struct {
	Enabled       bool
	Mode          string
	ContainerName string
}

// resolve reads the lifecycle settings.
func resolve() config {
	cfg := config{
		Enabled:       conf.Conf.Lifecycle.Enabled,
		Mode:          strings.ToLower(strings.TrimSpace(conf.Conf.Lifecycle.Mode)),
		ContainerName: strings.TrimSpace(conf.Conf.Lifecycle.ContainerName),
	}
	if cfg.Mode == "" {
		cfg.Mode = "docker"
	}
	return cfg
}

// validationError explains why the controller cannot act, or "" when it can.
func (c config) validationError() string {
	if !c.Enabled {
		return "lifecycle_disabled"
	}
	if c.Mode != "docker" {
		return "mode_unsupported"
	}
	if c.ContainerName == "" {
		return "container_name_missing"
	}
	if !containerNamePattern.MatchString(c.ContainerName) {
		return "container_name_invalid"
	}
	return ""
}
