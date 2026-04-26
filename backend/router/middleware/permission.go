package middleware

import (
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

// PermissionMiddleware checks if the user has the required permission
func PermissionMiddleware(requiredPermission string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetUint("userID")
		if userID == 0 {
			unifyerror.Fail(c, unifyerror.InvalidToken())
			c.Abort()
			return
		}

		if err := services.RequirePermission(userID, requiredPermission); err != nil {
			unifyerror.Fail(c, err)
			c.Abort()
			return
		}

		c.Next()
	}
}
