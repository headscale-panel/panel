package router

import (
	"headscale-panel/router/controllers"
	"headscale-panel/router/middleware"
	"headscale-panel/router/services"
	"os"
	"path/filepath"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func InitRouter() *gin.Engine {
	r := gin.Default()

	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	config.AddAllowHeaders("Authorization")
	r.Use(cors.New(config))

	// Serve compiled frontend files (SPA with fallback to index.html)
	frontendDir := os.Getenv("FRONTEND_DIR")
	if frontendDir == "" {
		exe, _ := os.Executable()
		frontendDir = filepath.Join(filepath.Dir(exe), "frontend")
	}
	r.Use(middleware.FrontendMiddleware(frontendDir))

	oidcController := controllers.NewOIDCController()
	r.GET("/.well-known/openid-configuration", oidcController.Discovery)

	api := r.Group("/api/v1")
	{
		userController := controllers.NewUserController()
		api.POST("/register", userController.Register)
		api.POST("/login", userController.Login)

		setupController := controllers.NewSetupController()
		api.GET("/setup/status", setupController.GetStatus)
		api.POST("/setup/init", setupController.Initialize)
		api.POST("/setup/deploy", setupController.DeployContainer)

		authController := controllers.NewAuthController()
		api.GET("/auth/oidc-status", authController.OIDCStatus)
		api.GET("/auth/oidc/login", authController.OIDCLogin)
		api.GET("/auth/oidc/callback", authController.OIDCCallback)

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
			auth.GET("/resources", resourceController.List)
			auth.POST("/resources", resourceController.Create)
			auth.PUT("/resources", resourceController.Update)
			auth.DELETE("/resources", resourceController.Delete)

			dashboardController := controllers.NewDashboardController()
			auth.GET("/dashboard/overview", dashboardController.Overview)
			auth.GET("/dashboard/topology", dashboardController.Topology)

			systemController := controllers.NewSystemController()
			auth.GET("/system/users", systemController.ListUsers)
			auth.POST("/system/users", systemController.CreateUser)
			auth.PUT("/system/users", systemController.UpdateUser)
			auth.DELETE("/system/users", systemController.DeleteUser)

			auth.GET("/system/groups", systemController.ListGroups)
			auth.POST("/system/groups", systemController.CreateGroup)
			auth.PUT("/system/groups", systemController.UpdateGroup)
			auth.DELETE("/system/groups", systemController.DeleteGroup)
			auth.PUT("/system/groups/permissions", systemController.UpdateGroupPermissions)    // Replace all permissions
			auth.POST("/system/groups/permissions", systemController.AddGroupPermissions)      // Add permissions
			auth.DELETE("/system/groups/permissions", systemController.RemoveGroupPermissions) // Remove permissions
			auth.GET("/system/permissions", systemController.ListPermissions)

			oauthClientController := controllers.NewOauthClientController()
			auth.GET("/system/oauth-clients", oauthClientController.List)
			auth.POST("/system/oauth-clients", oauthClientController.Create)
			auth.PUT("/system/oauth-clients", oauthClientController.Update)
			auth.DELETE("/system/oauth-clients", oauthClientController.Delete)
			auth.POST("/system/oauth-clients/secret", oauthClientController.RegenerateSecret)

			headscaleController := controllers.NewHeadscaleController()
			auth.GET("/headscale/users", headscaleController.ListUsers)
			auth.POST("/headscale/users", headscaleController.CreateUser)
			auth.PUT("/headscale/users/rename", headscaleController.RenameUser)
			auth.DELETE("/headscale/users", headscaleController.DeleteUser)
			auth.GET("/headscale/machines", headscaleController.ListMachines)
			auth.GET("/headscale/machines/:id", headscaleController.GetMachine)
			auth.PUT("/headscale/machines/:id/rename", headscaleController.RenameMachine)
			auth.DELETE("/headscale/machines/:id", headscaleController.DeleteMachine)
			auth.POST("/headscale/machines/:id/expire", headscaleController.ExpireMachine)
			auth.PUT("/headscale/machines/:id/tags", headscaleController.SetMachineTags)
			auth.GET("/headscale/machines/:id/routes", headscaleController.GetMachineRoutes)
			auth.GET("/headscale/preauthkeys", headscaleController.GetPreAuthKeys)
			auth.POST("/headscale/preauthkeys", headscaleController.CreatePreAuthKey)
			auth.POST("/headscale/preauthkeys/expire", headscaleController.ExpirePreAuthKey)
			auth.GET("/headscale/acl/access", headscaleController.CheckAccess)

			aclController := controllers.NewACLController()
			auth.GET("/headscale/acl/policy", aclController.GetPolicy)
			auth.PUT("/headscale/acl/policy", aclController.UpdatePolicy)
			auth.POST("/headscale/acl/policy/raw", aclController.SetPolicyRaw)
			auth.GET("/headscale/acl/parsed-rules", aclController.GetParsedRules)
			auth.POST("/headscale/acl/sync-resources", aclController.SyncResourcesAsHosts)
			auth.POST("/headscale/acl/add-rule", aclController.AddRule)
			auth.PUT("/headscale/acl/update-rule", aclController.UpdateRuleByIndex)
			auth.DELETE("/headscale/acl/delete-rule", aclController.DeleteRuleByIndex)

			auth.POST("/headscale/acl/generate", aclController.Generate)
			auth.GET("/headscale/acl/policies", aclController.ListPolicies)
			auth.POST("/headscale/acl/apply", aclController.Apply)

			routeController := &controllers.RouteController{}
			auth.GET("/routes", routeController.ListRoutes)
			auth.POST("/routes/enable", routeController.EnableRoute)
			auth.POST("/routes/disable", routeController.DisableRoute)

			metricsController := &controllers.MetricsController{}
			auth.GET("/metrics/online-duration", metricsController.GetOnlineDuration)
			auth.GET("/metrics/online-duration-stats", metricsController.GetOnlineDurationStats)
			auth.GET("/metrics/device-status", metricsController.GetDeviceStatus)
			auth.GET("/metrics/device-status-history", metricsController.GetDeviceStatusHistory)
			auth.GET("/metrics/traffic", metricsController.GetTrafficStats)

			topologyController := &controllers.TopologyController{}
			auth.GET("/topology", topologyController.GetTopology)
			auth.GET("/topology/with-acl", topologyController.GetTopologyWithACL)
			auth.GET("/topology/acl-matrix", topologyController.GetACLMatrix)

			connectionController := &controllers.ConnectionController{}
			auth.POST("/connection/generate", connectionController.GenerateConnectionCommands)
			auth.POST("/connection/pre-auth-key", connectionController.GeneratePreAuthKey)

			dockerService, _ := services.NewDockerService()
			dockerController := controllers.NewDockerController(dockerService)
			auth.GET("/docker/containers", dockerController.ListContainers)
			auth.GET("/docker/containers/:name", dockerController.GetContainer)
			auth.POST("/docker/containers/:name/start", dockerController.StartContainer)
			auth.POST("/docker/containers/:name/stop", dockerController.StopContainer)
			auth.POST("/docker/containers/:name/restart", dockerController.RestartContainer)
			auth.GET("/docker/containers/:name/logs", dockerController.GetContainerLogs)
			auth.POST("/docker/deploy", dockerController.DeployContainer)

			headscaleConfigController := controllers.NewHeadscaleConfigController()
			auth.GET("/headscale/config", headscaleConfigController.Get)
			auth.PUT("/headscale/config", headscaleConfigController.Update)
			auth.POST("/headscale/config/preview", headscaleConfigController.Preview)

			derpController := controllers.NewDERPController()
			auth.GET("/headscale/derp", derpController.Get)
			auth.PUT("/headscale/derp", derpController.Update)

			auth.POST("/headscale/derp/regions", derpController.AddRegion)
			auth.PUT("/headscale/derp/regions/:regionId", derpController.UpdateRegion)
			auth.DELETE("/headscale/derp/regions/:regionId", derpController.DeleteRegion)
			auth.POST("/headscale/derp/regions/:regionId/nodes", derpController.AddNode)
			auth.PUT("/headscale/derp/regions/:regionId/nodes/:nodeIndex", derpController.UpdateNode)
			auth.DELETE("/headscale/derp/regions/:regionId/nodes/:nodeIndex", derpController.DeleteNode)

			dnsController := controllers.NewDNSController()
			auth.GET("/dns/records", dnsController.List)
			auth.GET("/dns/records/:id", dnsController.Get)
			auth.POST("/dns/records", dnsController.Create)
			auth.PUT("/dns/records", dnsController.Update)
			auth.DELETE("/dns/records", dnsController.Delete)
			auth.POST("/dns/sync", dnsController.Sync)
			auth.POST("/dns/import", dnsController.Import)
			auth.GET("/dns/file", dnsController.GetFile)
			auth.GET("/docker/containers/:name/stats", dockerController.GetContainerStats)
		}
	}

	return r
}
