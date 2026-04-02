package controllers

import (
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"
	"strconv"

	"github.com/gin-gonic/gin"
)

// PanelAccountController handles Panel Account management endpoints.
type PanelAccountController struct{}

func NewPanelAccountController() *PanelAccountController {
	return &PanelAccountController{}
}

// List godoc
// @Summary List panel accounts
// @Tags panel-accounts
// @Produce json
// @Param page query int false "Page number" default(1)
// @Param page_size query int false "Page size" default(10)
// @Param search query string false "Search username or email"
// @Param status query string false "Filter by status: active, inactive"
// @Param group_id query int false "Filter by group ID"
// @Param provider query string false "Filter by provider: local, oidc, headscale"
// @Success 200 {object} serializer.Response{data=serializer.PaginatedData}
// @Security BearerAuth
// @Router /panel-accounts [get]
func (ctrl *PanelAccountController) List(c *gin.Context) {
	var q serializer.PaginationQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}
	page, pageSize := q.Resolve()

	groupIDStr := c.Query("group_id")
	var groupID uint
	if groupIDStr != "" {
		if v, err := strconv.ParseUint(groupIDStr, 10, 32); err == nil {
			groupID = uint(v)
		}
	}

	query := services.PanelAccountListQuery{
		Search:   c.Query("search"),
		Status:   c.Query("status"),
		GroupID:  groupID,
		Provider: c.Query("provider"),
		Page:     page,
		PageSize: pageSize,
	}

	actorUserID := c.GetUint("userID")
	items, total, err := services.PanelAccountService.List(actorUserID, query)
	if err != nil {
		serializer.Fail(c, err)
		return
	}

	serializer.SuccessPage(c, items, total, page, pageSize)
}

// GetDetail godoc
// @Summary Get panel account detail
// @Tags panel-accounts
// @Produce json
// @Param id path int true "Account ID"
// @Success 200 {object} serializer.Response{data=services.PanelAccountDetail}
// @Security BearerAuth
// @Router /panel-accounts/{id} [get]
func (ctrl *PanelAccountController) GetDetail(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		serializer.Fail(c, serializer.NewError(serializer.CodeParamErr, "invalid account id", nil))
		return
	}

	actorUserID := c.GetUint("userID")
	detail, svcErr := services.PanelAccountService.GetDetail(actorUserID, uint(id))
	if svcErr != nil {
		serializer.Fail(c, svcErr)
		return
	}

	serializer.Success(c, detail)
}

type createPanelAccountRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password"`
	Email    string `json:"email"`
	GroupID  uint   `json:"group_id"`
}

// Create godoc
// @Summary Create a panel account
// @Tags panel-accounts
// @Accept json
// @Produce json
// @Param body body createPanelAccountRequest true "Account data"
// @Success 200 {object} serializer.Response
// @Security BearerAuth
// @Router /panel-accounts [post]
func (ctrl *PanelAccountController) Create(c *gin.Context) {
	var req createPanelAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	actorUserID := c.GetUint("userID")
	if err := services.PanelAccountService.Create(actorUserID, req.Username, req.Password, req.Email, req.GroupID); err != nil {
		serializer.Fail(c, err)
		return
	}

	serializer.Success(c, nil)
}

type updatePanelAccountRequest struct {
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	Password    string `json:"password"`
	GroupID     uint   `json:"group_id"`
}

// Update godoc
// @Summary Update a panel account
// @Tags panel-accounts
// @Accept json
// @Produce json
// @Param id path int true "Account ID"
// @Param body body updatePanelAccountRequest true "Account update data"
// @Success 200 {object} serializer.Response
// @Security BearerAuth
// @Router /panel-accounts/{id} [put]
func (ctrl *PanelAccountController) Update(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		serializer.Fail(c, serializer.NewError(serializer.CodeParamErr, "invalid account id", nil))
		return
	}

	var req updatePanelAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	actorUserID := c.GetUint("userID")
	if svcErr := services.PanelAccountService.Update(actorUserID, uint(id), req.Email, req.DisplayName, req.Password, req.GroupID); svcErr != nil {
		serializer.Fail(c, svcErr)
		return
	}

	serializer.Success(c, nil)
}

type setStatusRequest struct {
	IsActive bool `json:"is_active"`
}

// SetStatus godoc
// @Summary Enable or disable a panel account
// @Tags panel-accounts
// @Accept json
// @Produce json
// @Param id path int true "Account ID"
// @Param body body setStatusRequest true "Status"
// @Success 200 {object} serializer.Response
// @Security BearerAuth
// @Router /panel-accounts/{id}/status [put]
func (ctrl *PanelAccountController) SetStatus(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		serializer.Fail(c, serializer.NewError(serializer.CodeParamErr, "invalid account id", nil))
		return
	}

	var req setStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	actorUserID := c.GetUint("userID")
	if svcErr := services.PanelAccountService.SetStatus(actorUserID, uint(id), req.IsActive); svcErr != nil {
		serializer.Fail(c, svcErr)
		return
	}

	serializer.Success(c, nil)
}

// ResetTOTP godoc
// @Summary Reset TOTP for a panel account
// @Tags panel-accounts
// @Produce json
// @Param id path int true "Account ID"
// @Success 200 {object} serializer.Response
// @Security BearerAuth
// @Router /panel-accounts/{id}/reset-totp [put]
func (ctrl *PanelAccountController) ResetTOTP(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		serializer.Fail(c, serializer.NewError(serializer.CodeParamErr, "invalid account id", nil))
		return
	}

	actorUserID := c.GetUint("userID")
	if svcErr := services.PanelAccountService.ResetTOTP(actorUserID, uint(id)); svcErr != nil {
		serializer.Fail(c, svcErr)
		return
	}

	serializer.Success(c, nil)
}

// GetLoginIdentities godoc
// @Summary Get login identities for a panel account
// @Tags panel-accounts
// @Produce json
// @Param id path int true "Account ID"
// @Success 200 {object} serializer.Response{data=services.LoginIdentities}
// @Security BearerAuth
// @Router /panel-accounts/{id}/login-identities [get]
func (ctrl *PanelAccountController) GetLoginIdentities(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		serializer.Fail(c, serializer.NewError(serializer.CodeParamErr, "invalid account id", nil))
		return
	}

	actorUserID := c.GetUint("userID")
	identities, svcErr := services.PanelAccountService.GetLoginIdentities(actorUserID, uint(id))
	if svcErr != nil {
		serializer.Fail(c, svcErr)
		return
	}

	serializer.Success(c, identities)
}

// GetNetworkBindings godoc
// @Summary Get network identity bindings for a panel account
// @Tags panel-accounts
// @Produce json
// @Param id path int true "Account ID"
// @Success 200 {object} serializer.Response{data=[]services.NetworkBinding}
// @Security BearerAuth
// @Router /panel-accounts/{id}/network-bindings [get]
func (ctrl *PanelAccountController) GetNetworkBindings(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		serializer.Fail(c, serializer.NewError(serializer.CodeParamErr, "invalid account id", nil))
		return
	}

	actorUserID := c.GetUint("userID")
	bindings, svcErr := services.PanelAccountService.GetNetworkBindings(actorUserID, uint(id))
	if svcErr != nil {
		serializer.Fail(c, svcErr)
		return
	}

	serializer.Success(c, bindings)
}

type updateNetworkBindingsRequest struct {
	Bindings []services.BindingEntry `json:"bindings"`
}

// UpdateNetworkBindings godoc
// @Summary Update network identity bindings for a panel account
// @Tags panel-accounts
// @Accept json
// @Produce json
// @Param id path int true "Account ID"
// @Param body body updateNetworkBindingsRequest true "Bindings"
// @Success 200 {object} serializer.Response
// @Security BearerAuth
// @Router /panel-accounts/{id}/network-bindings [put]
func (ctrl *PanelAccountController) UpdateNetworkBindings(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		serializer.Fail(c, serializer.NewError(serializer.CodeParamErr, "invalid account id", nil))
		return
	}

	var req updateNetworkBindingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	actorUserID := c.GetUint("userID")
	if svcErr := services.PanelAccountService.UpdateNetworkBindings(actorUserID, uint(id), req.Bindings); svcErr != nil {
		serializer.Fail(c, svcErr)
		return
	}

	serializer.Success(c, nil)
}

type setPrimaryBindingRequest struct {
	BindingID uint `json:"binding_id" binding:"required"`
}

// SetPrimaryBinding godoc
// @Summary Set a primary network identity binding for a panel account
// @Tags panel-accounts
// @Accept json
// @Produce json
// @Param id path int true "Account ID"
// @Param body body setPrimaryBindingRequest true "Primary binding"
// @Success 200 {object} serializer.Response
// @Security BearerAuth
// @Router /panel-accounts/{id}/primary-binding [put]
func (ctrl *PanelAccountController) SetPrimaryBinding(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		serializer.Fail(c, serializer.NewError(serializer.CodeParamErr, "invalid account id", nil))
		return
	}

	var req setPrimaryBindingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	actorUserID := c.GetUint("userID")
	if svcErr := services.PanelAccountService.SetPrimaryBinding(actorUserID, uint(id), req.BindingID); svcErr != nil {
		serializer.Fail(c, svcErr)
		return
	}

	serializer.Success(c, nil)
}

// ListAvailableNetworkIdentities godoc
// @Summary List available network identities for binding
// @Tags panel-accounts
// @Produce json
// @Param search query string false "Search name or email"
// @Param exclude_account_id query int false "Exclude identities already bound to this account"
// @Success 200 {object} serializer.Response{data=[]services.NetworkIdentityItem}
// @Security BearerAuth
// @Router /network-identities/available [get]
func (ctrl *PanelAccountController) ListAvailableNetworkIdentities(c *gin.Context) {
	search := c.Query("search")
	excludeStr := c.Query("exclude_account_id")
	var excludeAccountID uint
	if excludeStr != "" {
		if v, err := strconv.ParseUint(excludeStr, 10, 32); err == nil {
			excludeAccountID = uint(v)
		}
	}

	actorUserID := c.GetUint("userID")
	items, err := services.PanelAccountService.ListAvailableNetworkIdentities(actorUserID, search, excludeAccountID)
	if err != nil {
		serializer.Fail(c, err)
		return
	}

	serializer.Success(c, items)
}

// Delete godoc
// @Summary Delete a panel account
// @Tags panel-accounts
// @Accept json
// @Produce json
// @Param id path int true "Account ID"
// @Success 200 {object} serializer.Response
// @Security BearerAuth
// @Router /panel-accounts/{id} [delete]
func (ctrl *PanelAccountController) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		serializer.Fail(c, serializer.NewError(serializer.CodeParamErr, "invalid account id", nil))
		return
	}

	actorUserID := c.GetUint("userID")
	if svcErr := services.PanelAccountService.Delete(actorUserID, uint(id)); svcErr != nil {
		serializer.Fail(c, svcErr)
		return
	}

	serializer.Success(c, nil)
}
