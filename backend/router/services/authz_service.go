package services

import (
	"headscale-panel/model"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/unifyerror"
	"strings"
)

func IsAdminGroupName(groupName string) bool {
	return strings.EqualFold(strings.TrimSpace(groupName), strings.ToLower(constants.GROUP_ADMIN))
}

// RequirePermission enforces permission checks at service layer.
// This is the second line of defense after route middleware.
func RequirePermission(userID uint, requiredPermission string) error {
	if userID == 0 {
		return unifyerror.Forbidden()
	}

	permissions, err := GroupService.GetUserPermissions(userID)
	if err != nil {
		return unifyerror.Forbidden()
	}

	for _, p := range permissions {
		if p == requiredPermission || p == "*:*:*" {
			return nil
		}
	}

	return unifyerror.Forbidden()
}

// RequireAdmin enforces admin-only access at service layer.
func RequireAdmin(userID uint) error {
	if userID == 0 {
		return unifyerror.Forbidden()
	}

	var user model.User
	if err := model.DB.Preload("Group").First(&user, userID).Error; err != nil {
		return unifyerror.Forbidden()
	}

	if IsAdminGroupName(user.Group.Name) {
		return nil
	}

	return unifyerror.Forbidden()
}
