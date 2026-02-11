package serializer

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Response 统一响应结构
type Response struct {
	Code  int         `json:"code"`
	Msg   string      `json:"msg"`
	Data  interface{} `json:"data,omitempty"`
	Error string      `json:"error,omitempty"`
}

// JSON 通过 gin.Context 发送响应
func (r Response) JSON(c *gin.Context) {
	c.JSON(http.StatusOK, r)
}

// Ok 创建成功响应
func Ok(data interface{}) Response {
	return Response{Code: CodeSuccess, Msg: "OK", Data: data}
}

// Error 将任意 error 转换为错误响应
func Error(err error) Response {
	if err == nil {
		return Ok(nil)
	}

	res := Response{}

	// 处理验证错误
	var validationErrors ValidationErrors
	if errors.As(err, &validationErrors) {
		res.Code = CodeParamErr
		res.Msg = "参数验证失败"
		res.Data = validationErrors.Errors
		return res
	}

	// 处理 AppError
	var appErr AppError
	if errors.As(err, &appErr) {
		res.Code = appErr.ErrCode()
		res.Msg = clientMessageForCode(res.Code, appErr.Msg)
		if gin.Mode() != gin.ReleaseMode && appErr.RawError != nil {
			res.Error = appErr.RawError.Error()
		}
		// 批量操作错误展开
		if res.Code == CodeBatchOperationNotFullyCompleted {
			var aggErr *AggregateError
			if errors.As(appErr.RawError, &aggErr) {
				res.Data = aggErr.Expand()
			}
		}
		return res
	}

	// 普通 error
	res.Code, res.Msg = mapUnknownError(err)
	if gin.Mode() != gin.ReleaseMode {
		res.Error = err.Error()
	}
	return res
}

// ParamErr 创建参数错误响应
func ParamErr(msg string, err error) Response {
	if msg == "" {
		msg = "参数错误"
	}
	res := Response{Code: CodeParamErr, Msg: msg}
	if gin.Mode() != gin.ReleaseMode && err != nil {
		res.Error = err.Error()
	}
	return res
}

// DBErr 创建数据库错误响应
func DBErr(msg string, err error) Response {
	if msg == "" {
		msg = "数据库错误"
	}
	res := Response{Code: CodeDBError, Msg: msg}
	if gin.Mode() != gin.ReleaseMode && err != nil {
		res.Error = err.Error()
	}
	return res
}

// ---- gin 响应快捷方法 ----

// Success 发送成功响应
func Success(c *gin.Context, data interface{}) {
	Ok(data).JSON(c)
}

// Fail 从 error 发送错误响应
func Fail(c *gin.Context, err error) {
	Error(err).JSON(c)
}

// FailWithCode 发送指定错误码和消息的错误响应
func FailWithCode(c *gin.Context, code int, msg string) {
	Response{Code: code, Msg: clientMessageForCode(code, msg)}.JSON(c)
}

func mapUnknownError(err error) (int, string) {
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return CodeNotFound, defaultMessageForCode(CodeNotFound)
	case errors.Is(err, context.DeadlineExceeded):
		return CodeNetworkError, "请求超时，请稍后重试"
	case errors.Is(err, context.Canceled):
		return CodeNetworkError, "请求已取消"
	default:
		return CodeInternalError, defaultMessageForCode(CodeInternalError)
	}
}

func clientMessageForCode(code int, msg string) string {
	cleanMsg := strings.TrimSpace(msg)
	if cleanMsg == "" {
		cleanMsg = defaultMessageForCode(code)
	}
	if gin.Mode() == gin.ReleaseMode && isServerErrorCode(code) {
		return defaultMessageForCode(code)
	}
	return cleanMsg
}

func isServerErrorCode(code int) bool {
	if code >= 50000 {
		return true
	}
	return code == CodeInternalErr || code == CodeDBError
}

func defaultMessageForCode(code int) string {
	switch code {
	case CodeParamErr:
		return "参数错误"
	case CodeNoPermissionErr, CodeForbidden:
		return "权限不足"
	case CodeNotFound:
		return "资源不存在"
	case CodeConflict:
		return "资源冲突"
	case CodeDBError:
		return "数据库错误"
	case CodeNetworkError:
		return "网络错误"
	case CodeThirdPartyServiceError:
		return "第三方服务异常"
	case CodeInternalErr, CodeInternalError:
		return "服务器内部错误"
	default:
		return "请求失败"
	}
}
