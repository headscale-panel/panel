package controllers

import (
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

type TopologyController struct{}

// GetTopology gets network topology data
// GET /api/topology
func (c *TopologyController) GetTopology(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	topology, err := services.TopologyService.GetTopologyWithContext(ctx.Request.Context(), userID)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, topology)
}

// GetTopologyWithACL gets network topology with ACL information
// GET /api/topology/with-acl
func (c *TopologyController) GetTopologyWithACL(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	topology, err := services.TopologyService.GetTopologyWithACLContext(ctx.Request.Context(), userID)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, topology)
}

// GetACLMatrix gets ACL connectivity matrix
// GET /api/topology/acl-matrix
func (c *TopologyController) GetACLMatrix(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	matrix, err := services.TopologyService.GetACLMatrixWithContext(ctx.Request.Context(), userID)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, matrix)
}
