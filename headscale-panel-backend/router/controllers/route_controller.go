package controllers

import (
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"
	"strconv"

	"github.com/gin-gonic/gin"
)

type RouteController struct{}

// ListRoutes lists all routes from Headscale via gRPC
// GET /api/routes?page=1&page_size=10&user_id=xxx&machine_id=xxx
func (c *RouteController) ListRoutes(ctx *gin.Context) {
	page, _ := strconv.Atoi(ctx.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(ctx.DefaultQuery("page_size", "20"))
	userFilter := ctx.Query("user_id")
	machineID := ctx.Query("machine_id")

	userID := ctx.GetUint("userID")
	routes, total, err := services.RouteService.ListRoutesWithContext(ctx.Request.Context(), userID, page, pageSize, userFilter, machineID)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{
		"list":      routes,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// EnableRoute enables (approves) a route on a node
// POST /api/routes/enable
func (c *RouteController) EnableRoute(ctx *gin.Context) {
	var req struct {
		MachineID   uint64 `json:"machine_id" binding:"required"`
		Destination string `json:"destination" binding:"required"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.RouteService.EnableRouteWithContext(ctx.Request.Context(), userID, req.MachineID, req.Destination); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, nil)
}

// DisableRoute disables (unapproves) a route on a node
// POST /api/routes/disable
func (c *RouteController) DisableRoute(ctx *gin.Context) {
	var req struct {
		MachineID   uint64 `json:"machine_id" binding:"required"`
		Destination string `json:"destination" binding:"required"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.RouteService.DisableRouteWithContext(ctx.Request.Context(), userID, req.MachineID, req.Destination); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, nil)
}
