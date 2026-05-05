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
