package controllers

import (
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

type StatusController struct{}

func NewStatusController() *StatusController {
	return &StatusController{}
}

// GetSystemStatus returns a consolidated view of the current panel and
// Headscale runtime state.
//
// @Summary      Get system status
// @Tags         system
// @Produce      json
// @Success      200  {object}  unifyerror.Response{data=services.SystemStatus}
// @Security     BearerAuth
// @Router       /status [get]
func (c *StatusController) GetSystemStatus(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	status, err := services.StatusService.GetSystemStatus(userID)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, status)
}
