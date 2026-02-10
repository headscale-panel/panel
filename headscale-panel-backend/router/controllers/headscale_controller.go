package controllers

import (
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"
	"strconv"

	"github.com/gin-gonic/gin"
)

type HeadscaleController struct{}

func NewHeadscaleController() *HeadscaleController {
	return &HeadscaleController{}
}

func (h *HeadscaleController) ListUsers(c *gin.Context) {
	users, err := services.HeadscaleService.ListHeadscaleUsers()
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, users)
}

func (h *HeadscaleController) CreateUser(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}
	user, err := services.HeadscaleService.CreateUser(req.Name)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, user)
}

func (h *HeadscaleController) RenameUser(c *gin.Context) {
	var req struct {
		OldName string `json:"old_name" binding:"required"`
		NewName string `json:"new_name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	// Find user ID by listing users and matching name
	users, err := services.HeadscaleService.ListHeadscaleUsers()
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	var userID uint64
	for _, u := range users {
		if u.Name == req.OldName {
			userID = u.ID
			break
		}
	}
	if userID == 0 {
		serializer.FailWithCode(c, serializer.CodeNotFound, "User not found")
		return
	}

	user, err := services.HeadscaleService.RenameUser(userID, req.NewName)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, user)
}

func (h *HeadscaleController) DeleteUser(c *gin.Context) {
	name := c.Query("name")
	if name == "" {
		serializer.FailWithCode(c, serializer.CodeParamErr, "name is required")
		return
	}

	// Find user ID by listing users and matching name
	users, err := services.HeadscaleService.ListHeadscaleUsers()
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	var userID uint64
	for _, u := range users {
		if u.Name == name {
			userID = u.ID
			break
		}
	}
	if userID == 0 {
		serializer.FailWithCode(c, serializer.CodeNotFound, "User not found")
		return
	}

	if err := services.HeadscaleService.DeleteUser(userID); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

func (h *HeadscaleController) ListMachines(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	userFilter := c.Query("user_id")
	statusFilter := c.Query("status")

	machines, total, err := services.HeadscaleService.ListMachines(page, pageSize, userFilter, statusFilter)
	if err != nil {
		serializer.Fail(c, err)
		return
	}

	serializer.Success(c, gin.H{
		"list":  machines,
		"total": total,
	})
}

func (h *HeadscaleController) GetMachine(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		serializer.FailWithCode(c, serializer.CodeParamErr, "Invalid machine ID")
		return
	}

	machine, err := services.HeadscaleService.GetMachine(id)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, machine)
}

func (h *HeadscaleController) RenameMachine(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		serializer.FailWithCode(c, serializer.CodeParamErr, "Invalid machine ID")
		return
	}

	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	machine, err := services.HeadscaleService.RenameMachine(id, req.Name)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, machine)
}

func (h *HeadscaleController) DeleteMachine(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		serializer.FailWithCode(c, serializer.CodeParamErr, "Invalid machine ID")
		return
	}

	if err := services.HeadscaleService.DeleteMachine(id); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

func (h *HeadscaleController) ExpireMachine(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		serializer.FailWithCode(c, serializer.CodeParamErr, "Invalid machine ID")
		return
	}

	machine, err := services.HeadscaleService.ExpireMachine(id)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, machine)
}

func (h *HeadscaleController) SetMachineTags(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		serializer.FailWithCode(c, serializer.CodeParamErr, "Invalid machine ID")
		return
	}

	var req struct {
		Tags []string `json:"tags" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	machine, err := services.HeadscaleService.SetMachineTags(id, req.Tags)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, machine)
}

func (h *HeadscaleController) GetMachineRoutes(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		serializer.FailWithCode(c, serializer.CodeParamErr, "Invalid machine ID")
		return
	}

	machineIDStr := strconv.FormatUint(id, 10)
	routes, _, err := services.RouteService.ListRoutes(1, 1000, "", machineIDStr)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, routes)
}

func (h *HeadscaleController) GetPreAuthKeys(c *gin.Context) {
	user := c.Query("user")
	if user == "" {
		serializer.FailWithCode(c, serializer.CodeParamErr, "user is required")
		return
	}

	// Find the user ID from user name
	users, err := services.HeadscaleService.ListHeadscaleUsers()
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	var userID uint64
	for _, u := range users {
		if u.Name == user {
			userID = u.ID
			break
		}
	}
	if userID == 0 {
		serializer.FailWithCode(c, serializer.CodeNotFound, "User not found")
		return
	}

	keys, err := services.HeadscaleService.GetPreAuthKeys(userID)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, keys)
}

func (h *HeadscaleController) CreatePreAuthKey(c *gin.Context) {
	var req struct {
		User       string `json:"user" binding:"required"`
		Reusable   bool   `json:"reusable"`
		Ephemeral  bool   `json:"ephemeral"`
		Expiration string `json:"expiration"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	// Find user ID
	users, err := services.HeadscaleService.ListHeadscaleUsers()
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	var userID uint64
	for _, u := range users {
		if u.Name == req.User {
			userID = u.ID
			break
		}
	}
	if userID == 0 {
		serializer.FailWithCode(c, serializer.CodeNotFound, "User not found")
		return
	}

	key, err := services.HeadscaleService.CreatePreAuthKey(userID, req.Reusable, req.Ephemeral, req.Expiration)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, key)
}

func (h *HeadscaleController) ExpirePreAuthKey(c *gin.Context) {
	var req struct {
		User string `json:"user" binding:"required"`
		Key  string `json:"key" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	// Find user ID
	users, err := services.HeadscaleService.ListHeadscaleUsers()
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	var userID uint64
	for _, u := range users {
		if u.Name == req.User {
			userID = u.ID
			break
		}
	}
	if userID == 0 {
		serializer.FailWithCode(c, serializer.CodeNotFound, "User not found")
		return
	}

	if err := services.HeadscaleService.ExpirePreAuthKey(userID, req.Key); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

func (h *HeadscaleController) CheckAccess(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		serializer.Fail(c, serializer.ErrInvalidToken)
		return
	}

	// Get permissions
	perms, err := services.GroupService.GetUserPermissions(userID.(uint))
	if err != nil {
		serializer.Fail(c, err)
		return
	}

	// Check for admin/all access
	canAccessAll := false
	for _, p := range perms {
		if p == "*:*:*" || p == "headscale:machine:list:all" {
			canAccessAll = true
			break
		}
	}

	machines, err := services.HeadscaleService.GetAccessibleMachines(userID.(uint), canAccessAll)
	if err != nil {
		serializer.Fail(c, err)
		return
	}

	serializer.Success(c, machines)
}
