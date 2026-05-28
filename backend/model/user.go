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

import (
	"headscale-panel/pkg/utils/password"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	Username    string `json:"username" gorm:"uniqueIndex;not null"`
	Password    string `json:"-"` // Password is not returned in JSON
	Email       string `json:"email"`
	IsActive    bool   `json:"is_active" gorm:"default:true"`
	IsAdmin     bool   `json:"is_admin" gorm:"default:false"`
	GroupID     uint   `json:"group_id"`
	Group       Group  `json:"group"`
	DisplayName string `json:"display_name"`

	// ProfilePicURL is the panel-side avatar URL (from panel OIDC provider or manually set).
	ProfilePicURL string `json:"profile_pic_url"`

	// Provider distinguishes panel account types: "local", "oidc", "headscale".
	// This is a panel-side concept, not a headscale identity field.
	Provider string `json:"account_type" gorm:"column:provider"`

	// ProviderID stores the OIDC sub claim for matching OIDC identities to panel accounts.
	ProviderID      string     `json:"provider_id"`
	GuideTourSeenAt *time.Time `json:"guide_tour_seen_at"`

	// TOTP
	TOTPSecret  string `json:"-"`
	TOTPEnabled bool   `json:"totp_enabled"`
}

// BeforeSave encrypts the password before saving to the database
func (u *User) BeforeSave(tx *gorm.DB) (err error) {
	if u.Password != "" && !isBcryptHash(u.Password) {
		encrypted, err := password.Encrypt(u.Password)
		if err != nil {
			return err
		}
		u.Password = encrypted
	}
	return
}

func (u *User) CheckPassword(pwd string) bool {
	return password.Compare(u.Password, pwd)
}

func isBcryptHash(value string) bool {
	if !strings.HasPrefix(value, "$2") {
		return false
	}
	_, err := bcrypt.Cost([]byte(value))
	return err == nil
}
