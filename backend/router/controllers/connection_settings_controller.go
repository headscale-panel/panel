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

// ConnectionSettingsController manages how the panel reaches headscale.
type ConnectionSettingsController struct{}

// NewConnectionSettingsController builds the controller.
func NewConnectionSettingsController() *ConnectionSettingsController {
	return &ConnectionSettingsController{}
}

// Get godoc
// @Summary Read the headscale connection settings
// @Tags system
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /system/config/connection [get]
func (c *ConnectionSettingsController) Get(ctx *gin.Context) {
	settings, err := services.ConnectionSettingsService.Get(ctx.GetUint("userID"))
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, settings)
}

// SaveConnectionRequest is the connection update payload.
//
// An empty api_key preserves the stored one, so the form does not have to keep
// the secret in the browser between edits.
type SaveConnectionRequest struct {
	APIAddr       string `json:"api_addr" binding:"required"`
	APIKey        string `json:"api_key"`
	Insecure      bool   `json:"insecure"`
	TLSSkipVerify bool   `json:"tls_skip_verify"`
	TLSCACert     string `json:"tls_ca_cert"`
}

// Save godoc
// @Summary Save the headscale connection settings
// @Tags system
// @Accept json
// @Produce json
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /system/config/connection [put]
func (c *ConnectionSettingsController) Save(ctx *gin.Context) {
	var req SaveConnectionRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	if err := services.ConnectionSettingsService.Save(ctx.Request.Context(), ctx.GetUint("userID"),
		services.SaveInput{
			APIAddr:       req.APIAddr,
			APIKey:        req.APIKey,
			Insecure:      req.Insecure,
			TLSSkipVerify: req.TLSSkipVerify,
			TLSCACert:     req.TLSCACert,
		}); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, gin.H{"message": "connection settings saved"})
}

// Test godoc
// @Summary Probe a connection configuration without saving it
// @Tags system
// @Accept json
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /system/config/connection/test [post]
func (c *ConnectionSettingsController) Test(ctx *gin.Context) {
	var req SaveConnectionRequest
	if err := ctx.ShouldBindBodyWithJSON(&req); err != nil && err.Error() != "EOF" {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	state, err := services.ConnectionSettingsService.Test(ctx.Request.Context(), ctx.GetUint("userID"),
		services.SaveInput{
			APIAddr:       req.APIAddr,
			APIKey:        req.APIKey,
			Insecure:      req.Insecure,
			TLSSkipVerify: req.TLSSkipVerify,
			TLSCACert:     req.TLSCACert,
		})
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, state)
}

// Reconcile godoc
// @Summary Re-sync ACL hosts and reconcile identity bindings
// @Tags system
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /system/reconcile [post]
func (c *ConnectionSettingsController) Reconcile(ctx *gin.Context) {
	result, err := services.ConnectionSettingsService.SyncFromHeadscale(ctx.Request.Context(), ctx.GetUint("userID"))
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, result)
}
