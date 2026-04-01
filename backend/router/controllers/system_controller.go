package controllers

import (
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

type SystemController struct{}

func NewSystemController() *SystemController {
	return &SystemController{}
}

// ListUsers godoc
// @Summary List system users
// @Tags system
// @Produce json
// @Param page query int false "Page number" default(1)
// @Param page_size query int false "Page size" default(10)
// @Param all query bool false "Return all records"
// @Success 200 {object} serializer.Response{data=serializer.PaginatedData{list=[]model.User}}
// @Security BearerAuth
// @Router /system/users [get]
func (s *SystemController) ListUsers(c *gin.Context) {
	var q serializer.PaginationQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}
	page, pageSize := q.Resolve()

	userID := c.GetUint("userID")
	users, total, err := services.SystemService.ListUsers(userID, page, pageSize)
	if err != nil {
		serializer.Fail(c, err)
		return
	}

	serializer.SuccessPage(c, users, total, page, pageSize)
}

type CreateUserRequest struct {
	Username    string `json:"username" binding:"required"`
	Password    string `json:"password"`
	Email       string `json:"email"`
	GroupID     uint   `json:"group_id"`
	DisplayName string `json:"display_name"`
}

// CreateUser godoc
// @Summary Create a system user
// @Tags system
// @Accept json
// @Produce json
// @Param body body CreateUserRequest true "User data"
// @Success 200 {object} serializer.Response
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /system/users [post]
func (s *SystemController) CreateUser(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	// Password is required unless third-party OIDC is enabled.
	// Built-in OIDC still uses panel passwords, so password is required.
	if !services.PanelSettingsService.IsThirdPartyOIDCEnabled() && req.Password == "" {
		serializer.Fail(c, serializer.NewError(serializer.CodeParamErr, "password is required", nil))
		return
	}

	userID := c.GetUint("userID")
	if err := services.SystemService.CreateUser(userID, req.Username, req.Password, req.Email, req.GroupID, req.DisplayName); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

type UpdateUserRequest struct {
	ID          uint   `json:"id" binding:"required"`
	Email       string `json:"email"`
	GroupID     uint   `json:"group_id"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

// UpdateUser godoc
// @Summary Update a system user
// @Tags system
// @Accept json
// @Produce json
// @Param body body UpdateUserRequest true "User update data"
// @Success 200 {object} serializer.Response
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /system/users [put]
func (s *SystemController) UpdateUser(c *gin.Context) {
	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	userID := c.GetUint("userID")
	if err := services.SystemService.UpdateUser(userID, req.ID, req.Email, req.GroupID, req.Password, req.DisplayName); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

type DeleteUserRequest struct {
	ID uint `json:"id" binding:"required"`
}

// DeleteUser godoc
// @Summary Delete a system user
// @Tags system
// @Accept json
// @Produce json
// @Param body body DeleteUserRequest true "User delete request"
// @Success 200 {object} serializer.Response
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /system/users [delete]
func (s *SystemController) DeleteUser(c *gin.Context) {
	var req DeleteUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	userID := c.GetUint("userID")
	if err := services.SystemService.DeleteUser(userID, req.ID); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

// ListGroups godoc
// @Summary List user groups
// @Tags system
// @Produce json
// @Param page query int false "Page number" default(1)
// @Param page_size query int false "Page size" default(10)
// @Param all query bool false "Return all records"
// @Success 200 {object} serializer.Response{data=serializer.PaginatedData{list=[]model.Group}}
// @Security BearerAuth
// @Router /system/groups [get]
func (s *SystemController) ListGroups(c *gin.Context) {
	var q serializer.PaginationQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}
	page, pageSize := q.Resolve()

	userID := c.GetUint("userID")
	groups, total, err := services.GroupService.List(userID, page, pageSize)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.SuccessPage(c, groups, total, page, pageSize)
}

type CreateGroupRequest struct {
	Name          string `json:"name" binding:"required"`
	PermissionIDs []uint `json:"permission_ids"`
}

// CreateGroup godoc
// @Summary Create a user group
// @Tags system
// @Accept json
// @Produce json
// @Param body body CreateGroupRequest true "Group data"
// @Success 200 {object} serializer.Response{data=model.Group}
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /system/groups [post]
func (s *SystemController) CreateGroup(c *gin.Context) {
	var req CreateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	userID := c.GetUint("userID")
	group, err := services.GroupService.Create(userID, req.Name, req.PermissionIDs)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, group)
}

type UpdateGroupRequest struct {
	ID            uint   `json:"id" binding:"required"`
	Name          string `json:"name" binding:"required"`
	PermissionIDs []uint `json:"permission_ids"`
}

// UpdateGroup godoc
// @Summary Update a user group
// @Tags system
// @Accept json
// @Produce json
// @Param body body UpdateGroupRequest true "Group update data"
// @Success 200 {object} serializer.Response
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /system/groups [put]
func (s *SystemController) UpdateGroup(c *gin.Context) {
	var req UpdateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	userID := c.GetUint("userID")
	if err := services.GroupService.Update(userID, req.ID, req.Name, req.PermissionIDs); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

type DeleteGroupRequest struct {
	ID uint `json:"id" binding:"required"`
}

// DeleteGroup godoc
// @Summary Delete a user group
// @Tags system
// @Accept json
// @Produce json
// @Param body body DeleteGroupRequest true "Group delete request"
// @Success 200 {object} serializer.Response
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /system/groups [delete]
func (s *SystemController) DeleteGroup(c *gin.Context) {
	var req DeleteGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	userID := c.GetUint("userID")
	if err := services.GroupService.Delete(userID, req.ID); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

type GroupPermissionsRequest struct {
	ID            uint   `json:"id" binding:"required"`
	PermissionIDs []uint `json:"permission_ids" binding:"required"`
}

// UpdateGroupPermissions godoc
// @Summary Replace group permissions
// @Tags system
// @Accept json
// @Produce json
// @Param body body GroupPermissionsRequest true "Group permissions"
// @Success 200 {object} serializer.Response
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /system/groups/permissions [put]
func (s *SystemController) UpdateGroupPermissions(c *gin.Context) {
	var req GroupPermissionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	userID := c.GetUint("userID")
	if err := services.GroupService.UpdatePermissions(userID, req.ID, req.PermissionIDs); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

// AddGroupPermissions godoc
// @Summary Add permissions to a group
// @Tags system
// @Accept json
// @Produce json
// @Param body body GroupPermissionsRequest true "Group permissions"
// @Success 200 {object} serializer.Response
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /system/groups/permissions [post]
func (s *SystemController) AddGroupPermissions(c *gin.Context) {
	var req GroupPermissionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	userID := c.GetUint("userID")
	if err := services.GroupService.AddPermissions(userID, req.ID, req.PermissionIDs); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

// RemoveGroupPermissions godoc
// @Summary Remove permissions from a group
// @Tags system
// @Accept json
// @Produce json
// @Param body body GroupPermissionsRequest true "Group permissions"
// @Success 200 {object} serializer.Response
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /system/groups/permissions [delete]
func (s *SystemController) RemoveGroupPermissions(c *gin.Context) {
	var req GroupPermissionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	userID := c.GetUint("userID")
	if err := services.GroupService.RemovePermissions(userID, req.ID, req.PermissionIDs); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

// ListPermissions godoc
// @Summary List all available permissions
// @Tags system
// @Produce json
// @Success 200 {object} serializer.Response{data=[]model.Permission}
// @Security BearerAuth
// @Router /system/permissions [get]
func (s *SystemController) ListPermissions(c *gin.Context) {
	userID := c.GetUint("userID")
	permissions, err := services.PermissionService.GetAllPermissions(userID)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, permissions)
}
