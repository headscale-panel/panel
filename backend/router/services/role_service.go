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
	"errors"
	"headscale-panel/internal/account"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/unifyerror"
	"net/http"
	"strings"
)

// PermissionCatalogue is the compiled permission list, for the role editor.
type PermissionCatalogueEntry struct {
	ID   uint   `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
	Type string `json:"type"`
}

// PermissionCatalogue returns every permission row.
func PermissionCatalogue() ([]PermissionCatalogueEntry, error) {
	rows, err := Accounts.ListPermissions()
	if err != nil {
		return nil, unifyerror.DbError(err)
	}

	out := make([]PermissionCatalogueEntry, 0, len(rows))
	for _, row := range rows {
		out = append(out, PermissionCatalogueEntry{
			ID:   row.ID,
			Code: row.Code,
			Name: row.Name,
			Type: row.Type,
		})
	}
	return out, nil
}

// CreateRole adds a role with its permission set.
func CreateRole(actorID uint, name, description string, permissionIDs []uint) (*account.Role, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, unifyerror.WrongParam("name")
	}
	if err := Accounts.AuthorizeRoleMutation(actorID, 0, permissionIDs); err != nil {
		return nil, mapRoleError(err)
	}

	role, err := Accounts.CreateRole(name, description, permissionIDs)
	if err != nil {
		return nil, mapRoleError(err)
	}
	return role, nil
}

// UpdateRole rewrites a role's name, description and permission set.
func UpdateRole(actorID, id uint, name, description string, permissionIDs []uint) (*account.Role, error) {
	if err := Accounts.AuthorizeRoleMutation(actorID, id, permissionIDs); err != nil {
		return nil, mapRoleError(err)
	}
	role, err := Accounts.UpdateRole(id, name, description, permissionIDs)
	if err != nil {
		return nil, mapRoleError(err)
	}
	return role, nil
}

// SetRolePermissions replaces the permission set only.
func SetRolePermissions(actorID, id uint, permissionIDs []uint) (*account.Role, error) {
	if err := Accounts.AuthorizeRoleMutation(actorID, id, permissionIDs); err != nil {
		return nil, mapRoleError(err)
	}
	role, err := Accounts.SetRolePermissions(id, permissionIDs)
	if err != nil {
		return nil, mapRoleError(err)
	}
	return role, nil
}

// DeleteRole removes a role that no account holds.
func DeleteRole(actorID, id uint) error {
	if err := Accounts.AuthorizeRoleMutation(actorID, id, nil); err != nil {
		return mapRoleError(err)
	}
	if err := Accounts.DeleteRole(id); err != nil {
		return mapRoleError(err)
	}
	return nil
}

func mapRoleError(err error) error {
	if err == nil {
		return nil
	}

	switch {
	case errors.Is(err, account.ErrRoleNotFound):
		return unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound, err.Error())
	case errors.Is(err, account.ErrPrivilegeEscalation):
		return unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, err.Error())
	case errors.Is(err, account.ErrSystemRoleImmutable),
		errors.Is(err, account.ErrRoleInUse),
		errors.Is(err, account.ErrPermissionUnknown):
		return unifyerror.New(http.StatusConflict, unifyerror.CodeConflict, err.Error())
	}
	return unifyerror.DbError(err)
}

var _ = constants.SystemAdminRoleName
