package services

import (
	"headscale-panel/model"
	"headscale-panel/pkg/unifyerror"
)

type groupService struct{}

var GroupService = &groupService{}

func (s *groupService) List(actorUserID uint, page, pageSize int) ([]model.Group, int64, error) {
	if err := RequirePermission(actorUserID, "system:group:list"); err != nil {
		return nil, 0, err
	}

	var groups []model.Group
	var total int64

	db := model.DB.Model(&model.Group{})
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, unifyerror.DbError(err)
	}

	if err := db.Offset((page - 1) * pageSize).Limit(pageSize).Preload("Permissions").Find(&groups).Error; err != nil {
		return nil, 0, unifyerror.DbError(err)
	}

	return groups, total, nil
}

func (s *groupService) Create(actorUserID uint, name string, permissionIDs []uint) (*model.Group, error) {
	if err := RequirePermission(actorUserID, "system:group:create"); err != nil {
		return nil, err
	}

	var permissions []model.Permission
	if len(permissionIDs) > 0 {
		if err := model.DB.Find(&permissions, permissionIDs).Error; err != nil {
			return nil, unifyerror.DbError(err)
		}
	}

	group := &model.Group{
		Name:        name,
		Permissions: permissions,
	}

	if err := model.DB.Create(group).Error; err != nil {
		return nil, unifyerror.DbError(err)
	}
	return group, nil
}

func (s *groupService) Update(actorUserID uint, id uint, name string, permissionIDs []uint) error {
	if err := RequirePermission(actorUserID, "system:group:update"); err != nil {
		return err
	}

	var group model.Group
	if err := model.DB.Preload("Permissions").First(&group, id).Error; err != nil {
		return unifyerror.DbError(err)
	}

	group.Name = name

	if permissionIDs != nil {
		var permissions []model.Permission
		if len(permissionIDs) > 0 {
			if err := model.DB.Find(&permissions, permissionIDs).Error; err != nil {
				return unifyerror.DbError(err)
			}
		}
		if err := model.DB.Model(&group).Association("Permissions").Replace(permissions); err != nil {
			return unifyerror.DbError(err)
		}
	}

	return model.DB.Save(&group).Error
}

func (s *groupService) Delete(actorUserID uint, id uint) error {
	if err := RequirePermission(actorUserID, "system:group:delete"); err != nil {
		return err
	}

	var count int64
	if err := model.DB.Model(&model.User{}).Where("group_id = ?", id).Count(&count).Error; err != nil {
		return unifyerror.DbError(err)
	}
	if count > 0 {
		return unifyerror.Conflict("分组下存在用户，无法删除")
	}
	return model.DB.Delete(&model.Group{}, id).Error
}

// GetUserPermissions retrieves all permissions for a user based on their group
func (s *groupService) GetUserPermissions(userID uint) ([]string, error) {
	var user model.User
	if err := model.DB.Preload("Group.Permissions").First(&user, userID).Error; err != nil {
		return nil, unifyerror.New(404, unifyerror.CodeNotFound, "user not found")
	}

	var codes []string
	for _, p := range user.Group.Permissions {
		codes = append(codes, p.Code)
	}
	return codes, nil
}

func (s *groupService) UpdatePermissions(actorUserID uint, groupID uint, permissionIDs []uint) error {
	if err := RequirePermission(actorUserID, "system:group:update"); err != nil {
		return err
	}

	var group model.Group
	if err := model.DB.First(&group, groupID).Error; err != nil {
		return unifyerror.DbError(err)
	}

	var permissions []model.Permission
	if len(permissionIDs) > 0 {
		if err := model.DB.Find(&permissions, permissionIDs).Error; err != nil {
			return unifyerror.DbError(err)
		}
	}

	if err := model.DB.Model(&group).Association("Permissions").Replace(permissions); err != nil {
		return unifyerror.DbError(err)
	}
	return nil
}

func (s *groupService) AddPermissions(actorUserID uint, groupID uint, permissionIDs []uint) error {
	if err := RequirePermission(actorUserID, "system:group:update"); err != nil {
		return err
	}

	var group model.Group
	if err := model.DB.First(&group, groupID).Error; err != nil {
		return unifyerror.DbError(err)
	}

	var permissions []model.Permission
	if len(permissionIDs) > 0 {
		if err := model.DB.Find(&permissions, permissionIDs).Error; err != nil {
			return unifyerror.DbError(err)
		}
	}

	if err := model.DB.Model(&group).Association("Permissions").Append(permissions); err != nil {
		return unifyerror.DbError(err)
	}
	return nil
}

func (s *groupService) RemovePermissions(actorUserID uint, groupID uint, permissionIDs []uint) error {
	if err := RequirePermission(actorUserID, "system:group:update"); err != nil {
		return err
	}

	var group model.Group
	if err := model.DB.First(&group, groupID).Error; err != nil {
		return unifyerror.DbError(err)
	}

	var permissions []model.Permission
	if len(permissionIDs) > 0 {
		if err := model.DB.Find(&permissions, permissionIDs).Error; err != nil {
			return unifyerror.DbError(err)
		}
	}

	if err := model.DB.Model(&group).Association("Permissions").Delete(permissions); err != nil {
		return unifyerror.DbError(err)
	}
	return nil
}
