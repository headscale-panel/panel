package services

import "headscale-panel/pkg/utils/serializer"

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
