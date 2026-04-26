package controllers

import (
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

type DashboardController struct{}

func NewDashboardController() *DashboardController {
	return &DashboardController{}
}

// Overview godoc
// @Summary Get dashboard overview data
// @Tags dashboard
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /dashboard/overview [get]
func (d *DashboardController) Overview(c *gin.Context) {
	userID := c.GetUint("userID")
	data, err := services.DashboardService.GetOverviewWithContext(c.Request.Context(), userID)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, data)
}

// Topology godoc
// @Summary Get network topology (dashboard view)
// @Tags dashboard
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /dashboard/topology [get]
func (d *DashboardController) Topology(c *gin.Context) {
	userID := c.GetUint("userID")
	data, err := services.DashboardService.GetTopologyWithContext(c.Request.Context(), userID)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, data)
}
