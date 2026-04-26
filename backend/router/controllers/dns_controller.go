package controllers

import (
	"net/http"
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
// List 获取 DNS 记录列表
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
// Create 创建 DNS 记录
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
// Update 更新 DNS 记录
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
// Delete 删除 DNS 记录
func (c *DNSController) Delete(ctx *gin.Context) {
	idStr := ctx.Query("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "无效的 ID"))
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
// Get 获取单个 DNS 记录
func (c *DNSController) Get(ctx *gin.Context) {
	idStr := ctx.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "无效的 ID"))
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
// Sync 将 DNS 记录同步到文件
func (c *DNSController) Sync(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	if err := services.DNSService.SyncToFile(userID); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, gin.H{"message": "同步成功"})
}

// Import godoc
// @Summary Import DNS records from extra-records file
// @Tags dns
// @Produce json
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /dns/import [post]
// Import 从文件导入 DNS 记录
func (c *DNSController) Import(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	imported, err := services.DNSService.ImportFromFile(userID)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, gin.H{
		"message":  "导入成功",
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
// GetFile 获取文件中的 DNS 记录
func (c *DNSController) GetFile(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	records, err := services.DNSService.GetExtraRecordsFromFile(userID)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, records)
}
