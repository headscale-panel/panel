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
