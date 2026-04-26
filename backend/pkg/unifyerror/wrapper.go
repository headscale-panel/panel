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
