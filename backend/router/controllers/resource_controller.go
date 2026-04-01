package controllers

import (
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

type ResourceController struct{}

func NewResourceController() *ResourceController {
	return &ResourceController{}
}

// Create godoc
// @Summary Create a resource
// @Tags resources
// @Accept json
// @Produce json
// @Param body body services.CreateResourceRequest true "Resource data"
// @Success 200 {object} serializer.Response
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /resources [post]
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

// List godoc
// @Summary List resources
// @Tags resources
// @Produce json
// @Param page query int false "Page number" default(1)
// @Param page_size query int false "Page size" default(10)
// @Param all query bool false "Return all records"
// @Param keyword query string false "Search keyword"
// @Success 200 {object} serializer.Response{data=serializer.PaginatedData{list=[]model.Resource}}
// @Security BearerAuth
// @Router /resources [get]
func (r *ResourceController) List(c *gin.Context) {
	var req services.ListResourceRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}
	req.Page, req.PageSize = req.Resolve()

	userID := c.GetUint("userID")
	list, total, err := services.ResourceService.List(userID, &req)
	if err != nil {
		serializer.Fail(c, err)
		return
	}

	serializer.SuccessPage(c, list, total, req.Page, req.PageSize)
}

// Update godoc
// @Summary Update a resource
// @Tags resources
// @Accept json
// @Produce json
// @Param body body services.UpdateResourceRequest true "Resource update data"
// @Success 200 {object} serializer.Response
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /resources [put]
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

// DeleteResourceQuery is the query parameter struct for Delete.
type DeleteResourceQuery struct {
	ID uint `form:"id" binding:"required"`
}

// Delete godoc
// @Summary Delete a resource
// @Tags resources
// @Produce json
// @Param id query int true "Resource ID"
// @Success 200 {object} serializer.Response
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /resources [delete]
func (r *ResourceController) Delete(c *gin.Context) {
	var q DeleteResourceQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		serializer.FailWithCode(c, serializer.CodeParamErr, "无效的 ID")
		return
	}

	userID := c.GetUint("userID")
	if err := services.ResourceService.Delete(userID, q.ID); err != nil {
		serializer.Fail(c, err)
		return
	}

	serializer.Success(c, nil)
}
