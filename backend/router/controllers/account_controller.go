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
	"headscale-panel/internal/account"
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

// AccountController manages panel accounts.
type AccountController struct{}

// NewAccountController builds the controller.
func NewAccountController() *AccountController {
	return &AccountController{}
}

// ListAccountsQuery is the list filter.
type ListAccountsQuery struct {
	Query  string `form:"q"`
	Status string `form:"status"`
	RoleID uint   `form:"role_id"`
}

// List godoc
// @Summary List panel accounts
// @Tags accounts
// @Produce json
// @Success 200 {object} unifyerror.Response{data=array}
// @Security BearerAuth
// @Router /accounts [get]
func (a *AccountController) List(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionAccountList); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	var q ListAccountsQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	filter := account.ListFilter{Query: q.Query}
	if q.Status != "" {
		status := account.Status(q.Status)
		if !status.Valid() {
			unifyerror.Fail(c, unifyerror.WrongParam("status"))
			return
		}
		filter.Status = &status
	}
	if q.RoleID != 0 {
		filter.RoleID = &q.RoleID
	}

	accounts, err := services.Accounts.List(filter)
	if err != nil {
		unifyerror.Fail(c, services.MapAccountError(err))
		return
	}
	unifyerror.Success(c, accounts)
}

// Get godoc
// @Summary Read one panel account
// @Tags accounts
// @Produce json
// @Param id path int true "Account ID"
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /accounts/{id} [get]
func (a *AccountController) Get(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionAccountList); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	acc, getErr := services.Accounts.Get(uint(id))
	if getErr != nil {
		unifyerror.Fail(c, services.MapAccountError(getErr))
		return
	}
	unifyerror.Success(c, acc)
}

// CreateAccountRequest is the creation payload.
type CreateAccountRequest struct {
	Username    string `json:"username" binding:"required"`
	Password    string `json:"password"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	RoleID      uint   `json:"role_id" binding:"required"`
}

// Create godoc
// @Summary Create a panel account
// @Tags accounts
// @Accept json
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /accounts [post]
func (a *AccountController) Create(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionAccountCreate); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	var req CreateAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}
	if authErr := services.Accounts.AuthorizeAccountCreate(c.GetUint("userID"), req.RoleID); authErr != nil {
		unifyerror.Fail(c, services.MapAccountError(authErr))
		return
	}

	acc, err := services.CreateAccount(services.AccountCreateInput{
		Username:    req.Username,
		Password:    req.Password,
		Email:       req.Email,
		DisplayName: req.DisplayName,
		RoleID:      req.RoleID,
	})
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, acc)
}

// UpdateAccountRequest carries the mutable fields.
type UpdateAccountRequest struct {
	DisplayName *string `json:"display_name"`
	Email       *string `json:"email"`
	RoleID      *uint   `json:"role_id"`
}

// Update godoc
// @Summary Update a panel account
// @Tags accounts
// @Accept json
// @Produce json
// @Param id path int true "Account ID"
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /accounts/{id} [put]
func (a *AccountController) Update(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionAccountUpdate); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	var req UpdateAccountRequest
	if bindErr := c.ShouldBindJSON(&req); bindErr != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}
	if authErr := services.Accounts.AuthorizeAccountUpdate(c.GetUint("userID"), uint(id), req.RoleID); authErr != nil {
		unifyerror.Fail(c, services.MapAccountError(authErr))
		return
	}

	acc, updateErr := services.Accounts.Update(uint(id), account.UpdateInput{
		DisplayName: req.DisplayName,
		Email:       req.Email,
		RoleID:      req.RoleID,
	})
	if updateErr != nil {
		unifyerror.Fail(c, services.MapAccountError(updateErr))
		return
	}
	unifyerror.Success(c, acc)
}

// SetStatusRequest is the enable/disable payload.
type SetStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

// SetStatus godoc
// @Summary Enable or disable a panel account
// @Tags accounts
// @Accept json
// @Produce json
// @Param id path int true "Account ID"
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /accounts/{id}/status [post]
func (a *AccountController) SetStatus(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionAccountUpdate); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	var req SetStatusRequest
	if bindErr := c.ShouldBindJSON(&req); bindErr != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	status := account.Status(req.Status)
	if !status.Valid() {
		unifyerror.Fail(c, unifyerror.WrongParam("status"))
		return
	}

	if authErr := services.Accounts.AuthorizeAccountManage(c.GetUint("userID"), uint(id)); authErr != nil {
		unifyerror.Fail(c, services.MapAccountError(authErr))
		return
	}

	acc, statusErr := services.Accounts.SetStatus(uint(id), status)
	if statusErr != nil {
		unifyerror.Fail(c, services.MapAccountError(statusErr))
		return
	}
	unifyerror.Success(c, acc)
}

// Delete godoc
// @Summary Delete a panel account
// @Tags accounts
// @Produce json
// @Param id path int true "Account ID"
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /accounts/{id} [delete]
// Delete removes the account and its SSO identities.
//
// Network bindings are deliberately left behind: deleting a headscale user is a
// separate decision, and an orphaned binding is recoverable while a deleted
// tailnet identity is not.
func (a *AccountController) Delete(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionAccountDelete); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	if authErr := services.Accounts.AuthorizeAccountManage(c.GetUint("userID"), uint(id)); authErr != nil {
		unifyerror.Fail(c, services.MapAccountError(authErr))
		return
	}

	if delErr := services.Accounts.Delete(uint(id)); delErr != nil {
		unifyerror.Fail(c, services.MapAccountError(delErr))
		return
	}
	unifyerror.Success(c, gin.H{"message": "account deleted"})
}

// SetPasswordRequest is the admin password reset payload.
type SetPasswordRequest struct {
	Password string `json:"password" binding:"required"`
}

// SetPassword godoc
// @Summary Reset an account password
// @Tags accounts
// @Accept json
// @Produce json
// @Param id path int true "Account ID"
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /accounts/{id}/password [post]
func (a *AccountController) SetPassword(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionAccountUpdate); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	var req SetPasswordRequest
	if bindErr := c.ShouldBindJSON(&req); bindErr != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	if authErr := services.Accounts.AuthorizeAccountManage(c.GetUint("userID"), uint(id)); authErr != nil {
		unifyerror.Fail(c, services.MapAccountError(authErr))
		return
	}

	if pwErr := services.Accounts.SetPassword(uint(id), req.Password); pwErr != nil {
		unifyerror.Fail(c, services.MapAccountError(pwErr))
		return
	}
	unifyerror.Success(c, gin.H{"message": "password updated; existing sessions were invalidated"})
}

// Identities godoc
// @Summary List an account's SSO identities
// @Tags accounts
// @Produce json
// @Param id path int true "Account ID"
// @Success 200 {object} unifyerror.Response{data=array}
// @Security BearerAuth
// @Router /accounts/{id}/identities [get]
func (a *AccountController) Identities(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionAccountList); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	identities, listErr := services.Accounts.IdentitiesOf(uint(id))
	if listErr != nil {
		unifyerror.Fail(c, dbError(listErr))
		return
	}
	unifyerror.Success(c, identities)
}

// UnlinkIdentity godoc
// @Summary Detach an SSO identity from an account
// @Tags accounts
// @Produce json
// @Param id path int true "Account ID"
// @Param identityID path int true "Identity ID"
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /accounts/{id}/identities/{identityID} [delete]
func (a *AccountController) UnlinkIdentity(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionAccountUpdate); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	identityID, err := parseUintParam(c, "identityID")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	if authErr := services.Accounts.AuthorizeAccountManage(c.GetUint("userID"), uint(id)); authErr != nil {
		unifyerror.Fail(c, services.MapAccountError(authErr))
		return
	}

	if unlinkErr := services.Accounts.UnlinkIdentity(uint(id), uint(identityID)); unlinkErr != nil {
		unifyerror.Fail(c, services.MapAccountError(unlinkErr))
		return
	}
	unifyerror.Success(c, gin.H{"message": "identity unlinked"})
}

// NetworkBindings godoc
// @Summary List an account's network bindings
// @Tags accounts
// @Produce json
// @Param id path int true "Account ID"
// @Success 200 {object} unifyerror.Response{data=array}
// @Security BearerAuth
// @Router /accounts/{id}/network-bindings [get]
func (a *AccountController) NetworkBindings(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionBindingRead); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	bindings, listErr := services.Network.BindingsOf(uint(id))
	if listErr != nil {
		unifyerror.Fail(c, dbError(listErr))
		return
	}
	unifyerror.Success(c, bindings)
}

// TransferBindingRequest is the transfer payload.
type TransferBindingRequest struct {
	HSUserID uint64 `json:"hs_user_id" binding:"required"`
}

// TransferBinding godoc
// @Summary Move a network binding to this account
// @Tags accounts
// @Accept json
// @Produce json
// @Param id path int true "Account ID"
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /accounts/{id}/network-bindings/transfer [post]
func (a *AccountController) TransferBinding(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionBindingManage); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	var req TransferBindingRequest
	if bindErr := c.ShouldBindJSON(&req); bindErr != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	binding, transferErr := services.Network.Transfer(c.Request.Context(), uint(id), req.HSUserID)
	if transferErr != nil {
		unifyerror.Fail(c, services.MapNetworkError(transferErr))
		return
	}
	unifyerror.Success(c, binding)
}

// SetPrimaryBinding godoc
// @Summary Make one binding the account's primary identity
// @Tags accounts
// @Produce json
// @Param id path int true "Account ID"
// @Param hsUserID path int true "Headscale user ID"
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /accounts/{id}/network-bindings/{hsUserID}/primary [post]
// SetPrimaryBinding marks the identity used when a device must be attributed to
// exactly one account. The operation is per-account: setting it clears whichever
// binding was primary before.
func (a *AccountController) SetPrimaryBinding(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionBindingManage); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	id, err := parseUintParam(c, "id")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	hsUserID, err := parseUintParam(c, "hsUserID")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	if setErr := services.Network.SetPrimary(uint(id), hsUserID); setErr != nil {
		unifyerror.Fail(c, services.MapNetworkError(setErr))
		return
	}
	unifyerror.Success(c, gin.H{"message": "primary identity updated"})
}
