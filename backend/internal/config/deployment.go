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

// DeploymentStatus is the state of one config publication.
//
// The sequence exists because a written config is not a working config: headscale
// only proves it by starting. Every step that could fail has a state, so an
// operator can see whether the panel is waiting on their restart, waiting on a
// verification, or has already given up and restored the previous file.
type DeploymentStatus string

const (
	// DeploymentPending means the file is written and headscale has not been
	// restarted yet.
	DeploymentPending DeploymentStatus = "manual_restart_required"
	// DeploymentSucceeded means the operator verified and headscale is healthy.
	DeploymentSucceeded DeploymentStatus = "succeeded"
	// DeploymentRolledBack means verification failed and the previous file was
	// restored; another restart is needed to get back to a working state.
	DeploymentRolledBack DeploymentStatus = "rolled_back"
	// DeploymentFailed means the write itself failed, so nothing changed.
	DeploymentFailed DeploymentStatus = "failed"
)

// Active reports whether this deployment still needs operator attention.
func (s DeploymentStatus) Active() bool { return s == DeploymentPending }

// Deployment is one record per publication of the headscale config file.
type Deployment struct {
	ID         uint       `gorm:"primarykey" json:"id"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
	FinishedAt *time.Time `json:"finished_at,omitempty"`

	Status DeploymentStatus `gorm:"size:32;not null;index" json:"status"`
	// Action records which flow produced this deployment, so history reads as a
	// sequence of operations rather than an undifferentiated list of writes.
	Action string `gorm:"size:32;not null" json:"action"`

	CreatedBy     uint   `json:"created_by"`
	CreatedByName string `gorm:"size:128" json:"created_by_name"`

	// PreviousHash and AppliedHash are SHA-256 of the file bytes before and after.
	// AppliedHash is what verification compares against, so a config edited by hand
	// between publish and verify is detected instead of being silently "verified".
	PreviousHash string `gorm:"size:64" json:"previous_hash"`
	AppliedHash  string `gorm:"size:64" json:"applied_hash"`

	// PreviousConfig holds the previous file, encrypted. It is tagged json:"-" and
	// has no serialisation path: the snapshot contains oidc.client_secret and
	// database.postgres.pass, so it must never appear in an API response.
	PreviousConfig string `gorm:"type:text" json:"-"`
	// PreviousExisted distinguishes "the previous file was empty" from "there was
	// no previous file" — rolling back the first writes an empty file, the second
	// deletes it.
	PreviousExisted bool `gorm:"not null;default:false" json:"previous_existed"`

	ManualRestartRequired bool `json:"manual_restart_required"`
	HealthVerified        bool `json:"health_verified"`
	RolledBack            bool `json:"rolled_back"`

	// Message carries the reason for the last transition, which is what the UI
	// shows next to a failed or rolled-back deployment.
	Message string `gorm:"size:512" json:"message"`
}

func (Deployment) TableName() string { return "config_deployments" }

// Models returns every model this package owns.
func Models() []any {
	return []any{&State{}, &Deployment{}}
}
