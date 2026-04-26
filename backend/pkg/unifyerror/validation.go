package unifyerror

import (
	"fmt"
	"net/http"
	"strings"

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
	return fmt.Sprintf("参数验证失败 %s: %s", v.Field, v.Message)
}

// ValidationErrors is a list of field-level validation failures.
// It implements the error interface.
type ValidationErrors struct {
	Errors []ValidationError `json:"errors"`
}

func (v ValidationErrors) Error() string {
	return fmt.Sprintf("参数验证失败: %s", strings.Join(lo.Map(v.Errors, func(e ValidationError, _ int) string {
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
var ErrBind = New(http.StatusBadRequest, CodeParamErr, "请求参数绑定失败")

// BindAndValidate binds the request into obj and returns a *UniErr on failure.
// The returned error is always a *UniErr and can be passed directly to Fail.
func BindAndValidate(c *gin.Context, obj interface{}) error {
	if err := c.ShouldBind(obj); err != nil {
		if ve, ok := err.(validator.ValidationErrors); ok {
			var vErrors ValidationErrors
			for _, e := range ve {
				vErrors.AddError(e.Field(), paramErrorMsg(e.Field(), e.Tag()))
			}
			return New(http.StatusBadRequest, CodeParamErr, "参数验证失败").WithData(vErrors.Errors)
		}
		return New(http.StatusBadRequest, CodeParamErr, "请求参数绑定失败")
	}
	return nil
}

func paramErrorMsg(field, tag string) string {
	switch tag {
	case "required":
		return field + " 不能为空"
	case "min":
		return field + " 值过小"
	case "max":
		return field + " 值过大"
	case "email":
		return field + " 必须是合法的邮箱地址"
	case "url":
		return field + " 必须是合法的URL"
	default:
		return field + " 格式错误"
	}
}
