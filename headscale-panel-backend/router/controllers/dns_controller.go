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

	records, total, err := services.DNSService.List(&req)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{
		"list":  records,
		"total": total,
	})
}

// Create 创建 DNS 记录
func (c *DNSController) Create(ctx *gin.Context) {
	var req services.CreateDNSRecordRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	record, err := services.DNSService.Create(&req)
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

	record, err := services.DNSService.Update(&req)
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

	if err := services.DNSService.Delete(uint(id)); err != nil {
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

	record, err := services.DNSService.Get(uint(id))
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, record)
}

// Sync 同步 DNS 记录到文件
func (c *DNSController) Sync(ctx *gin.Context) {
	if err := services.DNSService.SyncToFile(); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{"message": "同步成功"})
}

// Import 从文件导入 DNS 记录
func (c *DNSController) Import(ctx *gin.Context) {
	imported, err := services.DNSService.ImportFromFile()
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
	records, err := services.DNSService.GetExtraRecordsFromFile()
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, records)
}
