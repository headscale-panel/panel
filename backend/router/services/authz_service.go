package services

import (
	"headscale-panel/model"
	"headscale-panel/pkg/utils/serializer"
	"strings"
)

// RequirePermission enforces permission checks at service layer.
// This is the second line of defense after route middleware.
func RequirePermission(userID uint, requiredPermission string) error {
	if userID == 0 {
		return serializer.ErrPermissionDenied
	}

	permissions, err := GroupService.GetUserPermissions(userID)
	if err != nil {
		return serializer.ErrPermissionDenied
	}

	for _, p := range permissions {
		if p == requiredPermission || p == "*:*:*" {
			return nil
		}
	}

	return serializer.ErrPermissionDenied
}

// RequireAdmin enforces admin-only access at service layer.
func RequireAdmin(userID uint) error {
	if userID == 0 {
		return serializer.ErrPermissionDenied
	}

	var user model.User
	if err := model.DB.Preload("Group").First(&user, userID).Error; err != nil {
		return serializer.ErrPermissionDenied
	}

	if strings.EqualFold(strings.TrimSpace(user.Group.Name), "admin") {
		return nil
	}

	return serializer.ErrPermissionDenied
}
