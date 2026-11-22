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
	"net/http"

	"github.com/gin-gonic/gin"
)

type RouteController struct{}

// NewRouteController builds the controller.
func NewRouteController() *RouteController {
	return &RouteController{}
}

// RouteActionRequest is the request body for EnableRoute/DisableRoute.
type RouteActionRequest struct {
	MachineID   uint64 `json:"machine_id"`
	Destination string `json:"destination" binding:"required"`
}

// ListRoutesQuery is the query parameter struct for ListRoutes.
type ListRoutesQuery struct {
	unifyerror.PaginationQuery
	UserID    string `form:"user_id"`
	MachineID string `form:"machine_id"`
}

// ListRoutes godoc
// @Summary List all routes
// @Tags routes
// @Produce json
// @Param page query int false "Page number" default(1)
// @Param page_size query int false "Page size" default(10)
// @Param all query bool false "Return all records"
// @Param user_id query string false "Filter by user ID"
// @Param machine_id query string false "Filter by machine ID"
// @Success 200 {object} unifyerror.Response{data=array}
// @Security BearerAuth
// @Router /routes [get]
// ListRoutes returns every route as a bare array.
//
// Paging is not offered here: headscale has no paging on its node list, so the
// panel fetches once and filters in the browser. A paginated envelope would
// suggest a server-side page that does not exist.
func (c *RouteController) ListRoutes(ctx *gin.Context) {
	var q ListRoutesQuery
	if err := ctx.ShouldBindQuery(&q); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	routes, _, err := services.RouteService.ListRoutesWithContext(
		ctx.Request.Context(), userID, 1, -1, q.UserID, q.MachineID)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, routes)
}

// EnableRoute godoc
// @Summary Enable (approve) a route on a node
// @Tags routes
// @Accept json
// @Produce json
// @Param body body RouteActionRequest true "Route action"
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /routes/enable [post]
func (c *RouteController) EnableRoute(ctx *gin.Context) {
	nodeID, err := parseUintParam(ctx, "nodeID")
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	var req RouteActionRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}
	if req.MachineID != 0 && req.MachineID != nodeID {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "node ID mismatch"))
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.RouteService.EnableRouteWithContext(ctx.Request.Context(), userID, nodeID, req.Destination); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, nil)
}

// DisableRoute godoc
// @Summary Disable (unapprove) a route on a node
// @Tags routes
// @Accept json
// @Produce json
// @Param body body RouteActionRequest true "Route action"
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /routes/{nodeID}/disable [post]
func (c *RouteController) DisableRoute(ctx *gin.Context) {
	nodeID, err := parseUintParam(ctx, "nodeID")
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	var req RouteActionRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}
	if req.MachineID != 0 && req.MachineID != nodeID {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "node ID mismatch"))
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.RouteService.DisableRouteWithContext(ctx.Request.Context(), userID, nodeID, req.Destination); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, nil)
}
