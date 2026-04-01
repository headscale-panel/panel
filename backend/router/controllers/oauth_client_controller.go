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

// List godoc
// @Summary List OAuth clients
// @Tags oauth
// @Produce json
// @Param page query int false "Page number" default(1)
// @Param page_size query int false "Page size" default(10)
// @Success 200 {object} serializer.Response{data=serializer.PaginatedData{list=[]model.OauthClient}}
// @Security BearerAuth
// @Router /system/oauth-clients [get]
func (c *OauthClientController) List(ctx *gin.Context) {
	var q serializer.PaginationQuery
	if err := ctx.ShouldBindQuery(&q); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}
	page, pageSize := q.Resolve()

	userID := ctx.GetUint("userID")
	clients, total, err := services.OauthClientService.List(userID, page, pageSize)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.SuccessPage(ctx, clients, total, page, pageSize)
}

type CreateOauthClientRequest struct {
	Name         string `json:"name" binding:"required"`
	RedirectURIs string `json:"redirect_uris" binding:"required"`
}

// Create godoc
// @Summary Create an OAuth client
// @Tags oauth
// @Accept json
// @Produce json
// @Param body body CreateOauthClientRequest true "OAuth client data"
// @Success 200 {object} serializer.Response{data=model.OauthClient}
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /system/oauth-clients [post]
func (c *OauthClientController) Create(ctx *gin.Context) {
	var req CreateOauthClientRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	client, err := services.OauthClientService.Create(userID, req.Name, req.RedirectURIs)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, client)
}

type UpdateOauthClientRequest struct {
	ID           uint   `json:"id" binding:"required"`
	Name         string `json:"name" binding:"required"`
	RedirectURIs string `json:"redirect_uris" binding:"required"`
}

// Update godoc
// @Summary Update an OAuth client
// @Tags oauth
// @Accept json
// @Produce json
// @Param body body UpdateOauthClientRequest true "OAuth client update data"
// @Success 200 {object} serializer.Response
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /system/oauth-clients [put]
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

// Delete godoc
// @Summary Delete an OAuth client
// @Tags oauth
// @Produce json
// @Param id query int true "Client ID"
// @Success 200 {object} serializer.Response
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /system/oauth-clients [delete]
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

// RegenerateSecret godoc
// @Summary Regenerate the client secret for an OAuth client
// @Tags oauth
// @Accept json
// @Produce json
// @Param body body RegenerateSecretRequest true "Client ID"
// @Success 200 {object} serializer.Response{data=object} "client_secret"
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /system/oauth-clients/secret [post]
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
