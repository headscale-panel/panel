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
