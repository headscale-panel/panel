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
// Headscale network identity. Only stores the mapping; headscale user details
// (name, email, etc.) are fetched from headscale on demand.
type UserIdentityBinding struct {
	gorm.Model
	UserID      uint   `json:"user_id" gorm:"index;not null"`
	User        User   `json:"-" gorm:"foreignKey:UserID"`
	HeadscaleID uint64 `json:"headscale_id" gorm:"uniqueIndex;not null"`
}

// GetBindings returns all identity bindings for a user.
func GetBindings(userID uint) []UserIdentityBinding {
	var bindings []UserIdentityBinding
	DB.Where("user_id = ?", userID).Order("id").Find(&bindings)
	return bindings
}

// GetHeadscaleIDs returns all bound headscale user IDs for a panel user.
func GetHeadscaleIDs(userID uint) []uint64 {
	var ids []uint64
	DB.Model(&UserIdentityBinding{}).Where("user_id = ?", userID).Pluck("headscale_id", &ids)
	return ids
}

// GetBindingByHeadscaleID returns the binding for a specific headscale user ID, or nil.
func GetBindingByHeadscaleID(headscaleID uint64) *UserIdentityBinding {
	var binding UserIdentityBinding
	if err := DB.Where("headscale_id = ?", headscaleID).First(&binding).Error; err != nil {
		return nil
	}
	return &binding
}

// GetBindingByPanelAndHeadscaleID returns the binding for a specific panel user + headscale user pair.
func GetBindingByPanelAndHeadscaleID(userID uint, headscaleID uint64) *UserIdentityBinding {
	var binding UserIdentityBinding
	if err := DB.Where("user_id = ? AND headscale_id = ?", userID, headscaleID).First(&binding).Error; err != nil {
		return nil
	}
	return &binding
}
