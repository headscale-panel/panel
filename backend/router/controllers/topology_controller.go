package controllers

import (
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

type TopologyController struct{}

// GetTopology godoc
// @Summary Get network topology
// @Tags topology
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /topology [get]
// GetTopology gets network topology data
// GET /api/topology
func (c *TopologyController) GetTopology(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	topology, err := services.TopologyService.GetTopologyWithContext(ctx.Request.Context(), userID)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, topology)
}

// GetTopologyWithACL godoc
// @Summary Get network topology with ACL information
// @Tags topology
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /topology/with-acl [get]
// GetTopologyWithACL gets network topology with ACL information
// GET /api/topology/with-acl
func (c *TopologyController) GetTopologyWithACL(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	topology, err := services.TopologyService.GetTopologyWithACLContext(ctx.Request.Context(), userID)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, topology)
}

// GetACLMatrix godoc
// @Summary Get ACL connectivity matrix
// @Tags topology
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /topology/acl-matrix [get]
// GetACLMatrix gets ACL connectivity matrix
// GET /api/topology/acl-matrix
func (c *TopologyController) GetACLMatrix(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	matrix, err := services.TopologyService.GetACLMatrixWithContext(ctx.Request.Context(), userID)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, matrix)
}
