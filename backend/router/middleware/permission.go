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
	"headscale-panel/pkg/unifyerror"

	"github.com/gin-gonic/gin"
)

// PermissionMiddleware guards a route with a permission code.
//
// This is the first of two checks; the service layer checks again. The
// duplication is deliberate: a handler reachable through a second route, or
// called directly from another service, must not be able to skip authorization
// because someone forgot to copy the guard.
func PermissionMiddleware(code string) gin.HandlerFunc {
	return requireAny(code)
}

// PermissionAnyMiddleware passes when the caller holds at least one code.
func PermissionAnyMiddleware(codes ...string) gin.HandlerFunc {
	return requireAny(codes...)
}

func requireAny(codes ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		session := CurrentSession(c)
		if session == nil {
			unifyerror.Fail(c, unifyerror.InvalidToken())
			c.Abort()
			return
		}

		for _, code := range codes {
			if session.Can(code) {
				c.Next()
				return
			}
		}

		unifyerror.Fail(c, unifyerror.Forbidden())
		c.Abort()
	}
}
