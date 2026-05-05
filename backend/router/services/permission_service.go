// Copyright (C) 2026 
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

package services

import (
	"headscale-panel/model"
	"headscale-panel/pkg/unifyerror"
)

type permissionService struct{}

var PermissionService = &permissionService{}

func (s *permissionService) List(actorUserID uint, page, pageSize int) ([]model.Permission, int64, error) {
	if err := RequirePermission(actorUserID, "system:permission:list"); err != nil {
		return nil, 0, err
	}

	var permissions []model.Permission
	var total int64

	db := model.DB.Model(&model.Permission{})
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, unifyerror.DbError(err)
	}

	if err := db.Offset((page - 1) * pageSize).Limit(pageSize).Find(&permissions).Error; err != nil {
		return nil, 0, unifyerror.DbError(err)
	}

	return permissions, total, nil
}

func (s *permissionService) Create(actorUserID uint, name, code, pType string) (*model.Permission, error) {
	if err := RequirePermission(actorUserID, "system:permission:create"); err != nil {
		return nil, err
	}

	perm := &model.Permission{
		Name: name,
		Code: code,
		Type: pType,
	}
	if err := model.DB.Create(perm).Error; err != nil {
		return nil, unifyerror.DbError(err)
	}
	return perm, nil
}

func (s *permissionService) Update(actorUserID uint, id uint, name, code, pType string) error {
	if err := RequirePermission(actorUserID, "system:permission:update"); err != nil {
		return err
	}

	var perm model.Permission
	if err := model.DB.First(&perm, id).Error; err != nil {
		return unifyerror.DbError(err)
	}
	perm.Name = name
	perm.Code = code
	perm.Type = pType
	return model.DB.Save(&perm).Error
}

func (s *permissionService) Delete(actorUserID uint, id uint) error {
	if err := RequirePermission(actorUserID, "system:permission:delete"); err != nil {
		return err
	}

	return model.DB.Delete(&model.Permission{}, id).Error
}

func (s *permissionService) GetAllPermissions(actorUserID uint) ([]model.Permission, error) {
	if err := RequirePermission(actorUserID, "system:permission:list"); err != nil {
		return nil, err
	}

	var permissions []model.Permission
	if err := model.DB.Find(&permissions).Error; err != nil {
		return nil, unifyerror.DbError(err)
	}
	return permissions, nil
}
