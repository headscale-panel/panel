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

func (s *SystemController) ListUsers(c *gin.Context) {
	var req services.ListResourceRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	users, total, err := services.SystemService.ListUsers(req.Page, req.PageSize)
	if err != nil {
		serializer.Fail(c, err)
		return
	}

	serializer.Success(c, gin.H{
		"list":  users,
		"total": total,
	})
}

type CreateUserRequest struct {
	Username    string `json:"username" binding:"required"`
	Password    string `json:"password" binding:"required"`
	Email       string `json:"email"`
	GroupID     uint   `json:"group_id"`
	DisplayName string `json:"display_name"`
}

func (s *SystemController) CreateUser(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	if err := services.SystemService.CreateUser(req.Username, req.Password, req.Email, req.GroupID, req.DisplayName); err != nil {
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

func (s *SystemController) UpdateUser(c *gin.Context) {
	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	if err := services.SystemService.UpdateUser(req.ID, req.Email, req.GroupID, req.Password, req.DisplayName); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

type DeleteUserRequest struct {
	ID uint `json:"id" binding:"required"`
}

func (s *SystemController) DeleteUser(c *gin.Context) {
	var req DeleteUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	if err := services.SystemService.DeleteUser(req.ID); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

func (s *SystemController) ListGroups(c *gin.Context) {
	var req services.ListResourceRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	groups, total, err := services.GroupService.List(req.Page, req.PageSize)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, gin.H{
		"list":  groups,
		"total": total,
	})
}

type CreateGroupRequest struct {
	Name          string `json:"name" binding:"required"`
	PermissionIDs []uint `json:"permission_ids"`
}

func (s *SystemController) CreateGroup(c *gin.Context) {
	var req CreateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	group, err := services.GroupService.Create(req.Name, req.PermissionIDs)
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

func (s *SystemController) UpdateGroup(c *gin.Context) {
	var req UpdateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	if err := services.GroupService.Update(req.ID, req.Name, req.PermissionIDs); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

type DeleteGroupRequest struct {
	ID uint `json:"id" binding:"required"`
}

func (s *SystemController) DeleteGroup(c *gin.Context) {
	var req DeleteGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	if err := services.GroupService.Delete(req.ID); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

type GroupPermissionsRequest struct {
	ID            uint   `json:"id" binding:"required"`
	PermissionIDs []uint `json:"permission_ids" binding:"required"`
}

func (s *SystemController) UpdateGroupPermissions(c *gin.Context) {
	var req GroupPermissionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	if err := services.GroupService.UpdatePermissions(req.ID, req.PermissionIDs); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

func (s *SystemController) AddGroupPermissions(c *gin.Context) {
	var req GroupPermissionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	if err := services.GroupService.AddPermissions(req.ID, req.PermissionIDs); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

func (s *SystemController) RemoveGroupPermissions(c *gin.Context) {
	var req GroupPermissionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	if err := services.GroupService.RemovePermissions(req.ID, req.PermissionIDs); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

func (s *SystemController) ListPermissions(c *gin.Context) {
	permissions, err := services.PermissionService.GetAllPermissions()
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, permissions)
}
