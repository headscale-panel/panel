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
	"errors"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Response is the standard JSON success response envelope.
// It is also referenced in Swagger annotations across controllers.
type Response struct {
	Code int         `json:"code"`
	Msg  string      `json:"msg"`
	Data interface{} `json:"data,omitempty"`
}

// Success sends an HTTP 200 OK JSON response with data as the payload.
func Success(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, Response{Code: 0, Msg: "OK", Data: data})
}

// Fail sends an error JSON response derived from err.
// If err is already a *UniErr it is used directly; otherwise it is wrapped
// via FromError.
func Fail(c *gin.Context, err error) {
	if err == nil {
		err = ServerError(fmt.Errorf("nil error"))
	}
	var u *UniErr
	if !errors.As(err, &u) {
		u = FromError(err)
	}
	exc := u.Handle()
	exc.Request = requestInfo(c)
	c.JSON(exc.HttpCode, exc)
}
