package controllers

import (
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

type HeadscaleStatusController struct{}

func NewHeadscaleStatusController() *HeadscaleStatusController {
	return &HeadscaleStatusController{}
}

// GetStatus returns the liveness status of the Headscale gRPC service.
// It performs a lightweight probe and reports whether the server is reachable.
// This endpoint is non-blocking; it will time out after 5 seconds internally.
//
// @Summary      Get Headscale server status
// @Tags         headscale
// @Produce      json
// @Success      200  {object}  unifyerror.Response{data=services.HeadscaleServerStatus}
// @Security     BearerAuth
// @Router       /headscale/status [get]
func (c *HeadscaleStatusController) GetStatus(ctx *gin.Context) {
	status := services.HeadscaleStatusService.GetHeadscaleServerStatus()
	unifyerror.Success(ctx, status)
}
