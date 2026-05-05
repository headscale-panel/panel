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

import "time"

const (
	SetupStateUninitialized = "UNINITIALIZED"
	SetupStateInitWindow    = "INIT_WINDOW"
	SetupStateInitialized   = "INITIALIZED"
)

// SetupState persists the setup lifecycle state machine.
// ID is fixed to 1 to keep a singleton row.
type SetupState struct {
	ID             uint       `gorm:"primaryKey"`
	State          string     `gorm:"type:varchar(32);not null"`
	WindowDeadline *time.Time `gorm:"column:window_deadline"`
	InitializedAt  *time.Time `gorm:"column:initialized_at"`
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (SetupState) TableName() string {
	return "setup_state"
}
