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
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/pkg/utils/jwt"
	"headscale-panel/router/services"
	"strings"

	"github.com/gin-gonic/gin"
)

// AuthMiddleware authenticates a bearer token and attaches the session.
//
// The token is checked against live account state, not just its signature: a
// token that was valid when it was minted stops working the moment the account is
// disabled or its password changes.
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := c.Request.Header.Get("Authorization")
		if raw == "" {
			unifyerror.Fail(c, unifyerror.InvalidToken())
			c.Abort()
			return
		}

		claims, err := jwt.ParseToken(strings.TrimPrefix(raw, "Bearer "))
		if err != nil {
			unifyerror.Fail(c, unifyerror.InvalidToken())
			c.Abort()
			return
		}

		session, err := services.ResolveSession(claims)
		if err != nil {
			unifyerror.Fail(c, err)
			c.Abort()
			return
		}

		c.Set("userID", session.Account.ID)
		c.Set("username", session.Account.Username)
		c.Set("roleID", session.Account.RoleID)
		c.Set("isSystemAdmin", session.IsSystemAdmin())
		c.Set(SessionKey, session)

		c.Next()
	}
}

// SessionKey is where the resolved session is stored on the gin context.
const SessionKey = "session"

// CurrentSession returns the session attached by AuthMiddleware.
func CurrentSession(c *gin.Context) *services.Session {
	value, ok := c.Get(SessionKey)
	if !ok {
		return nil
	}
	session, _ := value.(*services.Session)
	return session
}

// AdminOnlyMiddleware restricts a route to system administrators.
func AdminOnlyMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		session := CurrentSession(c)
		if session == nil || !session.IsSystemAdmin() {
			unifyerror.Fail(c, unifyerror.Forbidden())
			c.Abort()
			return
		}
		c.Next()
	}
}

var _ = constants.PermWildcard
