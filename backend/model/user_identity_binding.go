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

import "gorm.io/gorm"

// UserIdentityBinding represents the binding between a Panel Account and a
// Headscale / Tailscale network identity. A single Panel Account may be bound
// to multiple network identities, but exactly one should be marked as primary.
type UserIdentityBinding struct {
	gorm.Model
	UserID        uint   `json:"user_id" gorm:"index;not null"`
	User          User   `json:"-" gorm:"foreignKey:UserID"`
	HeadscaleID   uint64 `json:"headscale_id"`
	HeadscaleName string `json:"headscale_name" gorm:"index;not null"`
	DisplayName   string `json:"display_name"`
	Email         string `json:"email"`
	Provider      string `json:"provider"`
	IsPrimary     bool   `json:"is_primary" gorm:"default:false"`
}
