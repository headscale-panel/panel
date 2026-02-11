package services

import (
	"headscale-panel/model"
	"headscale-panel/pkg/utils/serializer"
)

type systemService struct{}

var SystemService = new(systemService)

// User Management
func (s *systemService) ListUsers(actorUserID uint, page, pageSize int) ([]model.User, int64, error) {
	if err := RequirePermission(actorUserID, "system:user:list"); err != nil {
		return nil, 0, err
	}

	var users []model.User
	var total int64

	if err := model.DB.Model(&model.User{}).Count(&total).Error; err != nil {
		return nil, 0, serializer.ErrDatabase.WithError(err)
	}

	offset := (page - 1) * pageSize
	if err := model.DB.Offset(offset).Limit(pageSize).Preload("Group").Find(&users).Error; err != nil {
		return nil, 0, serializer.ErrDatabase.WithError(err)
	}

	return users, total, nil
}

func (s *systemService) CreateUser(actorUserID uint, username, password, email string, groupID uint, displayName string) error {
	if err := RequirePermission(actorUserID, "system:user:create"); err != nil {
		return err
	}

	var count int64
	if err := model.DB.Model(&model.User{}).Where("username = ?", username).Count(&count).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	if count > 0 {
		return serializer.ErrUserNameExisted
	}

	user := model.User{
		Username:      username,
		Password:      password,
		Email:         email,
		GroupID:       groupID, // 0 means ungrouped
		DisplayName:   displayName,
		HeadscaleName: username,
	}

	if err := model.DB.Create(&user).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	return nil
}

func (s *systemService) UpdateUser(actorUserID uint, id uint, email string, groupID uint, password string, displayName string) error {
	if err := RequirePermission(actorUserID, "system:user:update"); err != nil {
		return err
	}

	var user model.User
	if err := model.DB.First(&user, id).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}

	// Only admins can change group assignments; prevent privilege escalation
	if groupID != 0 && groupID != user.GroupID {
		if err := RequireAdmin(actorUserID); err != nil {
			return serializer.NewError(serializer.CodeNoPermissionErr, "only admins can change user group", nil)
		}
		if actorUserID == id {
			return serializer.NewError(serializer.CodeParamErr, "cannot change your own group", nil)
		}
		user.GroupID = groupID
	}

	user.Email = email
	user.DisplayName = displayName
	if password != "" {
		user.Password = password
	}

	if err := model.DB.Save(&user).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	return nil
}

func (s *systemService) DeleteUser(actorUserID uint, id uint) error {
	if err := RequirePermission(actorUserID, "system:user:delete"); err != nil {
		return err
	}

	if actorUserID == id {
		return serializer.NewError(serializer.CodeParamErr, "cannot delete your own account", nil)
	}

	if err := model.DB.Delete(&model.User{}, id).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	return nil
}

// Group Management
// Deprecated: Use GroupService instead
func (s *systemService) ListGroups() ([]model.Group, error) {
	return nil, serializer.NewError(serializer.CodeForbidden, "deprecated system group API is disabled; use GroupService", nil)
}

// Deprecated: Use GroupService instead
func (s *systemService) CreateGroup(name string, permissionIDs []uint) error {
	return serializer.NewError(serializer.CodeForbidden, "deprecated system group API is disabled; use GroupService", nil)
}

// Deprecated: Use GroupService instead
func (s *systemService) UpdateGroup(id uint, name string, permissionIDs []uint) error {
	return serializer.NewError(serializer.CodeForbidden, "deprecated system group API is disabled; use GroupService", nil)
}

// Deprecated: Use PermissionService instead
func (s *systemService) ListPermissions() ([]model.Permission, error) {
	return nil, serializer.NewError(serializer.CodeForbidden, "deprecated permission API is disabled; use PermissionService", nil)
}
