// Copyright (C) 2026
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

package router

import (
	"headscale-panel/model"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/log"
	"headscale-panel/router/controllers"
	"headscale-panel/router/middleware"
	"headscale-panel/router/services"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// InitRouter assembles the HTTP surface.
//
// The route table is the clearest statement of the domain split this release is
// about: /accounts and /roles are panel concepts, /network-identities and
// /devices are tailnet concepts, and /system/* configures the bridge between
// them. Nothing is aliased, so a stale client fails loudly instead of silently
// reading the wrong resource.
func InitRouter() *gin.Engine {
	// gin.Default() writes plain-text access logs that cannot carry a request id;
	// the structured replacements live in middleware.
	r := gin.New()
	if err := r.SetTrustedProxies(parseTrustedProxies(conf.Conf.System.TrustedProxies)); err != nil {
		log.L.Warn("invalid SYSTEM_TRUSTED_PROXIES configuration; trusting no proxies", zap.Error(err))
		_ = r.SetTrustedProxies(nil)
	}
	r.Use(middleware.RequestIDMiddleware(), middleware.AccessLogMiddleware(), middleware.SecurityHeadersMiddleware(), gin.Recovery())

	corsConfig := cors.DefaultConfig()
	corsConfig.AllowOrigins = buildAllowedOrigins()
	corsConfig.AddAllowHeaders(
		"Authorization", "Content-Type", "X-Request-Id",
		"X-Setup-Bootstrap-Token", "X-Setup-Init-Token", "X-Setup-Token", "X-Bootstrap-Token",
	)
	r.Use(cors.New(corsConfig))

	if frontendDir := resolveFrontendDir(); frontendDir != "" {
		r.Use(middleware.FrontendMiddleware(frontendDir))
	}

	api := r.Group("/panel/api/v1")

	// --- unauthenticated ---
	api.GET("/healthz", controllers.Healthz)
	api.GET("/readyz", controllers.Readyz)
	api.GET("/system/version", controllers.Version)

	// Setup endpoints are reachable before any account exists, so there is no
	// identity to attribute repeated attempts to; they are limited per IP.
	setupLimiter := middleware.NewRateLimiter(constants.SetupRateLimitCount, constants.SetupRateLimitWindow)
	setupController := controllers.NewSetupController()
	api.GET("/setup/status", setupController.GetStatus)
	api.POST("/setup/preflight", middleware.RateLimitMiddleware(setupLimiter), setupController.Preflight)
	api.POST("/setup/connectivity-check", middleware.RateLimitMiddleware(setupLimiter), setupController.ConnectivityCheck)
	api.POST("/setup/init", middleware.RateLimitMiddleware(setupLimiter), setupController.Initialize)

	authLimiter := middleware.NewRateLimiter(constants.AuthRateLimitCount, constants.AuthRateLimitWindow)
	authController := controllers.NewAuthController()
	api.POST("/auth/login", middleware.RateLimitMiddleware(authLimiter), authController.Login)
	api.POST("/auth/register", middleware.RateLimitMiddleware(authLimiter), authController.Register)
	api.GET("/auth/status", authController.AuthStatus)
	api.GET("/auth/panel-sso/login", authController.PanelSSOLogin)
	api.GET("/auth/panel-sso/callback", authController.PanelSSOCallback)

	// --- panel IdP (public: headscale and the browser are the callers) ---
	idpController := controllers.NewIdPController()
	idpLimiter := middleware.NewRateLimiter(constants.AuthRateLimitCount, constants.AuthRateLimitWindow)
	r.GET("/.well-known/openid-configuration", idpController.Discovery)
	r.GET("/.well-known/jwks.json", idpController.JWKS)
	// The issuer may carry a path prefix, in which case headscale builds its
	// discovery URL relative to /panel, so both locations have to answer.
	r.GET("/panel/.well-known/openid-configuration", idpController.Discovery)
	r.GET("/panel/.well-known/jwks.json", idpController.JWKS)
	api.POST("/idp/token", middleware.RateLimitMiddleware(idpLimiter), idpController.Token)
	api.GET("/idp/userinfo", idpController.UserInfo)

	// The socket authenticates with a token in its first frame, not with the
	// Authorization header, so it cannot sit behind AuthMiddleware. HandleWebSocket
	// closes the connection when that frame does not arrive in time.
	api.GET("/ws", services.HandleWebSocket)

	// --- authenticated ---
	authed := api.Group("/")
	authed.Use(middleware.AuthMiddleware(), middleware.AuditMiddleware(model.DB))
	// Every authenticated write is limited per IP. Reads are not: a page that polls
	// would hit the limit for doing what it is supposed to do.
	writeLimiter := middleware.NewRateLimiter(constants.WriteRateLimitCount, constants.WriteRateLimitWindow)
	authed.Use(middleware.RateLimitWritesMiddleware(writeLimiter))
	authed.POST("/auth/logout", authController.Logout)
	authed.GET("/idp/authorize", idpController.Authorize)
	registerAuthedRoutes(authed, idpController)

	return r
}

// registerAuthedRoutes wires every authenticated endpoint.
func registerAuthedRoutes(g *gin.RouterGroup, idpController *controllers.IdPController) {
	me := controllers.NewMeController()
	g.GET("/me", me.Get)
	g.PUT("/me/password", me.ChangePassword)
	g.POST("/me/guide-tour/seen", me.MarkTourSeen)
	g.POST("/me/guide-tour/reset", me.ResetTour)
	g.GET("/me/network-identities", me.NetworkIdentities)
	g.POST("/me/totp/generate", me.GenerateTOTP)
	g.POST("/me/totp/enable", me.EnableTOTP)
	g.DELETE("/me/totp", me.DisableTOTP)

	registerAccountRoutes(g)
	registerNetworkRoutes(g)
	registerPolicyRoutes(g)
	registerSystemRoutes(g, idpController)
	registerReportingRoutes(g)
}

func registerAccountRoutes(g *gin.RouterGroup) {
	accounts := controllers.NewAccountController()
	g.GET("/accounts", middleware.PermissionMiddleware(constants.PermAccountList), accounts.List)
	g.POST("/accounts", middleware.PermissionMiddleware(constants.PermAccountCreate), accounts.Create)
	g.GET("/accounts/:id", middleware.PermissionMiddleware(constants.PermAccountList), accounts.Get)
	g.PUT("/accounts/:id", middleware.PermissionMiddleware(constants.PermAccountUpdate), accounts.Update)
	g.DELETE("/accounts/:id", middleware.PermissionMiddleware(constants.PermAccountDelete), accounts.Delete)
	g.POST("/accounts/:id/status", middleware.PermissionMiddleware(constants.PermAccountUpdate), accounts.SetStatus)
	g.POST("/accounts/:id/password", middleware.PermissionMiddleware(constants.PermAccountUpdate), accounts.SetPassword)
	g.GET("/accounts/:id/identities", middleware.PermissionMiddleware(constants.PermAccountList), accounts.Identities)
	g.DELETE("/accounts/:id/identities/:identityID", middleware.PermissionMiddleware(constants.PermAccountUpdate), accounts.UnlinkIdentity)
	g.GET("/accounts/:id/network-bindings", middleware.PermissionMiddleware(constants.PermNetworkBindingRead), accounts.NetworkBindings)
	g.POST("/accounts/:id/network-bindings/transfer", middleware.PermissionMiddleware(constants.PermNetworkBindingManage), accounts.TransferBinding)
	g.POST("/accounts/:id/network-bindings/:hsUserID/primary", middleware.PermissionMiddleware(constants.PermNetworkBindingManage), accounts.SetPrimaryBinding)

	roles := controllers.NewRoleController()
	g.GET("/roles", middleware.PermissionMiddleware(constants.PermRoleList), roles.List)
	g.POST("/roles", middleware.PermissionMiddleware(constants.PermRoleManage), roles.Create)
	g.PUT("/roles/:id", middleware.PermissionMiddleware(constants.PermRoleManage), roles.Update)
	g.DELETE("/roles/:id", middleware.PermissionMiddleware(constants.PermRoleManage), roles.Delete)
	g.PUT("/roles/:id/permissions", middleware.PermissionMiddleware(constants.PermRoleManage), roles.SetPermissions)
	g.GET("/permissions", middleware.PermissionMiddleware(constants.PermRoleList), roles.Catalogue)
}

func registerNetworkRoutes(g *gin.RouterGroup) {
	identities := controllers.NewNetworkIdentityController()
	g.GET("/network-identities", middleware.PermissionMiddleware(constants.PermNetworkIdentityList), identities.List)
	g.POST("/network-identities", middleware.PermissionMiddleware(constants.PermNetworkIdentityCreate), identities.Create)
	g.POST("/network-identities/reconcile", middleware.PermissionMiddleware(constants.PermNetworkIdentityUpdate), identities.Reconcile)
	g.GET("/network-identities/:hsUserID", middleware.PermissionMiddleware(constants.PermNetworkIdentityRead), identities.Get)
	g.POST("/network-identities/:hsUserID/rename", middleware.PermissionMiddleware(constants.PermNetworkIdentityUpdate), identities.Rename)
	g.DELETE("/network-identities/:hsUserID", middleware.PermissionMiddleware(constants.PermNetworkIdentityDelete), identities.Delete)
	g.POST("/network-identities/:hsUserID/bind", middleware.PermissionMiddleware(constants.PermNetworkBindingManage), identities.Bind)
	g.DELETE("/network-identities/:hsUserID/bind", middleware.PermissionMiddleware(constants.PermNetworkBindingManage), identities.Unbind)

	devices := controllers.NewDeviceController()
	deviceRead := middleware.PermissionAnyMiddleware(constants.PermNetworkDeviceList, constants.PermNetworkDeviceListSelf)
	g.GET("/devices", deviceRead, devices.List)
	g.GET("/devices/:nodeID", deviceRead, devices.Get)
	g.POST("/devices/register", middleware.PermissionAnyMiddleware(constants.PermNetworkDeviceCreate, constants.PermNetworkDeviceCreateSelf), devices.Register)
	g.POST("/devices/:nodeID/rename", middleware.PermissionAnyMiddleware(constants.PermNetworkDeviceUpdate, constants.PermNetworkDeviceUpdateSelf), devices.Rename)
	g.DELETE("/devices/:nodeID", middleware.PermissionAnyMiddleware(constants.PermNetworkDeviceDelete, constants.PermNetworkDeviceDeleteSelf), devices.Delete)
	g.POST("/devices/:nodeID/expire", middleware.PermissionAnyMiddleware(constants.PermNetworkDeviceUpdate, constants.PermNetworkDeviceUpdateSelf), devices.Expire)
	g.POST("/devices/:nodeID/tags", middleware.PermissionMiddleware(constants.PermNetworkDeviceTags), devices.SetTags)

	g.GET("/preauthkeys", middleware.PermissionAnyMiddleware(constants.PermNetworkKeyList, constants.PermNetworkKeyCreateSelf), devices.ListPreAuthKeys)
	g.POST("/preauthkeys", middleware.PermissionAnyMiddleware(constants.PermNetworkKeyCreate, constants.PermNetworkKeyCreateSelf), devices.CreatePreAuthKey)
	g.POST("/preauthkeys/:id/expire", middleware.PermissionMiddleware(constants.PermNetworkKeyUpdate), devices.ExpirePreAuthKey)
	g.DELETE("/preauthkeys/:id", middleware.PermissionMiddleware(constants.PermNetworkKeyDelete), devices.DeletePreAuthKey)

	routes := controllers.NewRouteController()
	g.GET("/routes", middleware.PermissionMiddleware(constants.PermNetworkRouteList), routes.ListRoutes)
	g.POST("/routes/:nodeID/enable", middleware.PermissionMiddleware(constants.PermNetworkRouteUpdate), routes.EnableRoute)
	g.POST("/routes/:nodeID/disable", middleware.PermissionMiddleware(constants.PermNetworkRouteUpdate), routes.DisableRoute)

	connection := controllers.NewConnectionController()
	g.GET("/connection/identities", middleware.PermissionAnyMiddleware(constants.PermNetworkIdentityList, constants.PermNetworkDeviceCreateSelf), connection.ListIdentities)
	g.POST("/connection/commands", middleware.PermissionAnyMiddleware(constants.PermNetworkKeyCreate, constants.PermNetworkKeyCreateSelf), connection.GenerateCommands)
	g.POST("/connection/ssh-command", deviceRead, connection.GenerateSSHCommand)
}

func registerPolicyRoutes(g *gin.RouterGroup) {
	acl := controllers.NewACLController()
	policyRead := middleware.PermissionMiddleware(constants.PermACLPolicyRead)
	policyWrite := middleware.PermissionMiddleware(constants.PermACLPolicyUpdate)

	g.GET("/policy", policyRead, acl.GetPolicy)
	g.PUT("/policy", policyWrite, acl.UpdatePolicy)
	g.POST("/policy/raw", policyWrite, acl.SetPolicyRaw)
	g.POST("/policy/check", policyWrite, acl.CheckPolicy)
	g.GET("/policy/rules", policyRead, acl.GetParsedRules)
	g.POST("/policy/rules", policyWrite, acl.AddRule)
	g.PUT("/policy/rules", policyWrite, acl.UpdateRuleByIndex)
	g.DELETE("/policy/rules", policyWrite, acl.DeleteRuleByIndex)
	g.POST("/policy/generate", policyWrite, acl.Generate)
	g.POST("/policy/sync-resources", policyWrite, acl.SyncResourcesAsHosts)
	g.GET("/policy/revisions", policyRead, acl.ListPolicies)
	g.POST("/policy/revisions/:id/apply", policyWrite, acl.Apply)

	resources := controllers.NewResourceController()
	g.GET("/resources", middleware.PermissionMiddleware(constants.PermACLResourceList), resources.List)
	g.GET("/resources/:id", middleware.PermissionMiddleware(constants.PermACLResourceRead), resources.Get)
	g.POST("/resources", middleware.PermissionMiddleware(constants.PermACLResourceCreate), resources.Create)
	g.PUT("/resources/:id", middleware.PermissionMiddleware(constants.PermACLResourceUpdate), resources.Update)
	g.DELETE("/resources/:id", middleware.PermissionMiddleware(constants.PermACLResourceDelete), resources.Delete)
	g.POST("/resources/sync", middleware.PermissionMiddleware(constants.PermACLPolicyUpdate), acl.SyncResourcesAsHosts)
}

func registerSystemRoutes(g *gin.RouterGroup, idpController *controllers.IdPController) {
	connection := controllers.NewConnectionSettingsController()
	configRead := middleware.PermissionMiddleware(constants.PermSystemConfigRead)
	configWrite := middleware.PermissionMiddleware(constants.PermSystemConfigUpdate)

	g.GET("/system/config/connection", configRead, connection.Get)
	g.PUT("/system/config/connection", configWrite, connection.Save)
	g.POST("/system/config/connection/test", configWrite, connection.Test)
	g.POST("/system/reconcile", configWrite, connection.Reconcile)

	sso := controllers.NewPanelSSOController()
	authManage := middleware.PermissionMiddleware(constants.PermSystemAuthManage)
	g.GET("/system/auth/panel-sso", authManage, sso.Get)
	g.PUT("/system/auth/panel-sso", authManage, sso.Save)
	g.GET("/system/auth/idp", authManage, idpController.State)
	g.PUT("/system/auth/idp", authManage, idpController.SetEnabled)
	g.POST("/system/auth/grant-enroll", middleware.PermissionMiddleware(constants.PermRoleManage), idpController.GrantEnroll)

	hsConfig := controllers.NewHeadscaleConfigController()
	g.GET("/system/config/headscale", configRead, hsConfig.Get)
	g.GET("/system/config/headscale/running", configRead, hsConfig.Running)
	g.PUT("/system/config/headscale", configWrite, hsConfig.Update)
	g.POST("/system/config/headscale/preview", configWrite, hsConfig.Preview)
	g.GET("/system/config/headscale/deployments", configRead, hsConfig.Deployments)
	g.POST("/system/config/headscale/deployments/:id/verify", configWrite, hsConfig.VerifyDeployment)
	g.POST("/system/config/headscale/bootstrap/:action", configWrite, hsConfig.Bootstrap)
	g.GET("/system/config/model", configRead, hsConfig.GetMode)
	g.PUT("/system/config/model", configWrite, hsConfig.UpdateMode)

	derp := controllers.NewDERPController()
	derpRead := middleware.PermissionMiddleware(constants.PermSystemDerpRead)
	derpWrite := middleware.PermissionMiddleware(constants.PermSystemDerpManage)
	g.GET("/system/derp", derpRead, derp.Get)
	g.PUT("/system/derp", derpWrite, derp.Update)
	g.POST("/system/derp/regions", derpWrite, derp.AddRegion)
	g.PUT("/system/derp/regions/:regionId", derpWrite, derp.UpdateRegion)
	g.DELETE("/system/derp/regions/:regionId", derpWrite, derp.DeleteRegion)
	g.POST("/system/derp/regions/:regionId/nodes", derpWrite, derp.AddNode)
	g.PUT("/system/derp/regions/:regionId/nodes/:nodeIndex", derpWrite, derp.UpdateNode)
	g.DELETE("/system/derp/regions/:regionId/nodes/:nodeIndex", derpWrite, derp.DeleteNode)

	lifecycle := controllers.NewLifecycleController()
	lifecyclePerm := middleware.PermissionMiddleware(constants.PermSystemLifecycle)
	g.GET("/system/hs/status", lifecyclePerm, lifecycle.Status)
	g.POST("/system/hs/start", lifecyclePerm, lifecycle.Start)
	g.POST("/system/hs/stop", lifecyclePerm, lifecycle.Stop)
	g.POST("/system/hs/restart", lifecyclePerm, lifecycle.Restart)

	health := controllers.NewHealthController()
	g.GET("/system/health", middleware.PermissionMiddleware(constants.PermSystemHealthView), health.Get)
	g.GET("/system/audit-events", middleware.PermissionMiddleware(constants.PermSystemAuditList), health.AuditEvents)
	g.GET("/status", middleware.PermissionMiddleware(constants.PermSystemHealthView), controllers.NewStatusController().GetSystemStatus)

	dns := controllers.NewDNSController()
	g.GET("/dns/records", middleware.PermissionMiddleware(constants.PermDNSRecordList), dns.List)
	g.GET("/dns/records/:id", middleware.PermissionMiddleware(constants.PermDNSRecordList), dns.Get)
	g.POST("/dns/records", middleware.PermissionMiddleware(constants.PermDNSRecordManage), dns.Create)
	g.PUT("/dns/records", middleware.PermissionMiddleware(constants.PermDNSRecordManage), dns.Update)
	g.DELETE("/dns/records", middleware.PermissionMiddleware(constants.PermDNSRecordManage), dns.Delete)
	g.POST("/dns/records/import", middleware.PermissionMiddleware(constants.PermDNSRecordManage), dns.Import)
	g.POST("/dns/apply", middleware.PermissionMiddleware(constants.PermDNSRecordManage), dns.Sync)
	g.GET("/dns/file", middleware.PermissionMiddleware(constants.PermDNSRecordList), dns.GetFile)
}

func registerReportingRoutes(g *gin.RouterGroup) {
	dashboard := controllers.NewDashboardController()
	g.GET("/overview", middleware.PermissionMiddleware(constants.PermDashboardView), dashboard.Overview)
	topology := controllers.NewTopologyController()
	g.GET("/topology", middleware.PermissionMiddleware(constants.PermTopologyView), topology.GetTopology)
	g.GET("/topology/with-acl", middleware.PermissionMiddleware(constants.PermTopologyACLView), topology.GetTopologyWithACL)
	g.GET("/topology/acl-matrix", middleware.PermissionMiddleware(constants.PermTopologyACLView), topology.GetACLMatrix)

	metrics := controllers.NewMetricsController()
	g.GET("/metrics/device-status", middleware.PermissionMiddleware(constants.PermMetricsView), metrics.GetDeviceStatus)
	g.GET("/metrics/device-status-histories", middleware.PermissionMiddleware(constants.PermMetricsView), metrics.GetDeviceStatusHistories)
	g.GET("/metrics/online-duration", middleware.PermissionMiddleware(constants.PermMetricsView), metrics.GetOnlineDuration)
	g.GET("/metrics/online-duration-stats", middleware.PermissionMiddleware(constants.PermMetricsView), metrics.GetOnlineDurationStats)
	g.GET("/metrics/online-duration-summary", middleware.PermissionMiddleware(constants.PermMetricsView), metrics.GetOnlineDurationSummary)
	g.GET("/metrics/influxdb-status", middleware.PermissionMiddleware(constants.PermMetricsView), metrics.GetInfluxDBStatus)
	g.GET("/metrics/traffic", middleware.PermissionMiddleware(constants.PermMetricsView), metrics.GetTrafficStats)
}

// buildAllowedOrigins derives the CORS allow-list from the configured base URL.
//
// Only the panel's own origin is allowed: a wildcard here would let any site
// drive the API with a stolen bearer token.
func buildAllowedOrigins() []string {
	base := strings.TrimRight(strings.TrimSpace(configBaseURL()), "/")
	if base == "" {
		return []string{"http://localhost:5173", "http://localhost:8080"}
	}

	origins := []string{base}
	if strings.HasPrefix(base, "http://localhost") || strings.HasPrefix(base, "http://127.0.0.1") {
		// The Vite dev server is a different port from the API.
		origins = append(origins, "http://localhost:5173")
	}
	return origins
}

// configBaseURL reads the configured panel base URL.
func configBaseURL() string {
	return conf.Conf.System.BaseURL
}

func parseTrustedProxies(raw string) []string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}
	parts := strings.Split(trimmed, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if item := strings.TrimSpace(p); item != "" {
			out = append(out, item)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

const frontendDirEnvKey = "FRONTEND_DIR"

func resolveFrontendDir() string {
	if envDir := strings.TrimSpace(os.Getenv(frontendDirEnvKey)); envDir != "" {
		return envDir
	}
	if gin.Mode() != gin.ReleaseMode {
		return ""
	}
	exe, _ := os.Executable()
	return filepath.Join(filepath.Dir(exe), constants.FrontendDir)
}
