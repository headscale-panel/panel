package middleware

import (
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

// PermissionMiddleware checks if the user has the required permission
func PermissionMiddleware(requiredPermission string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, exists := c.Get("userID")
		if !exists {
			serializer.Fail(c, serializer.ErrInvalidToken)
			c.Abort()
			return
		}

		// Get user permissions
		permissions, err := services.GroupService.GetUserPermissions(userID.(uint))
		if err != nil {
			serializer.Fail(c, serializer.ErrUserNotFound)
			c.Abort()
			return
		}

		hasPermission := false
		for _, p := range permissions {
			if p == requiredPermission || p == "*:*:*" { // Support super admin wildcard
				hasPermission = true
				break
			}
		}

		if !hasPermission {
			serializer.Fail(c, serializer.ErrPermissionDenied)
			c.Abort()
			return
		}

		c.Next()
	}
}
