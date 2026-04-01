package controllers

import (
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

type ConnectionController struct{}

// GenerateConnectionCommandsRequest is the request body for GenerateConnectionCommands.
type GenerateConnectionCommandsRequest struct {
	MachineIDs []string `json:"machine_ids" binding:"required"`
	Platform   string   `json:"platform" binding:"required"`
}

// GenerateConnectionPreAuthKeyRequest is the request body for GeneratePreAuthKey.
type GenerateConnectionPreAuthKeyRequest struct {
	UserID     uint   `json:"user_id" binding:"required"`
	Reusable   bool   `json:"reusable"`
	Ephemeral  bool   `json:"ephemeral"`
	Expiration string `json:"expiration"`
}

// GenerateSSHCommandRequest is the request body for GenerateSSHCommand.
type GenerateSSHCommandRequest struct {
	MachineID uint64 `json:"machine_id" binding:"required"`
	User      string `json:"user"`
}

// GenerateConnectionCommands godoc
// @Summary Generate connection commands
// @Tags connection
// @Accept json
// @Produce json
// @Param body body GenerateConnectionCommandsRequest true "Connection command parameters"
// @Success 200 {object} serializer.Response{data=object} "commands object"
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /connection/generate [post]
func (c *ConnectionController) GenerateConnectionCommands(ctx *gin.Context) {
	var req GenerateConnectionCommandsRequest

	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	commands, err := services.ConnectionService.GenerateConnectionCommandsWithContext(ctx.Request.Context(), userID, req.MachineIDs, req.Platform)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, commands)
}

// GeneratePreAuthKey godoc
// @Summary Generate a pre-auth key
// @Tags connection
// @Accept json
// @Produce json
// @Param body body GenerateConnectionPreAuthKeyRequest true "Pre-auth key parameters"
// @Success 200 {object} serializer.Response{data=object} "key string"
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /connection/pre-auth-key [post]
func (c *ConnectionController) GeneratePreAuthKey(ctx *gin.Context) {
	var req GenerateConnectionPreAuthKeyRequest

	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	key, err := services.ConnectionService.GeneratePreAuthKeyWithContext(ctx.Request.Context(), userID, req.UserID, req.Reusable, req.Ephemeral, req.Expiration)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{
		"key": key,
	})
}

// GenerateSSHCommand godoc
// @Summary Generate an SSH command for a machine
// @Tags connection
// @Accept json
// @Produce json
// @Param body body GenerateSSHCommandRequest true "SSH command parameters"
// @Success 200 {object} serializer.Response{data=object} "command string"
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /connection/ssh-command [post]
func (c *ConnectionController) GenerateSSHCommand(ctx *gin.Context) {
	var req GenerateSSHCommandRequest

	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	command, err := services.ConnectionService.GenerateSSHCommandWithContext(ctx.Request.Context(), userID, req.MachineID, req.User)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{
		"command": command,
	})
}
