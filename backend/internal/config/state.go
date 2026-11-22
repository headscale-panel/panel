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
	"time"
)

// OwnershipMode decides whether the panel is allowed to write the headscale
// config file.
type OwnershipMode string

const (
	// Managed means the panel owns the managed keys and reconciles drift.
	ManagedMode OwnershipMode = "managed"
	// Observed means the file belongs to the operator; the panel reports drift
	// and can generate snippets but never writes.
	ObservedMode OwnershipMode = "observed"
)

// Valid reports whether the mode is one the panel understands.
func (m OwnershipMode) Valid() bool {
	return m == ManagedMode || m == ObservedMode
}

// State is the panel's record of how it treats the headscale config file.
type State struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// Mode defaults to managed so an installation that never touches the setting
	// behaves the way the UI describes.
	Mode OwnershipMode `gorm:"size:16;not null;default:managed" json:"mode"`

	// Configured records that the file has been written or adopted at least once.
	// It distinguishes "fresh install, nothing to compare against" from "operator
	// deleted the file", which need different UI.
	Configured bool `gorm:"not null;default:false" json:"configured"`

	// LastDriftAt is when drift was last observed, so the banner can say how stale
	// its information is instead of implying a live check.
	LastDriftAt *time.Time `json:"last_drift_at"`
}

func (State) TableName() string { return "hs_config_state" }

// Precheck is what the UI must show before switching modes.
//
// Switching observed -> managed silently overwrites whatever the operator edited
// by hand, so the conflicts have to be listed before the switch is allowed, not
// after.
type Precheck struct {
	FilesWritable bool `json:"files_writable"`
	// RestartAvailable is false when lifecycle control is disabled, which means the
	// panel can write a config it cannot apply.
	RestartAvailable bool     `json:"restart_available"`
	PolicyMode       string   `json:"policy_mode"`
	Conflicts        []string `json:"conflicts"`
	// Blockers explain why the switch is refused; empty means it is allowed.
	Blockers []string `json:"blockers"`
}

// CanSwitchTo reports whether the precheck permits the target mode.
func (p *Precheck) CanSwitchTo(mode OwnershipMode) bool {
	if !mode.Valid() {
		return false
	}
	// Switching to observed only narrows what the panel does, so nothing blocks it.
	if mode == ObservedMode {
		return true
	}
	return p.FilesWritable && len(p.Blockers) == 0
}
