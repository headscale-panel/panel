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
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/services"
	"strconv"

	"github.com/gin-gonic/gin"
)

type DNSController struct{}

func NewDNSController() *DNSController {
	return &DNSController{}
}

// List godoc
// @Summary List DNS records
// @Tags dns
// @Produce json
// @Param page query int false "Page number" default(1)
// @Param page_size query int false "Page size" default(10)
// @Param all query bool false "Return all records"
// @Param keyword query string false "Search keyword"
// @Param type query string false "Record type (A|AAAA)"
// @Success 200 {object} unifyerror.Response{data=unifyerror.PaginatedData{list=[]model.DNSRecord}}
// @Security BearerAuth
// @Router /dns/records [get]
func (c *DNSController) List(ctx *gin.Context) {
	var req services.ListDNSRecordRequest
	if err := ctx.ShouldBindQuery(&req); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}
	req.Page, req.PageSize = req.Resolve()

	userID := ctx.GetUint("userID")
	records, total, err := services.DNSService.List(userID, &req)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.SuccessPage(ctx, records, total, req.Page, req.PageSize)
}

// Create godoc
// @Summary Create a DNS record
// @Tags dns
// @Accept json
// @Produce json
// @Param body body services.CreateDNSRecordRequest true "DNS record data"
// @Success 200 {object} unifyerror.Response{data=model.DNSRecord}
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /dns/records [post]
func (c *DNSController) Create(ctx *gin.Context) {
	var req services.CreateDNSRecordRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	record, err := services.DNSService.Create(userID, &req)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, record)
}

// Update godoc
// @Summary Update a DNS record
// @Tags dns
// @Accept json
// @Produce json
// @Param body body services.UpdateDNSRecordRequest true "DNS record update data"
// @Success 200 {object} unifyerror.Response{data=model.DNSRecord}
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /dns/records [put]
func (c *DNSController) Update(ctx *gin.Context) {
	var req services.UpdateDNSRecordRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	record, err := services.DNSService.Update(userID, &req)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, record)
}

// Delete godoc
// @Summary Delete a DNS record
// @Tags dns
// @Produce json
// @Param id query int true "Record ID"
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /dns/records [delete]
func (c *DNSController) Delete(ctx *gin.Context) {
	idStr := ctx.Query("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, constants.MsgInvalidID))
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.DNSService.Delete(userID, uint(id)); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, nil)
}

// Get godoc
// @Summary Get a single DNS record
// @Tags dns
// @Produce json
// @Param id path int true "Record ID"
// @Success 200 {object} unifyerror.Response{data=model.DNSRecord}
// @Failure 404 {object} unifyerror.Response
// @Security BearerAuth
// @Router /dns/records/{id} [get]
func (c *DNSController) Get(ctx *gin.Context) {
	idStr := ctx.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, constants.MsgInvalidID))
		return
	}

	userID := ctx.GetUint("userID")
	record, err := services.DNSService.Get(userID, uint(id))
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, record)
}

// Sync godoc
// @Summary Sync DNS records to extra-records file
// @Tags dns
// @Produce json
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /dns/sync [post]
func (c *DNSController) Sync(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	if err := services.DNSService.SyncToFile(userID); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, gin.H{"message": constants.MsgSyncSuccessful})
}

// Import godoc
// @Summary Import DNS records from extra-records file
// @Tags dns
// @Produce json
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /dns/import [post]
func (c *DNSController) Import(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	imported, err := services.DNSService.ImportFromFile(userID)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, gin.H{
		"message":  constants.MsgImportSuccessful,
		"imported": imported,
	})
}

// GetFile godoc
// @Summary Get DNS records from the extra-records file
// @Tags dns
// @Produce json
// @Success 200 {object} unifyerror.Response{data=[]services.ExtraRecord}
// @Security BearerAuth
// @Router /dns/file [get]
func (c *DNSController) GetFile(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	records, err := services.DNSService.GetExtraRecordsFromFile(userID)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, records)
}
