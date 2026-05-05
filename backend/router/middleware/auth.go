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

package middleware

import (
	"headscale-panel/model"
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/pkg/utils/jwt"
	"headscale-panel/router/services"
	"strings"

	"github.com/gin-gonic/gin"
)

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.Request.Header.Get("Authorization")
		if token == "" {
			unifyerror.Fail(c, unifyerror.InvalidToken())
			c.Abort()
			return
		}

		// Remove "Bearer " prefix if present
		token = strings.TrimPrefix(token, "Bearer ")

		claims, err := jwt.ParseToken(token)
		if err != nil {
			unifyerror.Fail(c, unifyerror.InvalidToken())
			c.Abort()
			return
		}

		user, err := services.ValidateSessionUser(claims.UserID)
		if err != nil {
			unifyerror.Fail(c, err)
			c.Abort()
			return
		}

		// Set claims to context
		c.Set("userID", user.ID)
		c.Set("username", user.Username)
		c.Set("groupID", user.GroupID)

		c.Next()
	}
}

// AdminOnlyMiddleware checks if the user belongs to admin group
func AdminOnlyMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		groupID, exists := c.Get("groupID")
		if !exists {
			unifyerror.Fail(c, unifyerror.Forbidden())
			c.Abort()
			return
		}

		var group model.Group
		if err := model.DB.First(&group, groupID).Error; err != nil {
			unifyerror.Fail(c, unifyerror.Forbidden())
			c.Abort()
			return
		}

		// Only allow admin group (case insensitive)
		if !services.IsAdminGroupName(group.Name) {
			unifyerror.Fail(c, unifyerror.Forbidden())
			c.Abort()
			return
		}

		c.Next()
	}
}

// IsAdmin checks if user belongs to admin group
func IsAdmin(groupID uint) bool {
	var group model.Group
	if err := model.DB.First(&group, groupID).Error; err != nil {
		return false
	}
	return services.IsAdminGroupName(group.Name)
}
