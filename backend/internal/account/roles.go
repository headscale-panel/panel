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

package account

import (
	"errors"
	"strings"

	"gorm.io/gorm"
)

// CreateRole adds a role.
func (s *Service) CreateRole(name, description string, permissionIDs []uint) (*Role, error) {
	perms, err := s.permissionsByID(permissionIDs)
	if err != nil {
		return nil, err
	}

	role := &Role{
		Name:        strings.TrimSpace(name),
		Description: strings.TrimSpace(description),
		Permissions: perms,
	}
	if err := s.db.Create(role).Error; err != nil {
		return nil, err
	}
	return s.GetRole(role.ID)
}

// UpdateRole rewrites a role.
//
// The system administrator role is immutable: its permission set is not stored at
// all (the flag short-circuits every check), so adding or removing rows would
// change nothing while appearing to.
func (s *Service) UpdateRole(id uint, name, description string, permissionIDs []uint) (*Role, error) {
	role, err := s.GetRole(id)
	if err != nil {
		return nil, err
	}
	if role.IsSystemAdmin {
		return nil, ErrSystemRoleImmutable
	}

	perms, err := s.permissionsByID(permissionIDs)
	if err != nil {
		return nil, err
	}

	updates := map[string]any{}
	if trimmed := strings.TrimSpace(name); trimmed != "" {
		updates["name"] = trimmed
	}
	updates["description"] = strings.TrimSpace(description)

	err = s.db.Transaction(func(tx *gorm.DB) error {
		if len(updates) > 0 {
			if updateErr := tx.Model(&Role{}).Where("id = ?", id).Updates(updates).Error; updateErr != nil {
				return updateErr
			}
		}
		return tx.Model(role).Association("Permissions").Replace(perms)
	})
	if err != nil {
		return nil, err
	}
	return s.GetRole(id)
}

// SetRolePermissions replaces the permission set.
func (s *Service) SetRolePermissions(id uint, permissionIDs []uint) (*Role, error) {
	return s.UpdateRole(id, "", "", permissionIDs)
}

// DeleteRole removes an unused role.
func (s *Service) DeleteRole(id uint) error {
	role, err := s.GetRole(id)
	if err != nil {
		return err
	}
	if role.IsSystemAdmin {
		return ErrSystemRoleImmutable
	}

	var inUse int64
	if err := s.db.Model(&Account{}).Where("role_id = ?", id).Count(&inUse).Error; err != nil {
		return err
	}
	if inUse > 0 {
		return ErrRoleInUse
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("role_id = ?", id).Delete(&RolePermission{}).Error; err != nil {
			return err
		}
		return tx.Delete(&Role{}, id).Error
	})
}

// PermissionByCode looks a permission up by its code.
func (s *Service) PermissionByCode(code string) (*Permission, error) {
	var perm Permission
	err := s.db.Where("code = ?", code).First(&perm).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrPermissionUnknown
	}
	if err != nil {
		return nil, err
	}
	return &perm, nil
}

// ListPermissions returns the catalogue rows.
func (s *Service) ListPermissions() ([]Permission, error) {
	var out []Permission
	if err := s.db.Order("id").Find(&out).Error; err != nil {
		return nil, err
	}
	return out, nil
}

// permissionsByID resolves and validates a permission id list.
func (s *Service) permissionsByID(ids []uint) ([]Permission, error) {
	if len(ids) == 0 {
		return nil, nil
	}

	var perms []Permission
	if err := s.db.Where("id IN ?", ids).Find(&perms).Error; err != nil {
		return nil, err
	}
	if len(perms) != len(ids) {
		return nil, ErrPermissionUnknown
	}
	return perms, nil
}

var _ = errors.Is
