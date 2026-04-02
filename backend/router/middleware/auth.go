package middleware

import (
	"headscale-panel/model"
	"headscale-panel/pkg/utils/jwt"
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"
	"strings"

	"github.com/gin-gonic/gin"
)

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.Request.Header.Get("Authorization")
		if token == "" {
			serializer.Fail(c, serializer.ErrInvalidToken)
			c.Abort()
			return
		}

		// Remove "Bearer " prefix if present
		token = strings.TrimPrefix(token, "Bearer ")

		claims, err := jwt.ParseToken(token)
		if err != nil {
			serializer.Fail(c, serializer.ErrInvalidToken)
			c.Abort()
			return
		}

		user, err := services.ValidateSessionUser(claims.UserID)
		if err != nil {
			serializer.Fail(c, err)
			c.Abort()
			return
		}

		// Set claims to context
		c.Set("userID", user.ID)
		c.Set("username", user.Username)
		c.Set("groupID", user.GroupID)

		c.Next()
	}
}

// AdminOnlyMiddleware checks if the user belongs to admin group
func AdminOnlyMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		groupID, exists := c.Get("groupID")
		if !exists {
			serializer.Fail(c, serializer.ErrPermissionDenied)
			c.Abort()
			return
		}

		var group model.Group
		if err := model.DB.First(&group, groupID).Error; err != nil {
			serializer.Fail(c, serializer.ErrPermissionDenied)
			c.Abort()
			return
		}

		// Only allow admin group (case insensitive)
		if strings.ToLower(group.Name) != "admin" {
			serializer.Fail(c, serializer.ErrPermissionDenied)
			c.Abort()
			return
		}

		c.Next()
	}
}

// IsAdmin checks if user belongs to admin group
func IsAdmin(groupID uint) bool {
	var group model.Group
	if err := model.DB.First(&group, groupID).Error; err != nil {
		return false
	}
	return strings.ToLower(group.Name) == "admin"
}
