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

// ConnectionController renders the "add a device" onboarding flow.
type ConnectionController struct{}

// NewConnectionController builds the controller.
func NewConnectionController() *ConnectionController {
	return &ConnectionController{}
}

// ListIdentities godoc
// @Summary List the identities a device can be attached to
// @Tags connection
// @Produce json
// @Success 200 {object} unifyerror.Response{data=array}
// @Security BearerAuth
// @Router /connection/identities [get]
func (c *ConnectionController) ListIdentities(ctx *gin.Context) {
	identities, err := services.ConnectionService.ListIdentities(ctx.Request.Context(), ctx.GetUint("userID"))
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, identities)
}

// GenerateCommandsRequest is the onboarding payload.
type GenerateCommandsRequest struct {
	HSUserID uint64 `json:"hs_user_id" binding:"required"`
	Platform string `json:"platform"`
}

// GenerateCommands godoc
// @Summary Produce the commands that attach a device
// @Tags connection
// @Accept json
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /connection/commands [post]
// GenerateCommands mints a pre-auth key and renders it into a command block.
//
// The key appears in the response only, never in the database: it is shown once
// and cannot be retrieved again, which is why the response carries expires_at and
// show_once.
func (c *ConnectionController) GenerateCommands(ctx *gin.Context) {
	var req GenerateCommandsRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	command, err := services.ConnectionService.GenerateCommands(ctx.Request.Context(),
		ctx.GetUint("userID"), req.HSUserID, req.Platform)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, command)
}

// GenerateSSHCommandRequest is the SSH payload.
type GenerateSSHCommandRequest struct {
	NodeID  uint64 `json:"node_id" binding:"required"`
	SSHUser string `json:"ssh_user"`
}

// GenerateSSHCommand godoc
// @Summary Produce an ssh command targeting a device
// @Tags connection
// @Accept json
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /connection/ssh-command [post]
func (c *ConnectionController) GenerateSSHCommand(ctx *gin.Context) {
	var req GenerateSSHCommandRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	command, err := services.ConnectionService.GenerateSSHCommand(ctx.Request.Context(),
		ctx.GetUint("userID"), req.NodeID, req.SSHUser)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, gin.H{"command": command})
}
