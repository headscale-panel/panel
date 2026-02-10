package services

import (
	"headscale-panel/model"
	"headscale-panel/pkg/utils/serializer"
)

type systemService struct{}

var SystemService = new(systemService)

// User Management
func (s *systemService) ListUsers(page, pageSize int) ([]model.User, int64, error) {
	var users []model.User
	var total int64

	if err := model.DB.Model(&model.User{}).Count(&total).Error; err != nil {
		return nil, 0, serializer.ErrDatabase
	}

	offset := (page - 1) * pageSize
	if err := model.DB.Offset(offset).Limit(pageSize).Preload("Group").Find(&users).Error; err != nil {
		return nil, 0, serializer.ErrDatabase
	}

	return users, total, nil
}

func (s *systemService) CreateUser(username, password, email string, groupID uint, displayName string) error {
	var count int64
	model.DB.Model(&model.User{}).Where("username = ?", username).Count(&count)
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
		return serializer.ErrDatabase
	}
	return nil
}

func (s *systemService) UpdateUser(id uint, email string, groupID uint, password string, displayName string) error {
	var user model.User
	if err := model.DB.First(&user, id).Error; err != nil {
		return serializer.ErrDatabase
	}

	user.Email = email
	user.GroupID = groupID // 0 means ungrouped
	user.DisplayName = displayName
	if password != "" {
		user.Password = password
	}

	if err := model.DB.Save(&user).Error; err != nil {
		return serializer.ErrDatabase
	}
	return nil
}

func (s *systemService) DeleteUser(id uint) error {
	if err := model.DB.Delete(&model.User{}, id).Error; err != nil {
		return serializer.ErrDatabase
	}
	return nil
}

// Group Management
// Deprecated: Use GroupService instead
func (s *systemService) ListGroups() ([]model.Group, error) {
	var groups []model.Group
	if err := model.DB.Preload("Permissions").Find(&groups).Error; err != nil {
		return nil, serializer.ErrDatabase
	}
	return groups, nil
}

// Deprecated: Use GroupService instead
func (s *systemService) CreateGroup(name string, permissionIDs []uint) error {
	var permissions []model.Permission
	if len(permissionIDs) > 0 {
		model.DB.Find(&permissions, permissionIDs)
	}

	group := model.Group{
		Name:        name,
		Permissions: permissions,
	}
	if err := model.DB.Create(&group).Error; err != nil {
		return serializer.ErrDatabase
	}
	return nil
}

// Deprecated: Use GroupService instead
func (s *systemService) UpdateGroup(id uint, name string, permissionIDs []uint) error {
	var group model.Group
	if err := model.DB.First(&group, id).Error; err != nil {
		return serializer.ErrDatabase
	}

	var permissions []model.Permission
	if len(permissionIDs) > 0 {
		model.DB.Find(&permissions, permissionIDs)
	}

	group.Name = name
	if err := model.DB.Model(&group).Association("Permissions").Replace(permissions); err != nil {
		return serializer.ErrDatabase
	}

	if err := model.DB.Save(&group).Error; err != nil {
		return serializer.ErrDatabase
	}
	return nil
}

// Deprecated: Use PermissionService instead
func (s *systemService) ListPermissions() ([]model.Permission, error) {
	var permissions []model.Permission
	if err := model.DB.Find(&permissions).Error; err != nil {
		return nil, serializer.ErrDatabase
	}
	return permissions, nil
}
