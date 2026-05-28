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
	"headscale-panel/model"
	"headscale-panel/pkg/unifyerror"
)

// IsAdmin checks if a user is an admin by the IsAdmin field.
func IsAdmin(user *model.User) bool {
	return user != nil && user.IsAdmin
}

// RequirePermission enforces permission checks at service layer.
// This is the second line of defense after route middleware.
func RequirePermission(userID uint, requiredPermission string) error {
	if userID == 0 {
		return unifyerror.Forbidden()
	}

	permissions, err := GroupService.GetUserPermissions(userID)
	if err != nil {
		return unifyerror.Forbidden()
	}

	for _, p := range permissions {
		if p == requiredPermission || p == "*:*:*" {
			return nil
		}
	}

	return unifyerror.Forbidden()
}

// RequireAdmin enforces admin-only access at service layer.
func RequireAdmin(userID uint) error {
	if userID == 0 {
		return unifyerror.Forbidden()
	}

	var user model.User
	if err := model.DB.First(&user, userID).Error; err != nil {
		return unifyerror.Forbidden()
	}

	if user.IsAdmin {
		return nil
	}

	return unifyerror.Forbidden()
}
