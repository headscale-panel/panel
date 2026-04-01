package router

import (
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/constants"
	"headscale-panel/router/controllers"
	"headscale-panel/router/middleware"
	"headscale-panel/router/services"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

func InitRouter() *gin.Engine {
	r := gin.Default()

	corsConfig := cors.DefaultConfig()
	if conf.Conf.System.Release {
		corsConfig.AllowOrigins = buildAllowedOrigins()
	} else {
		corsConfig.AllowAllOrigins = true
	}
	corsConfig.AddAllowHeaders("Authorization", "X-Setup-Bootstrap-Token", "X-Setup-Init-Token", "X-Setup-Deploy-Token", "X-Setup-Token", "X-Bootstrap-Token")
	r.Use(cors.New(corsConfig))

	// Serve compiled frontend files (SPA with fallback to index.html)
	frontendDir := os.Getenv("FRONTEND_DIR")
	if frontendDir == "" {
		exe, _ := os.Executable()
		frontendDir = filepath.Join(filepath.Dir(exe), "frontend")
	}
	r.Use(middleware.FrontendMiddleware(frontendDir))

	oidcController := controllers.NewOIDCController()
	r.GET("/.well-known/openid-configuration", oidcController.Discovery)

	// Swagger UI (development only)
	if !conf.Conf.System.Release {
		r.GET("/panel/api/v1/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	}

	api := r.Group("/panel/api/v1")
	{
		authLimiter := middleware.NewRateLimiter(constants.AuthRateLimitCount, constants.AuthRateLimitWindow)
		userController := controllers.NewUserController()
		api.POST("/register", middleware.RateLimitMiddleware(authLimiter), userController.Register)
		api.POST("/login", middleware.RateLimitMiddleware(authLimiter), userController.Login)

		setupController := controllers.NewSetupController()
		api.GET("/setup/status", setupController.GetStatus)
		api.POST("/setup/preflight", setupController.Preflight)
		api.POST("/setup/init", setupController.Initialize)
		api.POST("/setup/connectivity-check", setupController.ConnectivityCheck)
		api.POST("/setup/connectivity-poll", setupController.ConnectivityPoll)

		authController := controllers.NewAuthController()
		api.GET("/auth/oidc-status", authController.OIDCStatus)
		api.GET("/auth/oidc/login", authController.OIDCLogin)
		api.GET("/auth/oidc/callback", authController.OIDCCallback)
		api.GET("/ws", services.HandleWebSocket)

		oidc := api.Group("/oidc")
		{
			oidc.GET("/authorize", oidcController.Authorize)
			oidc.POST("/token", oidcController.Token)
			oidc.GET("/jwks", oidcController.JWKS)
			oidc.GET("/userinfo", oidcController.UserInfo)
			oidc.POST("/userinfo", oidcController.UserInfo)
		}

		auth := api.Group("/")
		auth.Use(middleware.AuthMiddleware())
		{
			auth.GET("/user/info", userController.GetInfo)
			auth.POST("/user/totp/generate", userController.GenerateTOTP)
			auth.POST("/user/totp/enable", userController.EnableTOTP)

			resourceController := controllers.NewResourceController()
			auth.GET("/resources", middleware.PermissionMiddleware("resource:list"), resourceController.List)
			auth.POST("/resources", middleware.PermissionMiddleware("resource:create"), resourceController.Create)
			auth.PUT("/resources", middleware.PermissionMiddleware("resource:update"), resourceController.Update)
			auth.DELETE("/resources", middleware.PermissionMiddleware("resource:delete"), resourceController.Delete)

			dashboardController := controllers.NewDashboardController()
			auth.GET("/dashboard/overview", middleware.PermissionMiddleware("dashboard:view"), dashboardController.Overview)
			auth.GET("/dashboard/topology", middleware.PermissionMiddleware("dashboard:view"), dashboardController.Topology)

			systemController := controllers.NewSystemController()
			auth.GET("/system/users", middleware.PermissionMiddleware("system:user:list"), systemController.ListUsers)
			auth.POST("/system/users", middleware.PermissionMiddleware("system:user:create"), systemController.CreateUser)
			auth.PUT("/system/users", middleware.PermissionMiddleware("system:user:update"), systemController.UpdateUser)
			auth.DELETE("/system/users", middleware.PermissionMiddleware("system:user:delete"), systemController.DeleteUser)

			auth.GET("/system/groups", middleware.PermissionMiddleware("system:group:list"), systemController.ListGroups)
			auth.POST("/system/groups", middleware.PermissionMiddleware("system:group:create"), systemController.CreateGroup)
			auth.PUT("/system/groups", middleware.PermissionMiddleware("system:group:update"), systemController.UpdateGroup)
			auth.DELETE("/system/groups", middleware.PermissionMiddleware("system:group:delete"), systemController.DeleteGroup)
			auth.PUT("/system/groups/permissions", middleware.PermissionMiddleware("system:group:update"), systemController.UpdateGroupPermissions)    // Replace all permissions
			auth.POST("/system/groups/permissions", middleware.PermissionMiddleware("system:group:update"), systemController.AddGroupPermissions)      // Add permissions
			auth.DELETE("/system/groups/permissions", middleware.PermissionMiddleware("system:group:update"), systemController.RemoveGroupPermissions) // Remove permissions
			auth.GET("/system/permissions", middleware.PermissionMiddleware("system:permission:list"), systemController.ListPermissions)

			oauthClientController := controllers.NewOauthClientController()
			auth.GET("/system/oauth-clients", middleware.PermissionMiddleware("system:oauth_client:list"), oauthClientController.List)
			auth.POST("/system/oauth-clients", middleware.PermissionMiddleware("system:oauth_client:create"), oauthClientController.Create)
			auth.PUT("/system/oauth-clients", middleware.PermissionMiddleware("system:oauth_client:update"), oauthClientController.Update)
			auth.DELETE("/system/oauth-clients", middleware.PermissionMiddleware("system:oauth_client:delete"), oauthClientController.Delete)
			auth.POST("/system/oauth-clients/secret", middleware.PermissionMiddleware("system:oauth_client:secret"), oauthClientController.RegenerateSecret)

			headscaleController := controllers.NewHeadscaleController()
			auth.GET("/headscale/users", middleware.PermissionMiddleware("headscale:user:list"), headscaleController.ListUsers)
			auth.POST("/headscale/users", middleware.PermissionMiddleware("headscale:user:create"), headscaleController.CreateUser)
			auth.PUT("/headscale/users/rename", middleware.PermissionMiddleware("headscale:user:update"), headscaleController.RenameUser)
			auth.DELETE("/headscale/users", middleware.PermissionMiddleware("headscale:user:delete"), headscaleController.DeleteUser)
			auth.GET("/headscale/machines", middleware.PermissionMiddleware("headscale:machine:list"), headscaleController.ListMachines)
			auth.GET("/headscale/machines/:id", middleware.PermissionMiddleware("headscale:machine:get"), headscaleController.GetMachine)
			auth.PUT("/headscale/machines/:id/rename", middleware.PermissionMiddleware("headscale:machine:update"), headscaleController.RenameMachine)
			auth.DELETE("/headscale/machines/:id", middleware.PermissionMiddleware("headscale:machine:delete"), headscaleController.DeleteMachine)
			auth.POST("/headscale/machines/:id/expire", middleware.PermissionMiddleware("headscale:machine:expire"), headscaleController.ExpireMachine)
			auth.PUT("/headscale/machines/:id/tags", middleware.PermissionMiddleware("headscale:machine:tags"), headscaleController.SetMachineTags)
			auth.GET("/headscale/machines/:id/routes", middleware.PermissionMiddleware("headscale:route:list"), headscaleController.GetMachineRoutes)
			auth.POST("/headscale/machines/register", middleware.PermissionMiddleware("headscale:machine:create"), headscaleController.RegisterNode)
			auth.GET("/headscale/preauthkeys", middleware.PermissionMiddleware("headscale:preauthkey:list"), headscaleController.GetPreAuthKeys)
			auth.POST("/headscale/preauthkeys", middleware.PermissionMiddleware("headscale:preauthkey:create"), headscaleController.CreatePreAuthKey)
			auth.POST("/headscale/preauthkeys/expire", middleware.PermissionMiddleware("headscale:preauthkey:expire"), headscaleController.ExpirePreAuthKey)
			auth.GET("/headscale/acl/access", middleware.PermissionMiddleware("headscale:acl:access"), headscaleController.CheckAccess)

			aclController := controllers.NewACLController()
			auth.GET("/headscale/acl/policy", middleware.PermissionMiddleware("headscale:acl:view"), aclController.GetPolicy)
			auth.PUT("/headscale/acl/policy", middleware.PermissionMiddleware("headscale:acl:update"), aclController.UpdatePolicy)
			auth.POST("/headscale/acl/policy/raw", middleware.PermissionMiddleware("headscale:acl:update"), aclController.SetPolicyRaw)
			auth.GET("/headscale/acl/parsed-rules", middleware.PermissionMiddleware("headscale:acl:view"), aclController.GetParsedRules)
			auth.POST("/headscale/acl/sync-resources", middleware.PermissionMiddleware("headscale:acl:sync"), aclController.SyncResourcesAsHosts)
			auth.POST("/headscale/acl/add-rule", middleware.PermissionMiddleware("headscale:acl:update"), aclController.AddRule)
			auth.PUT("/headscale/acl/update-rule", middleware.PermissionMiddleware("headscale:acl:update"), aclController.UpdateRuleByIndex)
			auth.DELETE("/headscale/acl/delete-rule", middleware.PermissionMiddleware("headscale:acl:update"), aclController.DeleteRuleByIndex)

			auth.POST("/headscale/acl/generate", middleware.PermissionMiddleware("headscale:acl:generate"), aclController.Generate)
			auth.GET("/headscale/acl/policies", middleware.PermissionMiddleware("headscale:acl:history:list"), aclController.ListPolicies)
			auth.POST("/headscale/acl/apply", middleware.PermissionMiddleware("headscale:acl:apply"), aclController.Apply)

			routeController := &controllers.RouteController{}
			auth.GET("/routes", middleware.PermissionMiddleware("headscale:route:list"), routeController.ListRoutes)
			auth.POST("/routes/enable", middleware.PermissionMiddleware("headscale:route:enable"), routeController.EnableRoute)
			auth.POST("/routes/disable", middleware.PermissionMiddleware("headscale:route:disable"), routeController.DisableRoute)

			metricsController := &controllers.MetricsController{}
			auth.GET("/metrics/online-duration", middleware.PermissionMiddleware("metrics:online_duration:view"), metricsController.GetOnlineDuration)
			auth.GET("/metrics/online-duration-stats", middleware.PermissionMiddleware("metrics:online_duration_stats:view"), metricsController.GetOnlineDurationStats)
			auth.GET("/metrics/device-status", middleware.PermissionMiddleware("metrics:device_status:view"), metricsController.GetDeviceStatus)
			auth.GET("/metrics/device-status-history", middleware.PermissionMiddleware("metrics:device_status_history:view"), metricsController.GetDeviceStatusHistory)
			auth.GET("/metrics/traffic", middleware.PermissionMiddleware("metrics:traffic:view"), metricsController.GetTrafficStats)
			auth.GET("/metrics/influxdb-status", middleware.PermissionMiddleware("metrics:influxdb:view"), metricsController.GetInfluxDBStatus)

			topologyController := &controllers.TopologyController{}
			auth.GET("/topology", middleware.PermissionMiddleware("topology:view"), topologyController.GetTopology)
			auth.GET("/topology/with-acl", middleware.PermissionMiddleware("topology:with_acl:view"), topologyController.GetTopologyWithACL)
			auth.GET("/topology/acl-matrix", middleware.PermissionMiddleware("topology:acl_matrix:view"), topologyController.GetACLMatrix)

			connectionController := &controllers.ConnectionController{}
			auth.POST("/connection/generate", middleware.PermissionMiddleware("headscale:machine:list"), connectionController.GenerateConnectionCommands)
			auth.POST("/connection/pre-auth-key", middleware.PermissionMiddleware("headscale:preauthkey:create"), connectionController.GeneratePreAuthKey)
			auth.POST("/connection/ssh-command", middleware.PermissionMiddleware("headscale:machine:list"), connectionController.GenerateSSHCommand)

			panelSettingsController := controllers.NewPanelSettingsController()
			auth.GET("/panel/connection", middleware.PermissionMiddleware("headscale:config:view"), panelSettingsController.GetConnection)
			auth.PUT("/panel/connection", middleware.PermissionMiddleware("headscale:config:update"), panelSettingsController.SaveConnection)
			auth.POST("/panel/sync", middleware.PermissionMiddleware("headscale:acl:sync"), panelSettingsController.SyncData)
			auth.GET("/panel/builtin-oidc", middleware.PermissionMiddleware("headscale:config:view"), panelSettingsController.GetBuiltinOIDC)
			auth.POST("/panel/builtin-oidc", middleware.PermissionMiddleware("headscale:config:update"), panelSettingsController.EnableBuiltinOIDC)
			auth.GET("/panel/oidc-settings", middleware.PermissionMiddleware("headscale:config:view"), panelSettingsController.GetOIDCSettings)
			auth.PUT("/panel/oidc-settings", middleware.PermissionMiddleware("headscale:config:update"), panelSettingsController.SaveOIDCSettings)
			auth.GET("/panel/oidc-status", middleware.PermissionMiddleware("headscale:config:view"), panelSettingsController.GetOIDCStatus)

			headscaleConfigController := controllers.NewHeadscaleConfigController()
			auth.GET("/headscale/config", middleware.PermissionMiddleware("headscale:config:view"), headscaleConfigController.Get)
			auth.POST("/headscale/config/preview", middleware.PermissionMiddleware("headscale:config:view"), headscaleConfigController.Preview)

			derpController := controllers.NewDERPController()
			auth.GET("/headscale/derp", middleware.PermissionMiddleware("headscale:derp:view"), derpController.Get)

			dnsController := controllers.NewDNSController()
			auth.GET("/dns/records", middleware.PermissionMiddleware("dns:record:list"), dnsController.List)
			auth.GET("/dns/records/:id", middleware.PermissionMiddleware("dns:record:get"), dnsController.Get)
			auth.POST("/dns/records", middleware.PermissionMiddleware("dns:record:create"), dnsController.Create)
			auth.PUT("/dns/records", middleware.PermissionMiddleware("dns:record:update"), dnsController.Update)
			auth.DELETE("/dns/records", middleware.PermissionMiddleware("dns:record:delete"), dnsController.Delete)
			auth.POST("/dns/sync", middleware.PermissionMiddleware("dns:sync"), dnsController.Sync)
			auth.POST("/dns/import", middleware.PermissionMiddleware("dns:import"), dnsController.Import)
			auth.GET("/dns/file", middleware.PermissionMiddleware("dns:file:get"), dnsController.GetFile)
		}
	}

	return r
}

func buildAllowedOrigins() []string {
	origins := make(map[string]struct{})

	baseURL := strings.TrimSpace(conf.Conf.System.BaseURL)
	if baseURL != "" {
		if parsed, err := url.Parse(baseURL); err == nil && parsed.Scheme != "" && parsed.Host != "" {
			origins[parsed.Scheme+"://"+parsed.Host] = struct{}{}
		}
	}

	// Common local development origins
	origins["http://localhost:5173"] = struct{}{}
	origins["http://localhost:3000"] = struct{}{}
	origins["http://127.0.0.1:5173"] = struct{}{}
	origins["http://127.0.0.1:3000"] = struct{}{}

	result := make([]string, 0, len(origins))
	for origin := range origins {
		result = append(result, origin)
	}
	return result
}
