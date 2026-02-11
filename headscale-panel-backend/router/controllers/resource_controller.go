package controllers

import (
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"
	"strconv"

	"github.com/gin-gonic/gin"
)

type ResourceController struct{}

func NewResourceController() *ResourceController {
	return &ResourceController{}
}

func (r *ResourceController) Create(c *gin.Context) {
	var req services.CreateResourceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	userID := c.GetUint("userID")
	if err := services.ResourceService.Create(userID, &req); err != nil {
		serializer.Fail(c, err)
		return
	}

	serializer.Success(c, nil)
}

func (r *ResourceController) List(c *gin.Context) {
	var req services.ListResourceRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	userID := c.GetUint("userID")
	list, total, err := services.ResourceService.List(userID, &req)
	if err != nil {
		serializer.Fail(c, err)
		return
	}

	serializer.Success(c, gin.H{
		"list":  list,
		"total": total,
	})
}

func (r *ResourceController) Update(c *gin.Context) {
	var req services.UpdateResourceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	userID := c.GetUint("userID")
	if err := services.ResourceService.Update(userID, &req); err != nil {
		serializer.Fail(c, err)
		return
	}

	serializer.Success(c, nil)
}

func (r *ResourceController) Delete(c *gin.Context) {
	idStr := c.Query("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		serializer.FailWithCode(c, serializer.CodeParamErr, "无效的 ID")
		return
	}

	userID := c.GetUint("userID")
	if err := services.ResourceService.Delete(userID, uint(id)); err != nil {
		serializer.Fail(c, err)
		return
	}

	serializer.Success(c, nil)
}
