package controllers

import (
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"
	"strconv"

	"github.com/gin-gonic/gin"
)

type OauthClientController struct{}

func NewOauthClientController() *OauthClientController {
	return &OauthClientController{}
}

func (c *OauthClientController) List(ctx *gin.Context) {
	page, _ := strconv.Atoi(ctx.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(ctx.DefaultQuery("page_size", "10"))

	userID := ctx.GetUint("userID")
	clients, total, err := services.OauthClientService.List(userID, page, pageSize)
	if err != nil {
		serializer.Fail(ctx, serializer.ErrDatabase)
		return
	}

	serializer.Success(ctx, gin.H{
		"list":  clients,
		"total": total,
	})
}

type CreateOauthClientRequest struct {
	Name         string `json:"name" binding:"required"`
	RedirectURIs string `json:"redirect_uris" binding:"required"`
}

func (c *OauthClientController) Create(ctx *gin.Context) {
	var req CreateOauthClientRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	client, err := services.OauthClientService.Create(userID, req.Name, req.RedirectURIs)
	if err != nil {
		serializer.Fail(ctx, serializer.ErrDatabase)
		return
	}

	serializer.Success(ctx, client)
}

type UpdateOauthClientRequest struct {
	ID           uint   `json:"id" binding:"required"`
	Name         string `json:"name" binding:"required"`
	RedirectURIs string `json:"redirect_uris" binding:"required"`
}

func (c *OauthClientController) Update(ctx *gin.Context) {
	var req UpdateOauthClientRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.OauthClientService.Update(userID, req.ID, req.Name, req.RedirectURIs); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, nil)
}

func (c *OauthClientController) Delete(ctx *gin.Context) {
	idStr := ctx.Query("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		serializer.FailWithCode(ctx, serializer.CodeParamErr, "无效的 ID")
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.OauthClientService.Delete(userID, uint(id)); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, nil)
}

type RegenerateSecretRequest struct {
	ID uint `json:"id" binding:"required"`
}

func (c *OauthClientController) RegenerateSecret(ctx *gin.Context) {
	var req RegenerateSecretRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	secret, err := services.OauthClientService.RegenerateSecret(userID, req.ID)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{"client_secret": secret})
}
