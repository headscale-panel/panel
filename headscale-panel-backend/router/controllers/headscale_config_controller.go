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
	config, err := services.HeadscaleConfigService.GetConfig()
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, config)
}

// Update saves the Headscale configuration to the config.yaml file
func (c *HeadscaleConfigController) Update(ctx *gin.Context) {
	var config services.HeadscaleConfigFile
	if err := ctx.ShouldBindJSON(&config); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	if err := services.HeadscaleConfigService.SaveConfig(&config); err != nil {
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

	yamlStr, err := services.HeadscaleConfigService.PreviewConfig(&config)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{"yaml": yamlStr})
}
