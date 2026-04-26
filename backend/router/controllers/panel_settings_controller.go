package controllers

import (
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

type PanelSettingsController struct{}

func NewPanelSettingsController() *PanelSettingsController {
	return &PanelSettingsController{}
}

// SaveConnectionRequest holds the Headscale connection settings form data.
type SaveConnectionRequest struct {
	GRPCAddr string `json:"grpc_addr"`
	APIKey   string `json:"api_key"`
	Insecure bool   `json:"insecure"`
}

// GetConnection godoc
// @Summary Get Headscale connection settings
// @Tags panel-settings
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /panel/connection [get]
// GetConnection returns current panel Headscale connection settings (API key masked).
func (c *PanelSettingsController) GetConnection(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	settings, err := services.PanelSettingsService.GetConnectionSettings(userID)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, settings)
}

// SaveConnection godoc
// @Summary Save Headscale connection settings
// @Tags panel-settings
// @Accept json
// @Produce json
// @Param body body SaveConnectionRequest true "Connection settings"
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /panel/connection [put]
// SaveConnection persists the Headscale connection settings.
func (c *PanelSettingsController) SaveConnection(ctx *gin.Context) {
	var req SaveConnectionRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.PanelSettingsService.SaveConnectionSettings(userID, req.GRPCAddr, req.APIKey, req.Insecure); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, gin.H{"message": "连接设置已保存"})
}

// SyncData godoc
// @Summary Trigger a data sync from Headscale
// @Tags panel-settings
// @Produce json
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /panel/sync [post]
// SyncData triggers a data sync from Headscale to local database.
func (c *PanelSettingsController) SyncData(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	if err := services.PanelSettingsService.SyncDataFromHeadscale(userID); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, gin.H{"message": "数据同步完成"})
}

// GetBuiltinOIDC godoc
// @Summary Get built-in OIDC configuration
// @Tags panel-settings
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /panel/builtin-oidc [get]
// GetBuiltinOIDC returns the built-in OIDC configuration.
func (c *PanelSettingsController) GetBuiltinOIDC(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	config, err := services.PanelSettingsService.GetBuiltinOIDC(userID)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, config)
}

// EnableBuiltinOIDC godoc
// @Summary Enable the built-in OIDC client
// @Tags panel-settings
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /panel/builtin-oidc [post]
// EnableBuiltinOIDC creates the built-in OIDC client and returns the configuration.
func (c *PanelSettingsController) EnableBuiltinOIDC(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	config, err := services.PanelSettingsService.EnableBuiltinOIDC(userID)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, config)
}

// GetOIDCSettings godoc
// @Summary Get OIDC settings
// @Tags panel-settings
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /panel/oidc-settings [get]
// GetOIDCSettings returns saved OIDC form settings.
func (c *PanelSettingsController) GetOIDCSettings(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	payload, err := services.PanelSettingsService.GetOIDCSettings(userID)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	if payload == nil {
		unifyerror.Success(ctx, nil)
		return
	}
	unifyerror.Success(ctx, payload)
}

// SaveOIDCSettings godoc
// @Summary Save OIDC settings
// @Tags panel-settings
// @Accept json
// @Produce json
// @Param body body services.OIDCSettingsPayload true "OIDC settings"
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /panel/oidc-settings [put]
// SaveOIDCSettings persists OIDC form settings.
func (c *PanelSettingsController) SaveOIDCSettings(ctx *gin.Context) {
	var req services.OIDCSettingsPayload
	if err := ctx.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.PanelSettingsService.SaveOIDCSettings(userID, &req); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, gin.H{"message": "OIDC 设置已保存"})
}

// GetOIDCStatus godoc
// @Summary Get OIDC status and mode
// @Tags panel-settings
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /panel/oidc-status [get]
// GetOIDCStatus returns the current OIDC mode for the create-user form.
// Distinguishes between: none, builtin (password required), third-party (password optional).
func (c *PanelSettingsController) GetOIDCStatus(ctx *gin.Context) {
	thirdParty := services.PanelSettingsService.IsThirdPartyOIDCEnabled()
	builtin := services.PanelSettingsService.IsBuiltinOIDCEnabled()
	unifyerror.Success(ctx, gin.H{
		"oidc_enabled":      thirdParty || builtin,
		"third_party":       thirdParty,
		"builtin":           builtin,
		"password_required": !thirdParty,
		"mode":              services.PanelSettingsService.HeadscaleOIDCMode(),
	})
}
