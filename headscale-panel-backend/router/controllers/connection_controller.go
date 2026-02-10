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

	commands, err := services.ConnectionService.GenerateConnectionCommands(req.MachineIDs, req.Platform)
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
		UserID    uint `json:"user_id" binding:"required"`
		Reusable  bool `json:"reusable"`
		Ephemeral bool `json:"ephemeral"`
	}

	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	key, err := services.ConnectionService.GeneratePreAuthKey(req.UserID, req.Reusable, req.Ephemeral)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{
		"key": key,
	})
}
