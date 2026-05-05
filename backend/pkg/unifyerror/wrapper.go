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

package unifyerror

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

// HandlerFunc is the gin handler signature used with Wrap. Returning a
// non-nil *UniErr causes an error JSON response to be written.
type HandlerFunc func(c *gin.Context) *UniErr

// Wrap converts a HandlerFunc into a standard gin.HandlerFunc. On error the
// ApiException is serialized as JSON with the appropriate HTTP status code.
func Wrap(handler HandlerFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		uniErr := handler(c)
		if uniErr != nil {
			exc := uniErr.Handle()
			exc.Request = requestInfo(c)
			c.JSON(exc.HttpCode, exc)
			c.Abort()
		}
	}
}

// HandleNotFound is a gin.HandlerFunc for Router.NoRoute and Router.NoMethod.
func HandleNotFound(c *gin.Context) {
	exc := NotFound().Handle()
	exc.Request = requestInfo(c)
	c.JSON(http.StatusNotFound, exc)
}

// HandleUnAuth is a gin.HandlerFunc for unauthorized access.
func HandleUnAuth(c *gin.Context) {
	exc := UnAuth().Handle()
	exc.Request = requestInfo(c)
	c.JSON(http.StatusUnauthorized, exc)
}

func requestInfo(c *gin.Context) string {
	return fmt.Sprintf("%s %s", c.Request.Method, c.Request.URL.String())
}
