package controllers

import (
	"strconv"
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

type DERPController struct{}

func NewDERPController() *DERPController {
	return &DERPController{}
}

// Get returns the current DERP map
func (c *DERPController) Get(ctx *gin.Context) {
	derpMap, err := services.DERPService.GetDERPMap()
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, derpMap)
}

// Update saves the DERP map
func (c *DERPController) Update(ctx *gin.Context) {
	var derpMap services.DERPMapFile
	if err := ctx.ShouldBindJSON(&derpMap); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	if err := services.DERPService.SaveDERPMap(&derpMap); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, nil)
}

// AddRegion adds a new DERP region
func (c *DERPController) AddRegion(ctx *gin.Context) {
	var region services.DERPRegion
	if err := ctx.ShouldBindJSON(&region); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	if err := services.DERPService.AddRegion(&region); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, nil)
}

// UpdateRegion updates an existing DERP region
func (c *DERPController) UpdateRegion(ctx *gin.Context) {
	regionID, err := strconv.Atoi(ctx.Param("regionId"))
	if err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	var region services.DERPRegion
	if err := ctx.ShouldBindJSON(&region); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	if err := services.DERPService.UpdateRegion(regionID, &region); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, nil)
}

// DeleteRegion deletes a DERP region
func (c *DERPController) DeleteRegion(ctx *gin.Context) {
	regionID, err := strconv.Atoi(ctx.Param("regionId"))
	if err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	if err := services.DERPService.DeleteRegion(regionID); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, nil)
}

// AddNode adds a node to a DERP region
func (c *DERPController) AddNode(ctx *gin.Context) {
	regionID, err := strconv.Atoi(ctx.Param("regionId"))
	if err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	var node services.DERPNode
	if err := ctx.ShouldBindJSON(&node); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	if err := services.DERPService.AddNode(regionID, node); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, nil)
}

// UpdateNode updates a node in a DERP region
func (c *DERPController) UpdateNode(ctx *gin.Context) {
	regionID, err := strconv.Atoi(ctx.Param("regionId"))
	if err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	nodeIndex, err := strconv.Atoi(ctx.Param("nodeIndex"))
	if err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	var node services.DERPNode
	if err := ctx.ShouldBindJSON(&node); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	if err := services.DERPService.UpdateNode(regionID, nodeIndex, node); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, nil)
}

// DeleteNode deletes a node from a DERP region
func (c *DERPController) DeleteNode(ctx *gin.Context) {
	regionID, err := strconv.Atoi(ctx.Param("regionId"))
	if err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	nodeIndex, err := strconv.Atoi(ctx.Param("nodeIndex"))
	if err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	if err := services.DERPService.DeleteNode(regionID, nodeIndex); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, nil)
}
