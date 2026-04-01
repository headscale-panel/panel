package controllers

import (
	"headscale-panel/pkg/utils/serializer"
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
// @Success 200 {object} serializer.Response{data=object}
// @Security BearerAuth
// @Router /headscale/config [get]
// Get returns the current Headscale configuration
func (c *HeadscaleConfigController) Get(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	config, err := services.HeadscaleConfigService.GetConfigWithAuth(userID)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, services.HeadscaleConfigService.RedactSecrets(config))
}

// Update godoc
// @Summary Save the Headscale configuration
// @Tags headscale-config
// @Accept json
// @Produce json
// @Param body body object true "Headscale config object"
// @Success 200 {object} serializer.Response
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /headscale/config [put]
// Update saves the Headscale configuration to the config.yaml file
func (c *HeadscaleConfigController) Update(ctx *gin.Context) {
	var config services.HeadscaleConfigFile
	if err := ctx.ShouldBindJSON(&config); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	currentConfig, err := services.HeadscaleConfigService.GetConfig()
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	merged := services.HeadscaleConfigService.MergePreservedSecrets(&config, currentConfig)
	if err := services.HeadscaleConfigService.SaveConfigWithAuth(userID, merged); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{"message": "配置已保存"})
}

// Preview godoc
// @Summary Preview the YAML output of a Headscale configuration
// @Tags headscale-config
// @Accept json
// @Produce json
// @Param body body object true "Headscale config object"
// @Success 200 {object} serializer.Response{data=object} "yaml string"
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /headscale/config/preview [post]
// Preview returns the YAML preview of the configuration without saving
func (c *HeadscaleConfigController) Preview(ctx *gin.Context) {
	var config services.HeadscaleConfigFile
	if err := ctx.ShouldBindJSON(&config); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	currentConfig, err := services.HeadscaleConfigService.GetConfig()
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	merged := services.HeadscaleConfigService.MergePreservedSecrets(&config, currentConfig)

	yamlStr, err := services.HeadscaleConfigService.PreviewConfigWithAuth(userID, merged)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{"yaml": yamlStr})
}
