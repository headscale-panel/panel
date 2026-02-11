package controllers

import (
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

type DashboardController struct{}

func NewDashboardController() *DashboardController {
	return &DashboardController{}
}

func (d *DashboardController) Overview(c *gin.Context) {
	data, err := services.DashboardService.GetOverviewWithContext(c.Request.Context())
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, data)
}

func (d *DashboardController) Topology(c *gin.Context) {
	data, err := services.DashboardService.GetTopologyWithContext(c.Request.Context())
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, data)
}
