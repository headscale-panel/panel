package controllers

import (
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

type HeadscaleConfigController struct{}

func NewHeadscaleConfigController() *HeadscaleConfigController {
	return &HeadscaleConfigController{}
}

// Get godoc
// @Summary Get the current Headscale configuration
// @Tags headscale-config
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /headscale/config [get]
func (c *HeadscaleConfigController) Get(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	config, err := services.HeadscaleConfigService.GetConfigWithAuth(userID)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, services.HeadscaleConfigService.RedactSecrets(config))
}

// Update godoc
// @Summary Save the Headscale configuration
// @Tags headscale-config
// @Accept json
// @Produce json
// @Param body body object true "Headscale config object"
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/config [put]
func (c *HeadscaleConfigController) Update(ctx *gin.Context) {
	var config services.HeadscaleConfigFile
	if err := ctx.ShouldBindJSON(&config); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	currentConfig, err := services.HeadscaleConfigService.GetConfig()
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	merged := services.HeadscaleConfigService.MergePreservedSecrets(&config, currentConfig)
	if err := services.HeadscaleConfigService.SaveConfigWithAuth(userID, merged, true); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, gin.H{"message": "配置已保存"})
}

// Preview godoc
// @Summary Preview the YAML output of a Headscale configuration
// @Tags headscale-config
// @Accept json
// @Produce json
// @Param body body object true "Headscale config object"
// @Success 200 {object} unifyerror.Response{data=object} "yaml string"
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/config/preview [post]
func (c *HeadscaleConfigController) Preview(ctx *gin.Context) {
	var config services.HeadscaleConfigFile
	if err := ctx.ShouldBindJSON(&config); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	currentConfig, err := services.HeadscaleConfigService.GetConfig()
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	merged := services.HeadscaleConfigService.MergePreservedSecrets(&config, currentConfig)

	yamlStr, err := services.HeadscaleConfigService.PreviewConfigWithAuth(userID, merged)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, gin.H{"yaml": yamlStr})
}
