package serializer

import (
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/samber/lo"
)

// ValidationError 验证错误
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ValidationErrors 验证错误列表
type ValidationErrors struct {
	Errors []ValidationError `json:"errors"`
}

func (v ValidationErrors) Error() string {
	return fmt.Sprintf("参数验证失败: %s", strings.Join(lo.Map(v.Errors, func(e ValidationError, _ int) string {
		return fmt.Sprintf("%s: %s", e.Field, e.Message)
	}), ", "))
}

func (v ValidationError) Error() string {
	return fmt.Sprintf("参数验证失败 %s: %s", v.Field, v.Message)
}

// AddError 添加验证错误
func (v *ValidationErrors) AddError(field, message string) {
	v.Errors = append(v.Errors, ValidationError{Field: field, Message: message})
}

// HasErrors 检查是否有错误
func (v *ValidationErrors) HasErrors() bool {
	return len(v.Errors) > 0
}

// BindAndValidate 绑定并验证参数，失败返回 error（可直接传给 Fail）
func BindAndValidate(c *gin.Context, obj interface{}) error {
	if err := c.ShouldBind(obj); err != nil {
		// 处理 Validator 产生的错误
		if ve, ok := err.(validator.ValidationErrors); ok {
			var vErrors ValidationErrors
			for _, e := range ve {
				vErrors.AddError(e.Field(), paramErrorMsg(e.Field(), e.Tag()))
			}
			return vErrors
		}
		// 其他绑定错误
		return ErrBind.WithError(err)
	}
	return nil
}

// paramErrorMsg 根据 Validator 返回的字段和 tag 给出中文错误提示
func paramErrorMsg(field string, tag string) string {
	fieldMap := map[string]string{
		"password":   "用户密码",
		"user_name":  "用户账号",
		"nick_name":  "用户昵称",
		"phone":      "用户手机号",
		"email":      "用户邮箱",
		"captcha":    "验证码",
		"captcha_id": "验证码ID",
		"code":       "验证码",
		"username":   "用户名",
		"content":    "内容",
	}

	tagMap := map[string]string{
		"required": "不能为空",
		"min":      "太短",
		"max":      "太长",
		"email":    "格式不正确",
		"phone":    "格式不正确",
		"url":      "格式不正确",
		"numeric":  "必须是数字",
		"alpha":    "只能包含字母",
		"alphanum": "只能包含字母和数字",
	}

	fieldVal, ok := fieldMap[field]
	if !ok {
		fieldVal = field
	}

	tagVal, ok := tagMap[tag]
	if !ok {
		tagVal = tag
	}

	return fieldVal + " " + tagVal
}
