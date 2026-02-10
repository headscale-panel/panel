package services

import (
	"headscale-panel/model"
	"headscale-panel/pkg/utils/serializer"
)

type permissionService struct{}

var PermissionService = &permissionService{}

func (s *permissionService) List(page, pageSize int) ([]model.Permission, int64, error) {
	var permissions []model.Permission
	var total int64

	db := model.DB.Model(&model.Permission{})
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, serializer.ErrDatabase
	}

	if err := db.Offset((page - 1) * pageSize).Limit(pageSize).Find(&permissions).Error; err != nil {
		return nil, 0, serializer.ErrDatabase
	}

	return permissions, total, nil
}

func (s *permissionService) Create(name, code, pType string) (*model.Permission, error) {
	perm := &model.Permission{
		Name: name,
		Code: code,
		Type: pType,
	}
	if err := model.DB.Create(perm).Error; err != nil {
		return nil, serializer.ErrDatabase
	}
	return perm, nil
}

func (s *permissionService) Update(id uint, name, code, pType string) error {
	var perm model.Permission
	if err := model.DB.First(&perm, id).Error; err != nil {
		return serializer.ErrDatabase
	}
	perm.Name = name
	perm.Code = code
	perm.Type = pType
	return model.DB.Save(&perm).Error
}

func (s *permissionService) Delete(id uint) error {
	return model.DB.Delete(&model.Permission{}, id).Error
}

func (s *permissionService) GetAllPermissions() ([]model.Permission, error) {
	var permissions []model.Permission
	if err := model.DB.Find(&permissions).Error; err != nil {
		return nil, serializer.ErrDatabase
	}
	return permissions, nil
}
