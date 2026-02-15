/**
* @Author: qml
* @File:  error
* @Date: 2023/4/1 15:06
* @Version: 1.0.0
* @Description:
 */

package serializer

import (
	"errors"
	"fmt"
)

// AppError 应用错误，实现了error接口
type AppError struct {
	Code     int
	Msg      string
	RawError error
}

// NewError 返回新的错误对象
func NewError(code int, msg string, err error) AppError {
	return AppError{
		Code:     code,
		Msg:      msg,
		RawError: err,
	}
}

// WithError 将应用error携带标准库中的error
func (err *AppError) WithError(raw error) AppError {
	return AppError{
		Code:     err.Code,
		Msg:      err.Msg,
		RawError: raw,
	}
}

// Error 返回业务代码确定的可读错误信息
func (err AppError) Error() string {
	if err.RawError != nil {
		return fmt.Sprintf("%s: %s", err.Msg, err.RawError.Error())
	}
	return err.Msg
}

func (err AppError) ErrCode() int {
	var inheritedErr AppError
	if errors.As(err.RawError, &inheritedErr) {
		return inheritedErr.ErrCode()
	}
	return err.Code
}

func (err AppError) Unwrap() error {
	return err.RawError
}

// 三位数错误编码为复用http原本含义
// 五位数错误编码为应用自定义错误
// 五开头的五位数错误编码为服务器端错误，比如数据库操作失败
// 四开头的五位数错误编码为客户端错误，有时候是客户端代码写错了，有时候是用户操作错误
const (
	// CodeNotSet 未定错误，后续尝试从error中获取
	CodeNotSet = -1
	// CodeNotFullySuccess 未完全成功
	CodeNotFullySuccess = 203
	// CodeCheckLogin 未登录
	CodeCheckLogin = 401
	// CodeNoPermissionErr 未授权访问
	CodeNoPermissionErr = 403
	// CodeNotFound 资源未找到
	CodeNotFound = 404
	// CodeConflict 资源冲突
	CodeConflict = 409
	// CodeInternalErr 服務器内部錯誤
	CodeInternalErr = 500
	// 客户端错误 (4xxxx)
	// CodeForbidden 无足够的权限
	CodeForbidden = 40000
	// CodeParamErr 参数错误
	CodeParamErr = 40001
	// CodeUserNotFound 用户未找到
	CodeUserNotFound = 40002
	// CodeLoginError 登录账号或密码错误
	CodeLoginError = 40003
	// Code2FACodeErr 两步验证错误
	Code2FACodeErr = 40004
	// CodeCaptchaError 验证码错误
	CodeCaptchaError = 40005
	// CodeUserBaned 用户被禁用
	CodeUserBaned = 40006
	// CodeUserNotActivated 用户未激活
	CodeUserNotActivated = 40007
	// CodeEmailExisted 邮箱已被使用
	CodeEmailExisted = 40008
	// CodePhoneExisted 手机号已被使用
	CodePhoneExisted = 40009
	// CodeUserNameExisted 用户名已存在
	CodeUserNameExisted = 40010
	// CodeInvalidToken 无效的令牌
	CodeInvalidToken = 40011
	// CodeTokenExpired 令牌已过期
	CodeTokenExpired = 40012
	// CodeInvalidPassword 密码格式错误
	CodeInvalidPassword = 40013
	// CodePasswordMismatch 密码不匹配
	CodePasswordMismatch = 40014

	// 成功
	CodeSuccess = 0

	// 服务器端错误 (5xxxx)
	// CodeInternalError 内部错误
	CodeInternalError = 50000
	// CodeInternalSetting 内部设置错误
	CodeInternalSetting = 50001
	// CodeDBError 数据库错误
	CodeDBError = 50002
	// CodeFileSystemError 文件系统错误
	CodeFileSystemError = 50003
	// CodeNetworkError 网络错误
	CodeNetworkError = 50004
	// CodeThirdPartyServiceError 第三方服务错误
	CodeThirdPartyServiceError = 50005
	// CodeBatchOperationNotFullyCompleted 批量操作未完全完成
	CodeBatchOperationNotFullyCompleted = 50006
)

// 预定义错误
var (
	// 客户端错误
	ErrBind             = NewError(CodeParamErr, "请求参数绑定失败", nil)
	ErrUserNotFound     = NewError(CodeUserNotFound, "用户不存在或密码不匹配", nil)
	ErrLoginFailed      = NewError(CodeLoginError, "登录失败", nil)
	ErrInvalidToken     = NewError(CodeInvalidToken, "无效的令牌", nil)
	ErrTokenExpired     = NewError(CodeTokenExpired, "令牌已过期", nil)
	ErrUserBaned        = NewError(CodeUserBaned, "用户已被禁用", nil)
	ErrUserNotActivated = NewError(CodeUserNotActivated, "用户未激活", nil)
	ErrEmailExisted     = NewError(CodeEmailExisted, "邮箱已被使用", nil)
	ErrPhoneExisted     = NewError(CodePhoneExisted, "手机号已被使用", nil)
	ErrUserNameExisted  = NewError(CodeUserNameExisted, "用户名已存在", nil)
	ErrInvalidPassword  = NewError(CodeInvalidPassword, "密码格式错误", nil)
	ErrPasswordMismatch = NewError(CodePasswordMismatch, "用户不存在或密码不匹配", nil)
	ErrCaptchaError     = NewError(CodeCaptchaError, "验证码错误", nil)
	Err2FACodeErr       = NewError(Code2FACodeErr, "两步验证错误", nil)
	ErrPermissionDenied = NewError(CodeNoPermissionErr, "权限不足", nil)

	// 服务器端错误
	ErrInternalServer = NewError(CodeInternalError, "服务器内部错误", nil)
	ErrDatabase       = NewError(CodeDBError, "数据库错误", nil)
	ErrGroupHasUsers  = NewError(CodeConflict, "分组下存在用户，无法删除", nil)
)

// AggregateError 聚合错误
type AggregateError struct {
	errs map[string]error
}

// NewAggregateError 创建新的聚合错误
func NewAggregateError() *AggregateError {
	return &AggregateError{
		errs: make(map[string]error),
	}
}

// Error 返回聚合错误的字符串表示
func (e *AggregateError) Error() string {
	if len(e.errs) == 0 {
		return "no errors"
	}

	var result string
	for id, err := range e.errs {
		if result != "" {
			result += "; "
		}
		result += fmt.Sprintf("%s: %s", id, err.Error())
	}
	return result
}

// Add 添加错误
func (e *AggregateError) Add(id string, err error) {
	e.errs[id] = err
}

// Raw 获取原始错误映射
func (e *AggregateError) Raw() map[string]error {
	return e.errs
}

// Remove 移除错误
func (e *AggregateError) Remove(id string) {
	delete(e.errs, id)
}

// Expand 展开为响应映射
func (e *AggregateError) Expand() map[string]Response {
	result := make(map[string]Response)
	for id, err := range e.errs {
		result[id] = Error(err)
	}
	return result
}

// Aggregate 聚合错误并返回nil如果没有错误；否则返回错误本身
func (e *AggregateError) Aggregate() error {
	if len(e.errs) == 0 {
		return nil
	}

	msg := "一个或多个操作失败"
	if len(e.errs) == 1 {
		for _, err := range e.errs {
			msg = err.Error()
		}
	}

	return NewError(CodeBatchOperationNotFullyCompleted, msg, e)
}

// EnhanceError 增强错误消息，添加上下文信息
func EnhanceError(err error, context string) AppError {
	if err == nil {
		return NewError(CodeInternalError, context, nil)
	}

	// 如果已经是 AppError，保持原有的错误码
	var appErr AppError
	if errors.As(err, &appErr) {
		return NewError(appErr.Code, fmt.Sprintf("%s: %s", context, appErr.Msg), appErr.RawError)
	}

	// 根据错误内容判断错误类型
	errMsg := err.Error()
	code := CodeInternalError

	if containsAny(errMsg, "connection refused", "dial") {
		code = CodeNetworkError
	} else if containsAny(errMsg, "permission denied", "access denied") {
		code = CodeFileSystemError
	} else if containsAny(errMsg, "no such file", "not found") {
		code = CodeFileSystemError
	} else if containsAny(errMsg, "timeout", "deadline exceeded") {
		code = CodeNetworkError
	} else if containsAny(errMsg, "already exists", "already in use", "conflict") {
		code = CodeConflict
	}

	return NewError(code, fmt.Sprintf("%s: %s", context, errMsg), err)
}

// WrapFileSystemError 包装文件系统相关错误
func WrapFileSystemError(err error, operation string, path string) AppError {
	if err == nil {
		return NewError(CodeFileSystemError, fmt.Sprintf("%s at %s", operation, path), nil)
	}

	errMsg := err.Error()
	var hint string

	if containsAny(errMsg, "permission denied") {
		hint = "Please check filesystem permissions."
	} else if containsAny(errMsg, "no such file") {
		hint = "File or directory does not exist."
	} else if containsAny(errMsg, "read-only") {
		hint = "Filesystem is read-only."
	} else if containsAny(errMsg, "no space left") {
		hint = "No space left on device."
	}

	msg := fmt.Sprintf("%s at %s: %s", operation, path, errMsg)
	if hint != "" {
		msg = fmt.Sprintf("%s. %s", msg, hint)
	}

	return NewError(CodeFileSystemError, msg, err)
}

// containsAny 检查字符串是否包含任意一个子串（不区分大小写）
func containsAny(s string, substrs ...string) bool {
	lower := fmt.Sprintf("%s", s)
	for _, substr := range substrs {
		if len(substr) > 0 && len(lower) > 0 {
			// 简单的包含检查，不区分大小写
			for i := 0; i <= len(lower)-len(substr); i++ {
				match := true
				for j := 0; j < len(substr); j++ {
					c1 := lower[i+j]
					c2 := substr[j]
					if c1 >= 'A' && c1 <= 'Z' {
						c1 += 32
					}
					if c2 >= 'A' && c2 <= 'Z' {
						c2 += 32
					}
					if c1 != c2 {
						match = false
						break
					}
				}
				if match {
					return true
				}
			}
		}
	}
	return false
}
