package serializer

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
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
		res.Msg = appErr.Msg
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
	res.Code = CodeInternalError
	res.Msg = err.Error()
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
	Response{Code: code, Msg: msg}.JSON(c)
}
