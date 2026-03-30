package controllers

import (
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

type PanelSettingsController struct{}

func NewPanelSettingsController() *PanelSettingsController {
	return &PanelSettingsController{}
}

// GetConnection returns current panel Headscale connection settings (API key masked).
func (c *PanelSettingsController) GetConnection(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	settings, err := services.PanelSettingsService.GetConnectionSettings(userID)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, settings)
}

// SaveConnection persists the Headscale connection settings.
func (c *PanelSettingsController) SaveConnection(ctx *gin.Context) {
	var req struct {
		GRPCAddr string `json:"grpc_addr"`
		APIKey   string `json:"api_key"` // optional - empty preserves existing
		Insecure bool   `json:"insecure"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.PanelSettingsService.SaveConnectionSettings(userID, req.GRPCAddr, req.APIKey, req.Insecure); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{"message": "连接设置已保存"})
}

// SyncData triggers a data sync from Headscale to local database.
func (c *PanelSettingsController) SyncData(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	if err := services.PanelSettingsService.SyncDataFromHeadscale(userID); err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, gin.H{"message": "数据同步完成"})
}

// GetBuiltinOIDC returns the built-in OIDC configuration.
func (c *PanelSettingsController) GetBuiltinOIDC(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	config, err := services.PanelSettingsService.GetBuiltinOIDC(userID)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, config)
}

// EnableBuiltinOIDC creates the built-in OIDC client and returns the configuration.
func (c *PanelSettingsController) EnableBuiltinOIDC(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	config, err := services.PanelSettingsService.EnableBuiltinOIDC(userID)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, config)
}

// GetOIDCSettings returns saved OIDC form settings.
func (c *PanelSettingsController) GetOIDCSettings(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	payload, err := services.PanelSettingsService.GetOIDCSettings(userID)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	if payload == nil {
		serializer.Success(ctx, nil)
		return
	}
	serializer.Success(ctx, payload)
}

// SaveOIDCSettings persists OIDC form settings.
func (c *PanelSettingsController) SaveOIDCSettings(ctx *gin.Context) {
	var req services.OIDCSettingsPayload
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.PanelSettingsService.SaveOIDCSettings(userID, &req); err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, gin.H{"message": "OIDC 设置已保存"})
}

// GetOIDCStatus returns the current OIDC mode for the create-user form.
// Distinguishes between: none, builtin (password required), third-party (password optional).
func (c *PanelSettingsController) GetOIDCStatus(ctx *gin.Context) {
	thirdParty := services.PanelSettingsService.IsThirdPartyOIDCEnabled()
	builtin := services.PanelSettingsService.IsBuiltinOIDCEnabled()
	serializer.Success(ctx, gin.H{
		"oidc_enabled":      thirdParty || builtin,
		"third_party":       thirdParty,
		"builtin":           builtin,
		"password_required": !thirdParty,
		"mode":              services.PanelSettingsService.HeadscaleOIDCMode(),
	})
}
