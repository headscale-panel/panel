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
			auth.POST("/connection/generate", middleware.PermissionMiddleware("headscale:machine:list"), connectionController.GenerateConnectionCommands)
			auth.POST("/connection/pre-auth-key", middleware.PermissionMiddleware("headscale:preauthkey:create"), connectionController.GeneratePreAuthKey)

			dockerService, _ := services.NewDockerService()
			dockerController := controllers.NewDockerController(dockerService)
			auth.GET("/docker/containers", middleware.PermissionMiddleware("docker:container:list"), dockerController.ListContainers)
			auth.GET("/docker/containers/:name", middleware.PermissionMiddleware("docker:container:get"), dockerController.GetContainer)
			auth.POST("/docker/containers/:name/start", middleware.PermissionMiddleware("docker:container:start"), dockerController.StartContainer)
			auth.POST("/docker/containers/:name/stop", middleware.PermissionMiddleware("docker:container:stop"), dockerController.StopContainer)
			auth.POST("/docker/containers/:name/restart", middleware.PermissionMiddleware("docker:container:restart"), dockerController.RestartContainer)
			auth.GET("/docker/containers/:name/logs", middleware.PermissionMiddleware("docker:container:logs"), dockerController.GetContainerLogs)
			auth.POST("/docker/deploy", middleware.PermissionMiddleware("docker:container:deploy"), dockerController.DeployContainer)

			headscaleConfigController := controllers.NewHeadscaleConfigController()
			auth.GET("/headscale/config", middleware.PermissionMiddleware("headscale:config:view"), headscaleConfigController.Get)
			auth.PUT("/headscale/config", middleware.PermissionMiddleware("headscale:config:update"), headscaleConfigController.Update)
			auth.POST("/headscale/config/preview", middleware.PermissionMiddleware("headscale:config:update"), headscaleConfigController.Preview)

			derpController := controllers.NewDERPController()
			auth.GET("/headscale/derp", middleware.PermissionMiddleware("headscale:derp:view"), derpController.Get)
			auth.PUT("/headscale/derp", middleware.PermissionMiddleware("headscale:derp:update"), derpController.Update)

			auth.POST("/headscale/derp/regions", middleware.PermissionMiddleware("headscale:derp:update"), derpController.AddRegion)
			auth.PUT("/headscale/derp/regions/:regionId", middleware.PermissionMiddleware("headscale:derp:update"), derpController.UpdateRegion)
			auth.DELETE("/headscale/derp/regions/:regionId", middleware.PermissionMiddleware("headscale:derp:update"), derpController.DeleteRegion)
			auth.POST("/headscale/derp/regions/:regionId/nodes", middleware.PermissionMiddleware("headscale:derp:update"), derpController.AddNode)
			auth.PUT("/headscale/derp/regions/:regionId/nodes/:nodeIndex", middleware.PermissionMiddleware("headscale:derp:update"), derpController.UpdateNode)
			auth.DELETE("/headscale/derp/regions/:regionId/nodes/:nodeIndex", middleware.PermissionMiddleware("headscale:derp:update"), derpController.DeleteNode)

			dnsController := controllers.NewDNSController()
			auth.GET("/dns/records", middleware.PermissionMiddleware("dns:record:list"), dnsController.List)
			auth.GET("/dns/records/:id", middleware.PermissionMiddleware("dns:record:get"), dnsController.Get)
			auth.POST("/dns/records", middleware.PermissionMiddleware("dns:record:create"), dnsController.Create)
			auth.PUT("/dns/records", middleware.PermissionMiddleware("dns:record:update"), dnsController.Update)
			auth.DELETE("/dns/records", middleware.PermissionMiddleware("dns:record:delete"), dnsController.Delete)
			auth.POST("/dns/sync", middleware.PermissionMiddleware("dns:sync"), dnsController.Sync)
			auth.POST("/dns/import", middleware.PermissionMiddleware("dns:import"), dnsController.Import)
			auth.GET("/dns/file", middleware.PermissionMiddleware("dns:file:get"), dnsController.GetFile)
			auth.GET("/docker/containers/:name/stats", middleware.PermissionMiddleware("docker:container:stats"), dockerController.GetContainerStats)
		}
	}

	return r
}
