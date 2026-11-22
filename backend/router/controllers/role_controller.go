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

package controllers

import (
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

// RoleController manages roles and their permission sets.
type RoleController struct{}

// NewRoleController builds the controller.
func NewRoleController() *RoleController {
	return &RoleController{}
}

// List godoc
// @Summary List roles
// @Tags roles
// @Produce json
// @Success 200 {object} unifyerror.Response{data=array}
// @Security BearerAuth
// @Router /roles [get]
func (r *RoleController) List(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionRoleList); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	roles, err := services.Accounts.ListRoles()
	if err != nil {
		unifyerror.Fail(c, dbError(err))
		return
	}
	unifyerror.Success(c, roles)
}

// Catalogue godoc
// @Summary List every permission code
// @Tags roles
// @Produce json
// @Success 200 {object} unifyerror.Response{data=array}
// @Security BearerAuth
// @Router /permissions [get]
func (r *RoleController) Catalogue(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionRoleList); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	entries, err := services.PermissionCatalogue()
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, entries)
}

// CreateRoleRequest is the creation payload.
type CreateRoleRequest struct {
	Name          string `json:"name" binding:"required"`
	Description   string `json:"description"`
	PermissionIDs []uint `json:"permission_ids"`
}

// Create godoc
// @Summary Create a role
// @Tags roles
// @Accept json
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /roles [post]
func (r *RoleController) Create(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionRoleManage); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	var req CreateRoleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	role, err := services.CreateRole(c.GetUint("userID"), req.Name, req.Description, req.PermissionIDs)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, role)
}

// UpdateRoleRequest is the update payload.
type UpdateRoleRequest struct {
	Name          string `json:"name"`
	Description   string `json:"description"`
	PermissionIDs []uint `json:"permission_ids"`
}

// Update godoc
// @Summary Update a role
// @Tags roles
// @Accept json
// @Produce json
// @Param id path int true "Role ID"
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /roles/{id} [put]
func (r *RoleController) Update(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionRoleManage); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	var req UpdateRoleRequest
	if bindErr := c.ShouldBindJSON(&req); bindErr != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	role, updateErr := services.UpdateRole(c.GetUint("userID"), uint(id), req.Name, req.Description, req.PermissionIDs)
	if updateErr != nil {
		unifyerror.Fail(c, updateErr)
		return
	}
	unifyerror.Success(c, role)
}

// SetPermissionsRequest replaces a role's permission set.
type SetPermissionsRequest struct {
	PermissionIDs []uint `json:"permission_ids"`
}

// SetPermissions godoc
// @Summary Replace a role's permissions
// @Tags roles
// @Accept json
// @Produce json
// @Param id path int true "Role ID"
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /roles/{id}/permissions [put]
func (r *RoleController) SetPermissions(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionRoleManage); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	var req SetPermissionsRequest
	if bindErr := c.ShouldBindJSON(&req); bindErr != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	role, setErr := services.SetRolePermissions(c.GetUint("userID"), uint(id), req.PermissionIDs)
	if setErr != nil {
		unifyerror.Fail(c, setErr)
		return
	}
	unifyerror.Success(c, role)
}

// Delete godoc
// @Summary Delete a role
// @Tags roles
// @Produce json
// @Param id path int true "Role ID"
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /roles/{id} [delete]
func (r *RoleController) Delete(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionRoleManage); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	if delErr := services.DeleteRole(c.GetUint("userID"), uint(id)); delErr != nil {
		unifyerror.Fail(c, delErr)
		return
	}
	unifyerror.Success(c, gin.H{"message": "role deleted"})
}
