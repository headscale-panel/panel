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
	"net/http"
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/services"
	"strconv"

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
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /resources [post]
func (r *ResourceController) Create(c *gin.Context) {
	var req services.CreateResourceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	userID := c.GetUint("userID")
	if err := services.ResourceService.Create(userID, &req); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	unifyerror.Success(c, nil)
}

// Get godoc
// @Summary Get a single resource
// @Tags resources
// @Produce json
// @Param id query int true "Resource ID"
// @Success 200 {object} unifyerror.Response{data=model.Resource}
// @Security BearerAuth
// @Router /resources/detail [get]
func (r *ResourceController) Get(c *gin.Context) {
	idStr := c.Query("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || id == 0 {
		unifyerror.Fail(c, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "invalid resource ID"))
		return
	}

	userID := c.GetUint("userID")
	resource, err := services.ResourceService.Get(userID, uint(id))
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	unifyerror.Success(c, resource)
}

// List godoc
// @Summary List resources
// @Tags resources
// @Produce json
// @Param page query int false "Page number" default(1)
// @Param page_size query int false "Page size" default(10)
// @Param all query bool false "Return all records"
// @Param keyword query string false "Search keyword"
// @Success 200 {object} unifyerror.Response{data=unifyerror.PaginatedData{list=[]model.Resource}}
// @Security BearerAuth
// @Router /resources [get]
func (r *ResourceController) List(c *gin.Context) {
	var req services.ListResourceRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}
	req.Page, req.PageSize = req.Resolve()

	userID := c.GetUint("userID")
	list, total, err := services.ResourceService.List(userID, &req)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	unifyerror.SuccessPage(c, list, total, req.Page, req.PageSize)
}

// Update godoc
// @Summary Update a resource
// @Tags resources
// @Accept json
// @Produce json
// @Param body body services.UpdateResourceRequest true "Resource update data"
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /resources [put]
func (r *ResourceController) Update(c *gin.Context) {
	var req services.UpdateResourceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	userID := c.GetUint("userID")
	if err := services.ResourceService.Update(userID, &req); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	unifyerror.Success(c, nil)
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
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /resources [delete]
func (r *ResourceController) Delete(c *gin.Context) {
	var q DeleteResourceQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		unifyerror.Fail(c, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "invalid ID"))
		return
	}

	userID := c.GetUint("userID")
	if err := services.ResourceService.Delete(userID, q.ID); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	unifyerror.Success(c, nil)
}
