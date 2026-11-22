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
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// NetworkIdentityController handles the headscale users the panel calls
// "network identities".
//
// Nothing here is a panel account: this is the tailnet's view of a person, which
// may or may not be linked to one.
type NetworkIdentityController struct{}

// NewNetworkIdentityController builds the controller.
func NewNetworkIdentityController() *NetworkIdentityController {
	return &NetworkIdentityController{}
}

// ListIdentitiesQuery is the list filter.
type ListIdentitiesQuery struct {
	Query    string `form:"q"`
	Origin   string `form:"origin"`
	Orphaned bool   `form:"orphaned"`
	Bound    *bool  `form:"bound"`
}

// List godoc
// @Summary List network identities
// @Tags network-identities
// @Produce json
// @Success 200 {object} unifyerror.Response{data=array}
// @Security BearerAuth
// @Router /network-identities [get]
func (n *NetworkIdentityController) List(c *gin.Context) {
	var q ListIdentitiesQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	identities, err := services.NetworkIdentityService.ListIdentities(c.Request.Context(), c.GetUint("userID"),
		services.IdentityFilter{Query: q.Query, Origin: q.Origin, Orphaned: q.Orphaned, Bound: q.Bound})
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, identities)
}

// Get godoc
// @Summary Read one network identity
// @Tags network-identities
// @Produce json
// @Param hsUserID path int true "Headscale user ID"
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /network-identities/{hsUserID} [get]
func (n *NetworkIdentityController) Get(c *gin.Context) {
	id, err := parseUintParam(c, "hsUserID")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	identity, getErr := services.NetworkIdentityService.GetIdentity(c.Request.Context(), c.GetUint("userID"), id)
	if getErr != nil {
		unifyerror.Fail(c, getErr)
		return
	}
	unifyerror.Success(c, identity)
}

// CreateIdentityRequest is the creation payload.
type CreateIdentityRequest struct {
	Name        string `json:"name" binding:"required"`
	DisplayName string `json:"display_name"`
	Email       string `json:"email"`
}

// Create godoc
// @Summary Create a network identity
// @Tags network-identities
// @Accept json
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /network-identities [post]
func (n *NetworkIdentityController) Create(c *gin.Context) {
	var req CreateIdentityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	identity, err := services.NetworkIdentityService.CreateIdentity(c.Request.Context(), c.GetUint("userID"),
		req.Name, req.DisplayName, req.Email)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, identity)
}

// RenameRequest is the rename payload.
type RenameRequest struct {
	Name string `json:"name" binding:"required"`
}

// Rename godoc
// @Summary Rename a network identity
// @Tags network-identities
// @Accept json
// @Produce json
// @Param hsUserID path int true "Headscale user ID"
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /network-identities/{hsUserID}/rename [post]
func (n *NetworkIdentityController) Rename(c *gin.Context) {
	id, err := parseUintParam(c, "hsUserID")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	var req RenameRequest
	if bindErr := c.ShouldBindJSON(&req); bindErr != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	identity, renameErr := services.NetworkIdentityService.RenameIdentity(c.Request.Context(), c.GetUint("userID"), id, req.Name)
	if renameErr != nil {
		unifyerror.Fail(c, renameErr)
		return
	}
	unifyerror.Success(c, identity)
}

// Delete godoc
// @Summary Delete a network identity
// @Tags network-identities
// @Produce json
// @Param hsUserID path int true "Headscale user ID"
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /network-identities/{hsUserID} [delete]
func (n *NetworkIdentityController) Delete(c *gin.Context) {
	id, err := parseUintParam(c, "hsUserID")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	if delErr := services.NetworkIdentityService.DeleteIdentity(c.Request.Context(), c.GetUint("userID"), id); delErr != nil {
		unifyerror.Fail(c, delErr)
		return
	}
	unifyerror.Success(c, gin.H{"message": "network identity deleted"})
}

// BindRequest is the bind payload.
type BindRequest struct {
	AccountID uint `json:"account_id" binding:"required"`
	Primary   bool `json:"primary"`
}

// Bind godoc
// @Summary Link a network identity to an account
// @Tags network-identities
// @Accept json
// @Produce json
// @Param hsUserID path int true "Headscale user ID"
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /network-identities/{hsUserID}/bind [post]
func (n *NetworkIdentityController) Bind(c *gin.Context) {
	id, err := parseUintParam(c, "hsUserID")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	var req BindRequest
	if bindErr := c.ShouldBindJSON(&req); bindErr != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	if bindErr := services.NetworkIdentityService.Bind(c.Request.Context(), c.GetUint("userID"), id, req.AccountID, req.Primary); bindErr != nil {
		unifyerror.Fail(c, bindErr)
		return
	}
	unifyerror.Success(c, gin.H{"message": "identity linked"})
}

// Unbind godoc
// @Summary Unlink a network identity from its account
// @Tags network-identities
// @Produce json
// @Param hsUserID path int true "Headscale user ID"
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /network-identities/{hsUserID}/bind [delete]
func (n *NetworkIdentityController) Unbind(c *gin.Context) {
	id, err := parseUintParam(c, "hsUserID")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	if unbindErr := services.NetworkIdentityService.Unbind(c.GetUint("userID"), id); unbindErr != nil {
		unifyerror.Fail(c, unbindErr)
		return
	}
	unifyerror.Success(c, gin.H{"message": "identity unlinked"})
}

// Reconcile godoc
// @Summary Create missing bindings for panel-issued identities
// @Tags network-identities
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /network-identities/reconcile [post]
func (n *NetworkIdentityController) Reconcile(c *gin.Context) {
	result, err := services.NetworkIdentityService.ReconcileBindings(c.Request.Context(), c.GetUint("userID"))
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, result)
}

// parseUintParam reads a numeric path parameter.
func parseUintParam(c *gin.Context, name string) (uint64, error) {
	raw := c.Param(name)
	value, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || value == 0 {
		return 0, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "invalid "+name)
	}
	return value, nil
}
