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
	"strings"

	"headscale-panel/pkg/constants"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/samber/lo"
)

// ValidationError holds a single field-level validation failure.
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

func (v ValidationError) Error() string {
	return fmt.Sprintf("%s %s: %s", constants.MsgParamValidateFailed, v.Field, v.Message)
}

// ValidationErrors is a list of field-level validation failures.
// It implements the error interface.
type ValidationErrors struct {
	Errors []ValidationError `json:"errors"`
}

func (v ValidationErrors) Error() string {
	return fmt.Sprintf("%s: %s", constants.MsgParamValidateFailed, strings.Join(lo.Map(v.Errors, func(e ValidationError, _ int) string {
		return fmt.Sprintf("%s: %s", e.Field, e.Message)
	}), ", "))
}

// AddError appends a field validation failure.
func (v *ValidationErrors) AddError(field, message string) {
	v.Errors = append(v.Errors, ValidationError{Field: field, Message: message})
}

// HasErrors reports whether any validation errors have been recorded.
func (v *ValidationErrors) HasErrors() bool {
	return len(v.Errors) > 0
}

// ErrBind is returned when request body/query binding fails.
var ErrBind = New(http.StatusBadRequest, CodeParamErr, constants.MsgParamBindFailed)

// BindAndValidate binds the request into obj and returns a *UniErr on failure.
// The returned error is always a *UniErr and can be passed directly to Fail.
func BindAndValidate(c *gin.Context, obj interface{}) error {
	if err := c.ShouldBind(obj); err != nil {
		if ve, ok := err.(validator.ValidationErrors); ok {
			var vErrors ValidationErrors
			for _, e := range ve {
				vErrors.AddError(e.Field(), paramErrorMsg(e.Field(), e.Tag()))
			}
			return New(http.StatusBadRequest, CodeParamErr, constants.MsgParamValidateFailed).WithData(vErrors.Errors)
		}
		return New(http.StatusBadRequest, CodeParamErr, constants.MsgParamBindFailed)
	}
	return nil
}

func paramErrorMsg(field, tag string) string {
	switch tag {
	case "required":
		return field + " " + constants.MsgCannotBeEmpty
	case "min":
		return field + " " + constants.MsgValueTooSmall
	case "max":
		return field + " " + constants.MsgValueTooLarge
	case "email":
		return field + " " + constants.MsgInvalidEmail
	case "url":
		return field + " " + constants.MsgInvalidURL
	default:
		return field + " " + constants.MsgInvalidFormat
	}
}
