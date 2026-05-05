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
