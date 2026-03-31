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
