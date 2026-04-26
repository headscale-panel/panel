package controllers

import (
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type HeadscaleController struct{}

func NewHeadscaleController() *HeadscaleController {
	return &HeadscaleController{}
}

// HeadscaleCreateUserRequest is the request body for CreateUser.
type HeadscaleCreateUserRequest struct {
	Name        string `json:"name" binding:"required"`
	DisplayName string `json:"display_name"`
	Email       string `json:"email"`
	PictureURL  string `json:"picture_url"`
}

// HeadscaleRenameUserRequest is the request body for RenameUser.
type HeadscaleRenameUserRequest struct {
	OldName     string `json:"old_name" binding:"required"`
	NewName     string `json:"new_name" binding:"required"`
	DisplayName string `json:"display_name"`
	Email       string `json:"email"`
	PictureURL  string `json:"picture_url"`
}

// HeadscaleRenameMachineRequest is the request body for RenameMachine.
type HeadscaleRenameMachineRequest struct {
	Name string `json:"name" binding:"required"`
}

// HeadscaleSetTagsRequest is the request body for SetMachineTags.
type HeadscaleSetTagsRequest struct {
	Tags []string `json:"tags" binding:"required"`
}

// HeadscaleCreatePreAuthKeyRequest is the request body for CreatePreAuthKey.
type HeadscaleCreatePreAuthKeyRequest struct {
	User       string `json:"user" binding:"required"`
	Reusable   bool   `json:"reusable"`
	Ephemeral  bool   `json:"ephemeral"`
	Expiration string `json:"expiration"`
}

// HeadscaleExpirePreAuthKeyRequest is the request body for ExpirePreAuthKey.
type HeadscaleExpirePreAuthKeyRequest struct {
	User string `json:"user" binding:"required"`
	Key  string `json:"key" binding:"required"`
}

// HeadscaleRegisterNodeRequest is the request body for RegisterNode.
type HeadscaleRegisterNodeRequest struct {
	User string `json:"user" binding:"required"`
	Key  string `json:"key" binding:"required"`
}

// DeleteUserQuery is the query parameter struct for DeleteUser.
type DeleteUserQuery struct {
	Name string `form:"name" binding:"required"`
}

// ListMachinesQuery is the query parameter struct for ListMachines.
type ListMachinesQuery struct {
	unifyerror.PaginationQuery
	UserID string `form:"user_id"`
	Status string `form:"status"`
}

// GetPreAuthKeysQuery is the query parameter struct for GetPreAuthKeys.
type GetPreAuthKeysQuery struct {
	User string `form:"user" binding:"required"`
}

// ListUsers godoc
// @Summary List Headscale users
// @Tags headscale
// @Produce json
// @Success 200 {object} unifyerror.Response{data=[]services.HeadscaleUser}
// @Security BearerAuth
// @Router /headscale/users [get]
func (h *HeadscaleController) ListUsers(c *gin.Context) {
	actorUserID := c.GetUint("userID")
	users, err := services.HeadscaleService.ListHeadscaleUsersWithContext(c.Request.Context(), actorUserID)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, users)
}

// CreateUser godoc
// @Summary Create a Headscale user
// @Tags headscale
// @Accept json
// @Produce json
// @Param body body HeadscaleCreateUserRequest true "User name"
// @Success 200 {object} unifyerror.Response{data=services.HeadscaleUser}
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/users [post]
func (h *HeadscaleController) CreateUser(c *gin.Context) {
	var req HeadscaleCreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}
	userID := c.GetUint("userID")
	user, err := services.HeadscaleService.CreateUserWithContext(c.Request.Context(), userID, req.Name, req.DisplayName, req.Email, req.PictureURL)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, user)
}

// RenameUser godoc
// @Summary Rename a Headscale user
// @Tags headscale
// @Accept json
// @Produce json
// @Param body body HeadscaleRenameUserRequest true "Old and new name"
// @Success 200 {object} unifyerror.Response{data=services.HeadscaleUser}
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/users/rename [put]
func (h *HeadscaleController) RenameUser(c *gin.Context) {
	var req HeadscaleRenameUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	// Find user ID by listing users and matching name
	actorUserID := c.GetUint("userID")
	users, err := services.HeadscaleService.ListHeadscaleUsersWithContext(c.Request.Context(), actorUserID)
	if err != nil {
		unifyerror.Fail(c, err)
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
		unifyerror.Fail(c, unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound, "User not found"))
		return
	}

	user, err := services.HeadscaleService.RenameUserWithContext(c.Request.Context(), actorUserID, targetUserID, req.NewName, req.DisplayName, req.Email, req.PictureURL)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, user)
}

// DeleteUser godoc
// @Summary Delete a Headscale user by name
// @Tags headscale
// @Produce json
// @Param name query string true "User name"
// @Success 200 {object} unifyerror.Response
// @Failure 404 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/users [delete]
func (h *HeadscaleController) DeleteUser(c *gin.Context) {
	var q DeleteUserQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	// Find user ID by listing users and matching name
	actorUserID := c.GetUint("userID")
	users, err := services.HeadscaleService.ListHeadscaleUsersWithContext(c.Request.Context(), actorUserID)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	var targetUserID uint64
	for _, u := range users {
		if u.Name == q.Name {
			targetUserID = u.ID
			break
		}
	}
	if targetUserID == 0 {
		unifyerror.Fail(c, unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound, "User not found"))
		return
	}

	if err := services.HeadscaleService.DeleteUserWithContext(c.Request.Context(), actorUserID, targetUserID); err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, nil)
}

// ListMachines godoc
// @Summary List Headscale machines
// @Tags headscale
// @Produce json
// @Param page query int false "Page number" default(1)
// @Param page_size query int false "Page size" default(10)
// @Param all query bool false "Return all records"
// @Param user_id query string false "Filter by user ID"
// @Param status query string false "Filter by status (online/offline)"
// @Success 200 {object} unifyerror.Response{data=unifyerror.PaginatedData{list=[]services.HeadscaleMachine}}
// @Security BearerAuth
// @Router /headscale/machines [get]
func (h *HeadscaleController) ListMachines(c *gin.Context) {
	var q ListMachinesQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}
	page, pageSize := q.Resolve()

	userID := c.GetUint("userID")
	machines, total, err := services.HeadscaleService.ListMachinesWithContext(c.Request.Context(), userID, page, pageSize, q.UserID, q.Status)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	unifyerror.SuccessPage(c, machines, total, page, pageSize)
}

// GetMachine godoc
// @Summary Get a Headscale machine by ID
// @Tags headscale
// @Produce json
// @Param id path string true "Machine ID"
// @Success 200 {object} unifyerror.Response{data=services.HeadscaleMachine}
// @Failure 404 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/machines/{id} [get]
func (h *HeadscaleController) GetMachine(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		unifyerror.Fail(c, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "Invalid machine ID"))
		return
	}

	userID := c.GetUint("userID")
	machine, err := services.HeadscaleService.GetMachineWithContext(c.Request.Context(), userID, id)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, machine)
}

// RenameMachine godoc
// @Summary Rename a Headscale machine
// @Tags headscale
// @Accept json
// @Produce json
// @Param id path string true "Machine ID"
// @Param body body HeadscaleRenameMachineRequest true "New name"
// @Success 200 {object} unifyerror.Response{data=services.HeadscaleMachine}
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/machines/{id}/rename [put]
func (h *HeadscaleController) RenameMachine(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		unifyerror.Fail(c, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "Invalid machine ID"))
		return
	}

	var req HeadscaleRenameMachineRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	userID := c.GetUint("userID")
	machine, err := services.HeadscaleService.RenameMachineWithContext(c.Request.Context(), userID, id, req.Name)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, machine)
}

// DeleteMachine godoc
// @Summary Delete a Headscale machine
// @Tags headscale
// @Produce json
// @Param id path string true "Machine ID"
// @Success 200 {object} unifyerror.Response
// @Failure 404 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/machines/{id} [delete]
func (h *HeadscaleController) DeleteMachine(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		unifyerror.Fail(c, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "Invalid machine ID"))
		return
	}

	userID := c.GetUint("userID")
	if err := services.HeadscaleService.DeleteMachineWithContext(c.Request.Context(), userID, id); err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, nil)
}

// ExpireMachine godoc
// @Summary Expire a Headscale machine
// @Tags headscale
// @Produce json
// @Param id path string true "Machine ID"
// @Success 200 {object} unifyerror.Response{data=services.HeadscaleMachine}
// @Failure 404 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/machines/{id}/expire [post]
func (h *HeadscaleController) ExpireMachine(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		unifyerror.Fail(c, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "Invalid machine ID"))
		return
	}

	userID := c.GetUint("userID")
	machine, err := services.HeadscaleService.ExpireMachineWithContext(c.Request.Context(), userID, id)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, machine)
}

// SetMachineTags godoc
// @Summary Set tags on a Headscale machine
// @Tags headscale
// @Accept json
// @Produce json
// @Param id path string true "Machine ID"
// @Param body body HeadscaleSetTagsRequest true "Tags list"
// @Success 200 {object} unifyerror.Response{data=services.HeadscaleMachine}
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/machines/{id}/tags [put]
func (h *HeadscaleController) SetMachineTags(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		unifyerror.Fail(c, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "Invalid machine ID"))
		return
	}

	var req HeadscaleSetTagsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	userID := c.GetUint("userID")
	machine, err := services.HeadscaleService.SetMachineTagsWithContext(c.Request.Context(), userID, id, req.Tags)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, machine)
}

// GetMachineRoutes godoc
// @Summary Get routes for a Headscale machine
// @Tags headscale
// @Produce json
// @Param id path string true "Machine ID"
// @Success 200 {object} unifyerror.Response{data=[]object}
// @Security BearerAuth
// @Router /headscale/machines/{id}/routes [get]
func (h *HeadscaleController) GetMachineRoutes(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		unifyerror.Fail(c, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "Invalid machine ID"))
		return
	}

	machineIDStr := strconv.FormatUint(id, 10)
	userID := c.GetUint("userID")
	routes, _, err := services.RouteService.ListRoutesWithContext(c.Request.Context(), userID, 1, 1000, "", machineIDStr)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, routes)
}

// GetPreAuthKeys godoc
// @Summary Get pre-auth keys for a Headscale user
// @Tags headscale
// @Produce json
// @Param user query string true "Headscale user name"
// @Success 200 {object} unifyerror.Response{data=[]services.HeadscaleAuthKey}
// @Failure 404 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/preauthkeys [get]
func (h *HeadscaleController) GetPreAuthKeys(c *gin.Context) {
	var q GetPreAuthKeysQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	// Find the user ID from user name
	actorUserID := c.GetUint("userID")
	users, err := services.HeadscaleService.ListHeadscaleUsersWithContext(c.Request.Context(), actorUserID)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	var targetUserID uint64
	for _, u := range users {
		if u.Name == q.User {
			targetUserID = u.ID
			break
		}
	}
	if targetUserID == 0 {
		unifyerror.Fail(c, unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound, "User not found"))
		return
	}

	keys, err := services.HeadscaleService.GetPreAuthKeysWithContext(c.Request.Context(), actorUserID, targetUserID)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, keys)
}

// CreatePreAuthKey godoc
// @Summary Create a pre-auth key for a Headscale user
// @Tags headscale
// @Accept json
// @Produce json
// @Param body body HeadscaleCreatePreAuthKeyRequest true "Pre-auth key parameters"
// @Success 200 {object} unifyerror.Response{data=services.HeadscaleAuthKey}
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/preauthkeys [post]
func (h *HeadscaleController) CreatePreAuthKey(c *gin.Context) {
	var req HeadscaleCreatePreAuthKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	// Find user ID
	actorUserID := c.GetUint("userID")
	users, err := services.HeadscaleService.ListHeadscaleUsersWithContext(c.Request.Context(), actorUserID)
	if err != nil {
		unifyerror.Fail(c, err)
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
		unifyerror.Fail(c, unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound, "User not found"))
		return
	}

	key, err := services.HeadscaleService.CreatePreAuthKeyWithContext(c.Request.Context(), actorUserID, targetUserID, req.Reusable, req.Ephemeral, req.Expiration)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, key)
}

// ExpirePreAuthKey godoc
// @Summary Expire a pre-auth key
// @Tags headscale
// @Accept json
// @Produce json
// @Param body body HeadscaleExpirePreAuthKeyRequest true "User and key"
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/preauthkeys/expire [post]
func (h *HeadscaleController) ExpirePreAuthKey(c *gin.Context) {
	var req HeadscaleExpirePreAuthKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	// Find user ID
	actorUserID := c.GetUint("userID")
	users, err := services.HeadscaleService.ListHeadscaleUsersWithContext(c.Request.Context(), actorUserID)
	if err != nil {
		unifyerror.Fail(c, err)
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
		unifyerror.Fail(c, unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound, "User not found"))
		return
	}

	if err := services.HeadscaleService.ExpirePreAuthKeyWithContext(c.Request.Context(), actorUserID, targetUserID, req.Key); err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, nil)
}

// CheckAccess godoc
// @Summary Check ACL access for the current user's machines
// @Tags headscale
// @Produce json
// @Success 200 {object} unifyerror.Response{data=[]object}
// @Security BearerAuth
// @Router /headscale/acl/access [get]
func (h *HeadscaleController) CheckAccess(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		unifyerror.Fail(c, unifyerror.InvalidToken())
		return
	}

	// Get permissions
	perms, err := services.GroupService.GetUserPermissions(userID.(uint))
	if err != nil {
		unifyerror.Fail(c, err)
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
		unifyerror.Fail(c, err)
		return
	}

	unifyerror.Success(c, machines)
}

// RegisterNode godoc
// @Summary Register a Headscale node with a machine key
// @Tags headscale
// @Accept json
// @Produce json
// @Param body body HeadscaleRegisterNodeRequest true "User and machine key"
// @Success 200 {object} unifyerror.Response{data=services.HeadscaleMachine}
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/machines/register [post]
func (h *HeadscaleController) RegisterNode(c *gin.Context) {
	var req HeadscaleRegisterNodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	actorUserID := c.GetUint("userID")
	machine, err := services.HeadscaleService.RegisterNodeWithContext(c.Request.Context(), actorUserID, req.User, req.Key)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, machine)
}
