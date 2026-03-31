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
	actorUserID := c.GetUint("userID")
	users, err := services.HeadscaleService.ListHeadscaleUsersWithContext(c.Request.Context(), actorUserID)
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
	userID := c.GetUint("userID")
	user, err := services.HeadscaleService.CreateUserWithContext(c.Request.Context(), userID, req.Name)
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
	actorUserID := c.GetUint("userID")
	users, err := services.HeadscaleService.ListHeadscaleUsersWithContext(c.Request.Context(), actorUserID)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	var targetUserID uint64
	for _, u := range users {
		if u.Name == req.OldName {
			targetUserID = u.ID
			break
		}
	}
	if targetUserID == 0 {
		serializer.FailWithCode(c, serializer.CodeNotFound, "User not found")
		return
	}

	user, err := services.HeadscaleService.RenameUserWithContext(c.Request.Context(), actorUserID, targetUserID, req.NewName)
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
	actorUserID := c.GetUint("userID")
	users, err := services.HeadscaleService.ListHeadscaleUsersWithContext(c.Request.Context(), actorUserID)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	var targetUserID uint64
	for _, u := range users {
		if u.Name == name {
			targetUserID = u.ID
			break
		}
	}
	if targetUserID == 0 {
		serializer.FailWithCode(c, serializer.CodeNotFound, "User not found")
		return
	}

	if err := services.HeadscaleService.DeleteUserWithContext(c.Request.Context(), actorUserID, targetUserID); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}

func (h *HeadscaleController) ListMachines(c *gin.Context) {
	page, pageSize := serializer.ParsePaginationQuery(c)
	userFilter := c.Query("user_id")
	statusFilter := c.Query("status")

	userID := c.GetUint("userID")
	machines, total, err := services.HeadscaleService.ListMachinesWithContext(c.Request.Context(), userID, page, pageSize, userFilter, statusFilter)
	if err != nil {
		serializer.Fail(c, err)
		return
	}

	serializer.SuccessPage(c, machines, total, page, pageSize)
}

func (h *HeadscaleController) GetMachine(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		serializer.FailWithCode(c, serializer.CodeParamErr, "Invalid machine ID")
		return
	}

	userID := c.GetUint("userID")
	machine, err := services.HeadscaleService.GetMachineWithContext(c.Request.Context(), userID, id)
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

	userID := c.GetUint("userID")
	machine, err := services.HeadscaleService.RenameMachineWithContext(c.Request.Context(), userID, id, req.Name)
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

	userID := c.GetUint("userID")
	if err := services.HeadscaleService.DeleteMachineWithContext(c.Request.Context(), userID, id); err != nil {
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

	userID := c.GetUint("userID")
	machine, err := services.HeadscaleService.ExpireMachineWithContext(c.Request.Context(), userID, id)
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

	userID := c.GetUint("userID")
	machine, err := services.HeadscaleService.SetMachineTagsWithContext(c.Request.Context(), userID, id, req.Tags)
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
	userID := c.GetUint("userID")
	routes, _, err := services.RouteService.ListRoutesWithContext(c.Request.Context(), userID, 1, 1000, "", machineIDStr)
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
	actorUserID := c.GetUint("userID")
	users, err := services.HeadscaleService.ListHeadscaleUsersWithContext(c.Request.Context(), actorUserID)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	var targetUserID uint64
	for _, u := range users {
		if u.Name == user {
			targetUserID = u.ID
			break
		}
	}
	if targetUserID == 0 {
		serializer.FailWithCode(c, serializer.CodeNotFound, "User not found")
		return
	}

	keys, err := services.HeadscaleService.GetPreAuthKeysWithContext(c.Request.Context(), actorUserID, targetUserID)
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
	actorUserID := c.GetUint("userID")
	users, err := services.HeadscaleService.ListHeadscaleUsersWithContext(c.Request.Context(), actorUserID)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	var targetUserID uint64
	for _, u := range users {
		if u.Name == req.User {
			targetUserID = u.ID
			break
		}
	}
	if targetUserID == 0 {
		serializer.FailWithCode(c, serializer.CodeNotFound, "User not found")
		return
	}

	key, err := services.HeadscaleService.CreatePreAuthKeyWithContext(c.Request.Context(), actorUserID, targetUserID, req.Reusable, req.Ephemeral, req.Expiration)
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
	actorUserID := c.GetUint("userID")
	users, err := services.HeadscaleService.ListHeadscaleUsersWithContext(c.Request.Context(), actorUserID)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	var targetUserID uint64
	for _, u := range users {
		if u.Name == req.User {
			targetUserID = u.ID
			break
		}
	}
	if targetUserID == 0 {
		serializer.FailWithCode(c, serializer.CodeNotFound, "User not found")
		return
	}

	if err := services.HeadscaleService.ExpirePreAuthKeyWithContext(c.Request.Context(), actorUserID, targetUserID, req.Key); err != nil {
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

	machines, err := services.HeadscaleService.GetAccessibleMachinesWithContext(c.Request.Context(), userID.(uint), userID.(uint), canAccessAll)
	if err != nil {
		serializer.Fail(c, err)
		return
	}

	serializer.Success(c, machines)
}

func (h *HeadscaleController) RegisterNode(c *gin.Context) {
	var req struct {
		User string `json:"user" binding:"required"`
		Key  string `json:"key" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	actorUserID := c.GetUint("userID")
	machine, err := services.HeadscaleService.RegisterNodeWithContext(c.Request.Context(), actorUserID, req.User, req.Key)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, machine)
}
