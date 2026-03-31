package controllers

import (
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

type ConnectionController struct{}

// GenerateConnectionCommands generates connection commands
// POST /api/connection/generate
func (c *ConnectionController) GenerateConnectionCommands(ctx *gin.Context) {
	var req struct {
		MachineIDs []string `json:"machine_ids" binding:"required"`
		Platform   string   `json:"platform" binding:"required"`
	}

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

// GeneratePreAuthKey generates a pre-auth key
// POST /api/connection/pre-auth-key
func (c *ConnectionController) GeneratePreAuthKey(ctx *gin.Context) {
	var req struct {
		UserID     uint   `json:"user_id" binding:"required"`
		Reusable   bool   `json:"reusable"`
		Ephemeral  bool   `json:"ephemeral"`
		Expiration string `json:"expiration"`
	}

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

// GenerateSSHCommand generates a single SSH command for a machine.
func (c *ConnectionController) GenerateSSHCommand(ctx *gin.Context) {
	var req struct {
		MachineID uint64 `json:"machine_id" binding:"required"`
		User      string `json:"user"`
	}

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
