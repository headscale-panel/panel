package controllers

import (
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"
	"strconv"

	"github.com/gin-gonic/gin"
)

type DERPController struct{}

func NewDERPController() *DERPController {
	return &DERPController{}
}

// Get godoc
// @Summary Get the current DERP map
// @Tags derp
// @Produce json
// @Success 200 {object} serializer.Response{data=object}
// @Security BearerAuth
// @Router /headscale/derp [get]
// Get returns the current DERP map
func (c *DERPController) Get(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	derpMap, err := services.DERPService.GetDERPMap(userID)
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

	userID := ctx.GetUint("userID")
	if err := services.DERPService.SaveDERPMap(userID, &derpMap); err != nil {
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

	userID := ctx.GetUint("userID")
	if err := services.DERPService.AddRegion(userID, &region); err != nil {
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

	userID := ctx.GetUint("userID")
	if err := services.DERPService.UpdateRegion(userID, regionID, &region); err != nil {
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

	userID := ctx.GetUint("userID")
	if err := services.DERPService.DeleteRegion(userID, regionID); err != nil {
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

	userID := ctx.GetUint("userID")
	if err := services.DERPService.AddNode(userID, regionID, node); err != nil {
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

	userID := ctx.GetUint("userID")
	if err := services.DERPService.UpdateNode(userID, regionID, nodeIndex, node); err != nil {
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

	userID := ctx.GetUint("userID")
	if err := services.DERPService.DeleteNode(userID, regionID, nodeIndex); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, nil)
}
