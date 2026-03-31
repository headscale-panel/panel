package controllers

import (
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"
	"strconv"

	"github.com/gin-gonic/gin"
)

type DNSController struct{}

func NewDNSController() *DNSController {
	return &DNSController{}
}

// List 获取 DNS 记录列表
func (c *DNSController) List(ctx *gin.Context) {
	var req services.ListDNSRecordRequest
	if err := ctx.ShouldBindQuery(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}
	page, pageSize := serializer.ParsePaginationQuery(ctx)
	req.Page = page
	req.PageSize = pageSize

	userID := ctx.GetUint("userID")
	records, total, err := services.DNSService.List(userID, &req)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.SuccessPage(ctx, records, total, page, pageSize)
}

// Create 创建 DNS 记录
func (c *DNSController) Create(ctx *gin.Context) {
	var req services.CreateDNSRecordRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	record, err := services.DNSService.Create(userID, &req)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, record)
}

// Update 更新 DNS 记录
func (c *DNSController) Update(ctx *gin.Context) {
	var req services.UpdateDNSRecordRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	record, err := services.DNSService.Update(userID, &req)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, record)
}

// Delete 删除 DNS 记录
func (c *DNSController) Delete(ctx *gin.Context) {
	idStr := ctx.Query("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		serializer.FailWithCode(ctx, serializer.CodeParamErr, "无效的 ID")
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.DNSService.Delete(userID, uint(id)); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, nil)
}

// Get 获取单个 DNS 记录
func (c *DNSController) Get(ctx *gin.Context) {
	idStr := ctx.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		serializer.FailWithCode(ctx, serializer.CodeParamErr, "无效的 ID")
		return
	}

	userID := ctx.GetUint("userID")
	record, err := services.DNSService.Get(userID, uint(id))
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, record)
}

// Sync 同步 DNS 记录到文件
func (c *DNSController) Sync(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	if err := services.DNSService.SyncToFile(userID); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{"message": "同步成功"})
}

// Import 从文件导入 DNS 记录
func (c *DNSController) Import(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	imported, err := services.DNSService.ImportFromFile(userID)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{
		"message":  "导入成功",
		"imported": imported,
	})
}

// GetFile 获取文件中的 DNS 记录
func (c *DNSController) GetFile(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	records, err := services.DNSService.GetExtraRecordsFromFile(userID)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, records)
}
