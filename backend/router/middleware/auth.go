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

// AdminOnlyMiddleware checks if the user is an admin
func AdminOnlyMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDVal, exists := c.Get("userID")
		if !exists {
			unifyerror.Fail(c, unifyerror.Forbidden())
			c.Abort()
			return
		}

		userID := userIDVal.(uint)

		// Only allow admin users
		var userModel model.User
		if err := model.DB.First(&userModel, userID).Error; err != nil || !userModel.IsAdmin {
			unifyerror.Fail(c, unifyerror.Forbidden())
			c.Abort()
			return
		}

		c.Next()
	}
}

// IsAdmin checks if user is an admin
func IsAdmin(userID uint) bool {
	var user model.User
	if err := model.DB.First(&user, userID).Error; err != nil {
		return false
	}
	return user.IsAdmin
}
