package controllers

import (
	"context"
	"crypto/subtle"
	"fmt"
	"headscale-panel/model"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	dockercontainer "github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"github.com/gin-gonic/gin"
)

type SetupController struct{}

func NewSetupController() *SetupController {
	return &SetupController{}
}

// GetStatus checks if the system has been initialized (any users exist).
func (s *SetupController) GetStatus(ctx *gin.Context) {
	state, err := services.SetupStateService.GetState()
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	var count int64
	if err := model.DB.Model(&model.User{}).Count(&count).Error; err != nil {
		serializer.Fail(ctx, serializer.ErrDatabase.WithError(err))
		return
	}

	now := time.Now()
	windowOpen := services.SetupStateService.IsWindowOpen(state, now)
	initialized := state.State == model.SetupStateInitialized
	bootstrapAuthorized := isSetupBootstrapAuthorized(ctx)

	resp := gin.H{
		"initialized":           initialized,
		"setup_state":           state.State,
		"user_count":            count,
		"setup_window_open":     windowOpen,
		"setup_window_deadline": "",
		"bootstrap_configured":  isSetupBootstrapConfigured(),
	}
	if state.WindowDeadline != nil {
		resp["setup_window_deadline"] = state.WindowDeadline.UTC().Format(time.RFC3339)
	}

	if windowOpen && bootstrapAuthorized {
		initToken, initTokenExpiresAt, err := services.SetupGuardService.IssueInitToken(true, ctx.ClientIP(), ctx.GetHeader("User-Agent"))
		if err == nil {
			resp["init_token"] = initToken
			resp["init_token_expires_at"] = initTokenExpiresAt.UTC().Format(time.RFC3339)
		}
		deployToken, deployTokenExpiresAt, err := services.SetupGuardService.IssueDeployToken(true, ctx.ClientIP(), ctx.GetHeader("User-Agent"))
		if err == nil {
			resp["deploy_token"] = deployToken
			resp["deploy_token_expires_at"] = deployTokenExpiresAt.UTC().Format(time.RFC3339)
		}
	}

	serializer.Success(ctx, resp)
}

func (s *SetupController) Preflight(ctx *gin.Context) {
	var req SetupPreflightRequest
	if ctx.Request.ContentLength > 0 {
		if err := ctx.ShouldBindJSON(&req); err != nil {
			serializer.Fail(ctx, serializer.ErrBind)
			return
		}
	}

	existingFiles := detectSetupConfigFiles()

	var healthSummary setupHealthSummary
	var deploymentSummary gin.H
	dockerPassed := false
	dockerDetail := ""

	if req.SkipDocker {
		// When using existing config, skip Docker detection entirely
		healthSummary = setupHealthSummary{
			DockerAvailable: false,
			DockerDetail:    "skipped (using existing config)",
		}
		deploymentSummary = gin.H{
			"deployed":            len(existingFiles) > 0,
			"containers":          []setupContainerStatus{},
			"headscale_detected":  false,
			"derp_detected":       false,
			"nginx_detected":      false,
			"container_count":     0,
			"existing_file_count": len(existingFiles),
		}
		dockerPassed = true // Don't block on Docker when using existing config
		dockerDetail = "skipped (using existing config)"
	} else {
		healthSummary, deploymentSummary = collectRuntimeSummary(ctx.Request.Context(), existingFiles)
		dockerPassed = healthSummary.DockerAvailable
		dockerDetail = healthSummary.DockerDetail
	}

	portChecks := make([]setupPortCheck, 0, 7)
	dnsChecks := make([]setupDNSCheck, 0, 3)

	if !req.SkipNetworkChecks {
		backendPort, err := normalizePort(req.BackendPort, deriveBackendPort())
		if err != nil {
			serializer.Fail(ctx, err)
			return
		}
		headscalePort, err := normalizePort(req.HeadscalePort, 28080)
		if err != nil {
			serializer.Fail(ctx, err)
			return
		}
		headscaleGRPCPort, err := normalizePort(req.HeadscaleGRPCPort, 28081)
		if err != nil {
			serializer.Fail(ctx, err)
			return
		}
		derpPort, err := normalizePort(req.DerpPort, 26060)
		if err != nil {
			serializer.Fail(ctx, err)
			return
		}
		derpStunPort, err := normalizePort(req.DerpStunPort, 33478)
		if err != nil {
			serializer.Fail(ctx, err)
			return
		}

		portChecks = []setupPortCheck{
			checkTCPPort("backend", backendPort),
			checkTCPPort("headscale_http", headscalePort),
			checkTCPPort("headscale_grpc", headscaleGRPCPort),
			checkTCPPort("derp_http", derpPort),
			checkUDPPort("derp_stun", derpStunPort),
			checkTCPPort("reverse_proxy_http", 80),
			checkTCPPort("reverse_proxy_https", 443),
		}

		if host := strings.TrimSpace(req.PanelDomain); host != "" {
			if normalized, validateErr := validateProxyHost(host); validateErr == nil {
				dnsChecks = append(dnsChecks, checkDNSHost(ctx.Request.Context(), normalized))
			}
		}
		if host := strings.TrimSpace(req.HeadscaleHost); host != "" {
			if normalized, validateErr := validateProxyHost(host); validateErr == nil {
				dnsChecks = append(dnsChecks, checkDNSHost(ctx.Request.Context(), normalized))
			}
		}
		if host := strings.TrimSpace(req.DerpHost); host != "" {
			if normalized, validateErr := validateProxyHost(host); validateErr == nil {
				dnsChecks = append(dnsChecks, checkDNSHost(ctx.Request.Context(), normalized))
			}
		}
	}

	configHints := readSetupConfigHints(existingFiles)
	deployed, _ := deploymentSummary["deployed"].(bool)
	systemState := "READY_TO_SETUP"
	if deployed {
		systemState = "SYSTEM_ONLINE"
	}

	serializer.Success(ctx, gin.H{
		"checks": []setupCheck{
			{
				Name:   "docker",
				Passed: dockerPassed,
				Detail: dockerDetail,
			},
			{
				Name:   "config_files",
				Passed: true,
				Detail: fmt.Sprintf("detected %d existing setup files", len(existingFiles)),
			},
		},
		"docker":                     gin.H{"ok": dockerPassed, "detail": dockerDetail},
		"health":                     healthSummary,
		"deployment":                 deploymentSummary,
		"system_state":               systemState,
		"ports":                      portChecks,
		"dns":                        dnsChecks,
		"existing_files":             existingFiles,
		"has_existing_config":        len(existingFiles) > 0,
		"maintenance_mode_suggested": len(existingFiles) > 0,
		"config_hints":               configHints,
		"skip_network_checks":        req.SkipNetworkChecks,
		"bootstrap_configured":       isSetupBootstrapConfigured(),
	})
}

// ConnectivityCheck tests Headscale gRPC connectivity without needing Docker.
// Used when profile=existing to verify the existing deployment is reachable.
func (s *SetupController) ConnectivityCheck(ctx *gin.Context) {
	var req struct {
		HeadscaleGRPCAddr string `json:"headscale_grpc_addr"`
		HeadscaleHTTPAddr string `json:"headscale_http_addr"`
		APIKey            string `json:"api_key"`
	}
	if ctx.Request.ContentLength > 0 {
		if err := ctx.ShouldBindJSON(&req); err != nil {
			serializer.Fail(ctx, serializer.ErrBind)
			return
		}
	}

	results := make([]gin.H, 0, 3)

	// Check Headscale HTTP connectivity
	if addr := strings.TrimSpace(req.HeadscaleHTTPAddr); addr != "" {
		if !strings.Contains(addr, ":") {
			addr = addr + ":28080"
		}
		ok, detail := checkTCPConnect(ctx.Request.Context(), addr)
		results = append(results, gin.H{
			"name":      "headscale_http",
			"address":   addr,
			"reachable": ok,
			"detail":    detail,
		})
	}

	// Check Headscale gRPC connectivity
	if addr := strings.TrimSpace(req.HeadscaleGRPCAddr); addr != "" {
		if !strings.Contains(addr, ":") {
			addr = addr + ":28081"
		}
		ok, detail := checkTCPConnect(ctx.Request.Context(), addr)
		results = append(results, gin.H{
			"name":      "headscale_grpc",
			"address":   addr,
			"reachable": ok,
			"detail":    detail,
		})
	}

	allReachable := true
	for _, r := range results {
		if !r["reachable"].(bool) {
			allReachable = false
			break
		}
	}

	serializer.Success(ctx, gin.H{
		"checks":        results,
		"all_reachable": allReachable,
	})
}

// GenerateComposeFromConfig generates a docker-compose.yml content from user-provided configuration.
// This is used when Docker is not available so users can copy the file and deploy manually.
func (s *SetupController) GenerateComposeFromConfig(ctx *gin.Context) {
	var req struct {
		HeadscaleContainerName string `json:"headscale_container_name"`
		HeadscaleHTTPPort      string `json:"headscale_http_port"`
		HeadscaleGRPCPort      string `json:"headscale_grpc_port"`
		HeadscaleConfigPath    string `json:"headscale_config_path"`
		HeadscaleDataPath      string `json:"headscale_data_path"`
		HeadscaleTimezone      string `json:"headscale_timezone"`
		HeadscaleDBDriver      string `json:"headscale_db_driver"`
		HeadscaleDBURL         string `json:"headscale_db_url"`
		HeadscaleAPIKey        string `json:"headscale_api_key"`
		DerpEnabled            bool   `json:"derp_enabled"`
		DerpContainerName      string `json:"derp_container_name"`
		DerpDomain             string `json:"derp_domain"`
		DerpPort               string `json:"derp_port"`
		StunPort               string `json:"stun_port"`
		DerpRegionCode         string `json:"derp_region_code"`
		DerpCertMode           string `json:"derp_cert_mode"`
		DerpVerifyClients      bool   `json:"derp_verify_clients"`
		ProxyMode              string `json:"proxy_mode"`
		NginxContainerName     string `json:"nginx_container_name"`
		PanelDomain            string `json:"panel_domain"`
		HeadscaleHost          string `json:"headscale_host"`
		DerpHost               string `json:"derp_host"`
		DeployCertbot          bool   `json:"deploy_certbot"`
		CertbotContainerName   string `json:"certbot_container_name"`
		CertbotEmail           string `json:"certbot_email"`
		WriteFile              *bool  `json:"write_file"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	// Set defaults
	if req.HeadscaleContainerName == "" {
		req.HeadscaleContainerName = "headscale-server"
	}
	if req.HeadscaleHTTPPort == "" {
		req.HeadscaleHTTPPort = "28080"
	}
	if req.HeadscaleGRPCPort == "" {
		req.HeadscaleGRPCPort = "28081"
	}
	if req.HeadscaleConfigPath == "" {
		req.HeadscaleConfigPath = "./headscale/config"
	}
	if req.HeadscaleDataPath == "" {
		req.HeadscaleDataPath = "./headscale/data"
	}
	if req.HeadscaleTimezone == "" {
		req.HeadscaleTimezone = "Asia/Shanghai"
	}
	if req.HeadscaleDBDriver == "" {
		req.HeadscaleDBDriver = "sqlite"
	}
	if req.HeadscaleDBURL == "" {
		req.HeadscaleDBURL = "./headscale/data/headscale.db"
	}

	compose := renderComposeFromConfig(req.HeadscaleContainerName, req.HeadscaleHTTPPort, req.HeadscaleGRPCPort,
		req.HeadscaleConfigPath, req.HeadscaleDataPath, req.HeadscaleTimezone,
		req.HeadscaleDBDriver, req.HeadscaleDBURL, req.HeadscaleAPIKey,
		req.DerpEnabled, req.DerpContainerName, req.DerpDomain, req.DerpPort, req.StunPort,
		req.DerpRegionCode, req.DerpCertMode, req.DerpVerifyClients,
		req.ProxyMode, req.NginxContainerName, req.PanelDomain, req.HeadscaleHost, req.DerpHost,
		req.DeployCertbot, req.CertbotContainerName, req.CertbotEmail, req.HeadscaleTimezone)

	writeFile := false
	if req.WriteFile != nil {
		writeFile = *req.WriteFile
	}

	configPath := filepath.Clean("./deploy/docker-compose.generated.yaml")
	if writeFile {
		if err := os.MkdirAll(filepath.Dir(configPath), 0755); err != nil {
			serializer.Fail(ctx, serializer.NewError(serializer.CodeFileSystemError, "failed to create compose directory", err))
			return
		}
		if err := os.WriteFile(configPath, []byte(compose), 0644); err != nil {
			serializer.Fail(ctx, serializer.NewError(serializer.CodeFileSystemError, "failed to write compose file", err))
			return
		}
	}

	serializer.Success(ctx, gin.H{
		"compose_content": compose,
		"compose_path":    configPath,
		"written":         writeFile,
	})
}

// InitializeRequest is the payload for the first-time setup.
type InitializeRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	Email    string `json:"email"`
}

type ReverseProxyConfigRequest struct {
	PanelDomain   string `json:"panel_domain" binding:"required"`
	HeadscaleHost string `json:"headscale_host" binding:"required"`
	DerpHost      string `json:"derp_host"`
	BackendPort   string `json:"backend_port"`
	HeadscalePort string `json:"headscale_port" binding:"required"`
	DerpPort      string `json:"derp_port"`
	DerpStunPort  string `json:"derp_stun_port"`
	EnableCertbot bool   `json:"enable_certbot"`
	WriteFile     *bool  `json:"write_file"`
}

type SetupPreflightRequest struct {
	PanelDomain       string `json:"panel_domain"`
	HeadscaleHost     string `json:"headscale_host"`
	DerpHost          string `json:"derp_host"`
	BackendPort       string `json:"backend_port"`
	HeadscalePort     string `json:"headscale_port"`
	HeadscaleGRPCPort string `json:"headscale_grpc_port"`
	DerpPort          string `json:"derp_port"`
	DerpStunPort      string `json:"derp_stun_port"`
	SkipNetworkChecks bool   `json:"skip_network_checks"`
	SkipDocker        bool   `json:"skip_docker"`
}

type ComposeFileRequest struct {
	Content   string `json:"content" binding:"required"`
	WriteFile *bool  `json:"write_file"`
}

type setupPortCheck struct {
	Name      string `json:"name"`
	Port      int    `json:"port"`
	Protocol  string `json:"protocol"`
	Available bool   `json:"available"`
	Detail    string `json:"detail"`
}

type setupDNSCheck struct {
	Host     string   `json:"host"`
	Resolved bool     `json:"resolved"`
	Records  []string `json:"records,omitempty"`
	Detail   string   `json:"detail"`
}

type setupCheck struct {
	Name   string `json:"name"`
	Passed bool   `json:"passed"`
	Detail string `json:"detail"`
}

type setupContainerStatus struct {
	Name   string   `json:"name"`
	Image  string   `json:"image"`
	State  string   `json:"state"`
	Status string   `json:"status"`
	Ports  []string `json:"ports"`
}

type setupHealthSummary struct {
	DockerAvailable   bool   `json:"docker_available"`
	DockerDetail      string `json:"docker_detail"`
	DockerVersion     string `json:"docker_version"`
	CPUCores          int    `json:"cpu_cores"`
	MemoryTotalBytes  int64  `json:"memory_total_bytes"`
	MemoryTotalHuman  string `json:"memory_total_human"`
	StorageTotalBytes int64  `json:"storage_total_bytes"`
	StorageFreeBytes  int64  `json:"storage_free_bytes"`
	StorageTotalHuman string `json:"storage_total_human"`
	StorageFreeHuman  string `json:"storage_free_human"`
}

// Initialize creates the first admin user if no users exist yet.
func (s *SetupController) Initialize(ctx *gin.Context) {
	if err := requireSetupBootstrap(ctx); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	state, err := services.SetupStateService.RequireSetupWindow()
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	setupInitToken := ctx.GetHeader("X-Setup-Init-Token")
	if setupInitToken == "" {
		setupInitToken = ctx.GetHeader("X-Setup-Token")
	}
	if err := services.SetupGuardService.ValidateAndConsumeInitToken(
		services.SetupStateService.IsWindowOpen(state, time.Now()),
		setupInitToken,
		ctx.ClientIP(),
		ctx.GetHeader("User-Agent"),
	); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	var count int64
	if err := model.DB.Model(&model.User{}).Count(&count).Error; err != nil {
		serializer.Fail(ctx, serializer.ErrDatabase.WithError(err))
		return
	}
	if count > 0 {
		serializer.Fail(ctx, serializer.NewError(serializer.CodeConflict, "system already initialized", nil))
		return
	}

	var req InitializeRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	var adminGroup model.Group
	if err := model.DB.Where("name = ?", "Admin").First(&adminGroup).Error; err != nil {
		serializer.Fail(ctx, serializer.NewError(serializer.CodeInternalError, "admin group not found, please check database initialization", err))
		return
	}

	user := model.User{
		Username:      req.Username,
		Password:      req.Password,
		Email:         req.Email,
		GroupID:       adminGroup.ID,
		HeadscaleName: req.Username,
		Provider:      "local",
	}

	if err := model.DB.Create(&user).Error; err != nil {
		serializer.Fail(ctx, serializer.ErrDatabase)
		return
	}

	if err := services.SetupStateService.MarkInitialized(); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	services.SetupGuardService.RevokeAllTokens()

	serializer.Success(ctx, gin.H{
		"message": "Admin user created successfully",
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"email":    user.Email,
		},
	})
}

func (s *SetupController) GenerateReverseProxyConfig(ctx *gin.Context) {
	if err := requireSetupBootstrap(ctx); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	state, err := services.SetupStateService.RequireSetupWindow()
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	if err := validateSetupDeployToken(ctx, state); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	var req ReverseProxyConfigRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	panelDomain, err := validateProxyHost(req.PanelDomain)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	headscaleHost, err := validateProxyHost(req.HeadscaleHost)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	derpHost := strings.TrimSpace(req.DerpHost)
	if derpHost != "" {
		derpHost, err = validateProxyHost(derpHost)
		if err != nil {
			serializer.Fail(ctx, err)
			return
		}
	}

	backendPort, err := normalizePort(req.BackendPort, deriveBackendPort())
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	headscalePort, err := normalizePort(req.HeadscalePort, 28080)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	derpPort := 0
	if strings.TrimSpace(req.DerpPort) != "" {
		derpPort, err = normalizePort(req.DerpPort, 26060)
		if err != nil {
			serializer.Fail(ctx, err)
			return
		}
	}
	derpStunPort := 0
	if strings.TrimSpace(req.DerpStunPort) != "" {
		derpStunPort, err = normalizePort(req.DerpStunPort, 33478)
		if err != nil {
			serializer.Fail(ctx, err)
			return
		}
	}

	nginxConfig := renderNginxConfig(panelDomain, headscaleHost, derpHost, backendPort, headscalePort, derpPort, req.EnableCertbot)
	configPath := filepath.Clean("./deploy/nginx/conf.d/headscale-panel.setup.conf")

	writeFile := true
	if req.WriteFile != nil {
		writeFile = *req.WriteFile
	}
	if writeFile {
		if err := os.MkdirAll(filepath.Dir(configPath), 0755); err != nil {
			serializer.Fail(ctx, serializer.NewError(serializer.CodeFileSystemError, "failed to create nginx config directory", err))
			return
		}
		if err := os.MkdirAll(filepath.Clean("./deploy/nginx/certbot/www"), 0755); err != nil {
			serializer.Fail(ctx, serializer.NewError(serializer.CodeFileSystemError, "failed to create certbot webroot directory", err))
			return
		}
		if err := os.MkdirAll(filepath.Clean("./deploy/nginx/certbot/conf"), 0755); err != nil {
			serializer.Fail(ctx, serializer.NewError(serializer.CodeFileSystemError, "failed to create certbot cert directory", err))
			return
		}
		if err := os.WriteFile(configPath, []byte(nginxConfig), 0644); err != nil {
			serializer.Fail(ctx, serializer.NewError(serializer.CodeFileSystemError, "failed to write nginx config file", err))
			return
		}
	}

	notes := []string{
		fmt.Sprintf("panel: reverse proxy %s -> 127.0.0.1:%d", panelDomain, backendPort),
		fmt.Sprintf("headscale: reverse proxy %s -> 127.0.0.1:%d", headscaleHost, headscalePort),
	}
	if derpHost != "" && derpPort > 0 {
		notes = append(notes, fmt.Sprintf("derp http: reverse proxy %s -> 127.0.0.1:%d", derpHost, derpPort))
	}
	if derpStunPort > 0 {
		notes = append(notes, fmt.Sprintf("derp stun: expose UDP %d directly (nginx stream/L4 proxy required)", derpStunPort))
	}
	if req.EnableCertbot {
		notes = append(notes, "certbot enabled: run initial certificate issuance after nginx is up")
	} else {
		notes = append(notes, "certbot skipped: provide TLS certificate manually or add certbot later")
	}

	serializer.Success(ctx, gin.H{
		"config_path":   configPath,
		"nginx_config":  nginxConfig,
		"written":       writeFile,
		"proxy_targets": notes,
	})
}

func (s *SetupController) GenerateComposeFile(ctx *gin.Context) {
	if err := requireSetupBootstrap(ctx); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	state, err := services.SetupStateService.RequireSetupWindow()
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	if err := validateSetupDeployToken(ctx, state); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	var req ComposeFileRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	content := strings.TrimSpace(req.Content)
	if content == "" {
		serializer.Fail(ctx, serializer.NewError(serializer.CodeParamErr, "compose content is required", nil))
		return
	}
	if len(content) > 1<<20 {
		serializer.Fail(ctx, serializer.NewError(serializer.CodeParamErr, "compose content too large", nil))
		return
	}
	if !strings.Contains(content, "services:") {
		serializer.Fail(ctx, serializer.NewError(serializer.CodeParamErr, "invalid compose content", nil))
		return
	}

	writeFile := true
	if req.WriteFile != nil {
		writeFile = *req.WriteFile
	}

	configPath := filepath.Clean("./deploy/docker-compose.setup.yaml")
	if writeFile {
		if err := os.MkdirAll(filepath.Dir(configPath), 0755); err != nil {
			serializer.Fail(ctx, serializer.NewError(serializer.CodeFileSystemError, "failed to create compose directory", err))
			return
		}
		if err := os.WriteFile(configPath, []byte(content), 0644); err != nil {
			serializer.Fail(ctx, serializer.NewError(serializer.CodeFileSystemError, "failed to write compose file", err))
			return
		}
	}

	serializer.Success(ctx, gin.H{
		"compose_path": configPath,
		"written":      writeFile,
	})
}

// DeployContainer deploys a Docker container during the setup wizard.
// SECURITY: Only available when the system has NOT been initialized yet (no users exist).
func (s *SetupController) DeployContainer(ctx *gin.Context) {
	if err := requireSetupBootstrap(ctx); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	state, err := services.SetupStateService.RequireSetupWindow()
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	var count int64
	if err := model.DB.Model(&model.User{}).Count(&count).Error; err != nil {
		serializer.Fail(ctx, serializer.ErrDatabase.WithError(err))
		return
	}
	if count > 0 {
		serializer.Fail(ctx, serializer.NewError(serializer.CodeNoPermissionErr, "system already initialized, use authenticated docker API instead", nil))
		return
	}

	if err := validateSetupDeployToken(ctx, state); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	var req services.DeployRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	// Restrict images to allowed list during setup
	allowedImages := map[string]bool{
		"headscale/headscale:stable": true,
		"headscale/headscale:latest": true,
		"fredliang/derper":           true,
		"nginx:1.27-alpine":          true,
		"nginx:stable-alpine":        true,
		"certbot/certbot:latest":     true,
	}
	if !allowedImages[req.Image] {
		serializer.Fail(ctx, serializer.NewError(400, "image not allowed during setup: "+req.Image, nil))
		return
	}

	dockerService, err := services.NewDockerService()
	if err != nil {
		serializer.Fail(ctx, serializer.NewError(serializer.CodeInternalError, "Docker service not available", err))
		return
	}

	progress, err := dockerService.DeployContainerUnsafeWithContext(ctx.Request.Context(), req)
	if err != nil {
		serializer.Fail(ctx, serializer.NewError(serializer.CodeInternalError, "container deployment failed", err))
		return
	}

	serializer.Success(ctx, gin.H{
		"progress": progress,
	})
}

func requireSetupBootstrap(ctx *gin.Context) error {
	expected := strings.TrimSpace(conf.Conf.System.SetupBootstrapToken)
	if expected == "" {
		return nil
	}

	provided := strings.TrimSpace(readSetupBootstrapCredential(ctx))
	if provided == "" {
		return serializer.NewError(serializer.CodeNoPermissionErr, "missing setup bootstrap credential", nil)
	}

	if subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
		return serializer.NewError(serializer.CodeNoPermissionErr, "invalid setup bootstrap credential", nil)
	}

	return nil
}

func isSetupBootstrapAuthorized(ctx *gin.Context) bool {
	expected := strings.TrimSpace(conf.Conf.System.SetupBootstrapToken)
	if expected == "" {
		return true
	}

	provided := strings.TrimSpace(readSetupBootstrapCredential(ctx))
	if provided == "" {
		return false
	}

	return subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) == 1
}

func isSetupBootstrapConfigured() bool {
	return strings.TrimSpace(conf.Conf.System.SetupBootstrapToken) != ""
}

func readSetupBootstrapCredential(ctx *gin.Context) string {
	if token := strings.TrimSpace(ctx.GetHeader("X-Setup-Bootstrap-Token")); token != "" {
		return token
	}
	if token := strings.TrimSpace(ctx.GetHeader("X-Bootstrap-Token")); token != "" {
		return token
	}

	authHeader := strings.TrimSpace(ctx.GetHeader("Authorization"))
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return strings.TrimSpace(authHeader[7:])
	}

	return ""
}

func validateSetupDeployToken(ctx *gin.Context, state *model.SetupState) error {
	setupDeployToken := readSetupDeployToken(ctx)
	return services.SetupGuardService.ValidateAndConsumeDeployToken(
		services.SetupStateService.IsWindowOpen(state, time.Now()),
		setupDeployToken,
		ctx.ClientIP(),
		ctx.GetHeader("User-Agent"),
	)
}

func readSetupDeployToken(ctx *gin.Context) string {
	setupDeployToken := strings.TrimSpace(ctx.GetHeader("X-Setup-Deploy-Token"))
	if setupDeployToken == "" {
		setupDeployToken = strings.TrimSpace(ctx.GetHeader("X-Setup-Token"))
	}
	return setupDeployToken
}

func checkDockerAvailable(ctx context.Context) (bool, string) {
	pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return false, fmt.Sprintf("docker client init failed: %v", err)
	}
	defer cli.Close()

	if _, err := cli.Ping(pingCtx); err != nil {
		return false, fmt.Sprintf("docker daemon unreachable: %v", err)
	}

	return true, "docker daemon reachable"
}

func checkTCPPort(name string, port int) setupPortCheck {
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return setupPortCheck{
			Name:      name,
			Port:      port,
			Protocol:  "tcp",
			Available: false,
			Detail:    fmt.Sprintf("in use or blocked: %v", err),
		}
	}
	_ = ln.Close()
	return setupPortCheck{
		Name:      name,
		Port:      port,
		Protocol:  "tcp",
		Available: true,
		Detail:    "available",
	}
}

func checkUDPPort(name string, port int) setupPortCheck {
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	conn, err := net.ListenPacket("udp", addr)
	if err != nil {
		return setupPortCheck{
			Name:      name,
			Port:      port,
			Protocol:  "udp",
			Available: false,
			Detail:    fmt.Sprintf("in use or blocked: %v", err),
		}
	}
	_ = conn.Close()
	return setupPortCheck{
		Name:      name,
		Port:      port,
		Protocol:  "udp",
		Available: true,
		Detail:    "available",
	}
}

func checkDNSHost(ctx context.Context, host string) setupDNSCheck {
	resolveCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	addrs, err := net.DefaultResolver.LookupHost(resolveCtx, host)
	if err != nil {
		return setupDNSCheck{
			Host:     host,
			Resolved: false,
			Detail:   fmt.Sprintf("resolve failed: %v", err),
		}
	}
	return setupDNSCheck{
		Host:     host,
		Resolved: len(addrs) > 0,
		Records:  addrs,
		Detail:   "resolved",
	}
}

func detectSetupConfigFiles() []string {
	paths := []string{
		"./.env",
		"./config.yaml",
		"./docker-compose.yml",
		"./deploy/docker-compose.setup.yaml",
		"./deploy/nginx/conf.d/headscale-panel.setup.conf",
		"./headscale/config/config.yaml",
	}

	found := make([]string, 0, len(paths))
	for _, p := range paths {
		clean := filepath.Clean(p)
		info, err := os.Stat(clean)
		if err != nil || info.IsDir() {
			continue
		}
		found = append(found, clean)
	}
	return found
}

func collectRuntimeSummary(ctx context.Context, existingFiles []string) (setupHealthSummary, gin.H) {
	health := setupHealthSummary{
		DockerAvailable: false,
		DockerDetail:    "docker daemon unreachable",
	}

	deployment := gin.H{
		"deployed":            false,
		"containers":          []setupContainerStatus{},
		"headscale_detected":  false,
		"derp_detected":       false,
		"nginx_detected":      false,
		"container_count":     0,
		"existing_file_count": len(existingFiles),
	}

	checkCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		health.DockerDetail = fmt.Sprintf("docker client init failed: %v", err)
		return health, deployment
	}
	defer cli.Close()

	if _, err := cli.Ping(checkCtx); err != nil {
		health.DockerDetail = fmt.Sprintf("docker daemon unreachable: %v", err)
		deployment["deployed"] = len(existingFiles) > 0
		return health, deployment
	}

	health.DockerAvailable = true
	health.DockerDetail = "docker daemon reachable"

	if info, err := cli.Info(checkCtx); err == nil {
		health.DockerVersion = strings.TrimSpace(info.ServerVersion)
		health.CPUCores = info.NCPU
		health.MemoryTotalBytes = int64(info.MemTotal)
		health.MemoryTotalHuman = formatBytes(health.MemoryTotalBytes)

		if info.DockerRootDir != "" {
			if total, free, fsErr := getFSUsage(info.DockerRootDir); fsErr == nil {
				health.StorageTotalBytes = total
				health.StorageFreeBytes = free
				health.StorageTotalHuman = formatBytes(total)
				health.StorageFreeHuman = formatBytes(free)
			}
		}
	}

	containers, err := cli.ContainerList(checkCtx, dockercontainer.ListOptions{All: true})
	if err != nil {
		health.DockerDetail = fmt.Sprintf("docker list failed: %v", err)
		deployment["deployed"] = len(existingFiles) > 0
		return health, deployment
	}

	containerStates := make([]setupContainerStatus, 0, len(containers))
	headscaleDetected := false
	derpDetected := false
	nginxDetected := false

	headscaleContainerName := ""
	headscaleHTTPPort := 0
	headscaleGRPCPort := 0
	derpContainerName := ""
	derpPort := 0
	derpStunPort := 0

	for _, c := range containers {
		containerName := ""
		if len(c.Names) > 0 {
			containerName = strings.TrimPrefix(c.Names[0], "/")
		}
		ports := make([]string, 0, len(c.Ports))
		for _, p := range c.Ports {
			spec := fmt.Sprintf("%d:%d/%s", p.PublicPort, p.PrivatePort, p.Type)
			if p.PublicPort == 0 {
				spec = fmt.Sprintf("%d/%s", p.PrivatePort, p.Type)
			}
			ports = append(ports, spec)
		}

		containerStates = append(containerStates, setupContainerStatus{
			Name:   containerName,
			Image:  c.Image,
			State:  c.State,
			Status: c.Status,
			Ports:  ports,
		})

		imageLower := strings.ToLower(c.Image)
		switch {
		case strings.Contains(imageLower, "headscale/headscale"):
			headscaleDetected = true
			headscaleContainerName = containerName
			for _, p := range c.Ports {
				if p.PrivatePort == 8080 && p.Type == "tcp" {
					headscaleHTTPPort = int(p.PublicPort)
				}
				if p.PrivatePort == 50443 && p.Type == "tcp" {
					headscaleGRPCPort = int(p.PublicPort)
				}
			}
		case strings.Contains(imageLower, "derper"):
			derpDetected = true
			derpContainerName = containerName
			for _, p := range c.Ports {
				if p.PrivatePort == 6060 && p.Type == "tcp" {
					derpPort = int(p.PublicPort)
				}
				if p.PrivatePort == 3478 && p.Type == "udp" {
					derpStunPort = int(p.PublicPort)
				}
			}
		case strings.Contains(imageLower, "nginx"):
			nginxDetected = true
		}
	}

	deployed := headscaleDetected || derpDetected || nginxDetected || len(existingFiles) > 0
	deployment["deployed"] = deployed
	deployment["containers"] = containerStates
	deployment["container_count"] = len(containerStates)
	deployment["headscale_detected"] = headscaleDetected
	deployment["derp_detected"] = derpDetected
	deployment["nginx_detected"] = nginxDetected
	deployment["headscale"] = gin.H{
		"container_name": headscaleContainerName,
		"http_port":      headscaleHTTPPort,
		"grpc_port":      headscaleGRPCPort,
	}
	deployment["derp"] = gin.H{
		"container_name": derpContainerName,
		"derp_port":      derpPort,
		"stun_port":      derpStunPort,
	}

	return health, deployment
}

func readSetupConfigHints(existingFiles []string) gin.H {
	hints := gin.H{}
	has := make(map[string]struct{}, len(existingFiles))
	for _, file := range existingFiles {
		has[file] = struct{}{}
	}

	nginxConfigPath := filepath.Clean("./deploy/nginx/conf.d/headscale-panel.setup.conf")
	if _, ok := has[nginxConfigPath]; ok {
		panel, headscale, derp := parseNginxServerNames(nginxConfigPath)
		if panel != "" {
			hints["panel_domain"] = panel
		}
		if headscale != "" {
			hints["headscale_host"] = headscale
		}
		if derp != "" {
			hints["derp_host"] = derp
		}
	}

	return hints
}

func parseNginxServerNames(path string) (panel string, headscale string, derp string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", "", ""
	}

	lines := strings.Split(string(data), "\n")
	names := make([]string, 0, 3)
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "server_name ") {
			continue
		}
		trimmed = strings.TrimPrefix(trimmed, "server_name ")
		trimmed = strings.TrimSuffix(trimmed, ";")
		trimmed = strings.TrimSpace(trimmed)
		if trimmed == "" {
			continue
		}
		names = append(names, trimmed)
	}

	if len(names) > 0 {
		panel = names[0]
	}
	if len(names) > 1 {
		headscale = names[1]
	}
	if len(names) > 2 {
		derp = names[2]
	}
	return panel, headscale, derp
}

func getFSUsage(path string) (total int64, free int64, err error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, 0, err
	}
	total = int64(stat.Blocks) * int64(stat.Bsize)
	free = int64(stat.Bavail) * int64(stat.Bsize)
	return total, free, nil
}

func formatBytes(bytes int64) string {
	if bytes <= 0 {
		return "0 B"
	}
	const unit = 1024
	units := []string{"B", "KB", "MB", "GB", "TB"}
	value := float64(bytes)
	i := 0
	for value >= unit && i < len(units)-1 {
		value /= unit
		i++
	}
	return fmt.Sprintf("%.1f %s", value, units[i])
}

func deriveBackendPort() int {
	raw := strings.TrimSpace(conf.Conf.System.Port)
	raw = strings.TrimPrefix(raw, ":")
	port, err := strconv.Atoi(raw)
	if err != nil || port < 1 || port > 65535 {
		return 8080
	}
	return port
}

func normalizePort(value string, fallback int) (int, error) {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return fallback, nil
	}
	raw = strings.TrimPrefix(raw, ":")
	port, err := strconv.Atoi(raw)
	if err != nil || port < 1 || port > 65535 {
		return 0, serializer.NewError(serializer.CodeParamErr, "invalid port value", nil)
	}
	return port, nil
}

func validateProxyHost(value string) (string, error) {
	host := strings.ToLower(strings.TrimSpace(value))
	if host == "" {
		return "", serializer.NewError(serializer.CodeParamErr, "proxy host is required", nil)
	}
	if strings.ContainsAny(host, "/\\ \t\r\n") || strings.Contains(host, ":") {
		return "", serializer.NewError(serializer.CodeParamErr, "invalid proxy host", nil)
	}
	parts := strings.Split(host, ".")
	for _, part := range parts {
		if part == "" {
			return "", serializer.NewError(serializer.CodeParamErr, "invalid proxy host", nil)
		}
		for _, r := range part {
			if (r < 'a' || r > 'z') && (r < '0' || r > '9') && r != '-' {
				return "", serializer.NewError(serializer.CodeParamErr, "invalid proxy host", nil)
			}
		}
		if strings.HasPrefix(part, "-") || strings.HasSuffix(part, "-") {
			return "", serializer.NewError(serializer.CodeParamErr, "invalid proxy host", nil)
		}
	}
	return host, nil
}

func renderNginxConfig(panelDomain, headscaleHost, derpHost string, backendPort, headscalePort, derpPort int, enableCertbot bool) string {
	certbotLocation := ""
	if enableCertbot {
		certbotLocation = `    location ^~ /.well-known/acme-challenge/ {
      root /var/www/certbot;
    }
`
	}

	var derpBlock string
	if derpHost != "" && derpPort > 0 {
		derpBlock = fmt.Sprintf(`
server {
    listen 80;
    server_name %s;
%s    location / {
      proxy_pass http://127.0.0.1:%d;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`, derpHost, certbotLocation, derpPort)
	}

	return fmt.Sprintf(`map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name %s;
%s    location / {
      proxy_pass http://127.0.0.1:%d;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name %s;
%s    location / {
      proxy_pass http://127.0.0.1:%d;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }
}
%s
# NOTE:
# 1) DERP STUN is UDP and cannot be proxied by this HTTP server block.
# 2) Open/forward UDP directly on your edge proxy/L4 load balancer.
`, panelDomain, certbotLocation, backendPort, headscaleHost, certbotLocation, headscalePort, derpBlock)
}

func checkTCPConnect(ctx context.Context, addr string) (bool, string) {
	connectCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var d net.Dialer
	conn, err := d.DialContext(connectCtx, "tcp", addr)
	if err != nil {
		return false, fmt.Sprintf("connection failed: %v", err)
	}
	_ = conn.Close()
	return true, "reachable"
}

func renderComposeFromConfig(
	hsContainerName, hsHTTPPort, hsGRPCPort, hsConfigPath, hsDataPath, hsTimezone,
	hsDBDriver, hsDBURL, hsAPIKey string,
	derpEnabled bool, derpContainerName, derpDomain, derpPort, stunPort,
	derpRegionCode, derpCertMode string, derpVerifyClients bool,
	proxyMode, nginxContainerName, panelDomain, headscaleHost, derpHost string,
	deployCertbot bool, certbotContainerName, certbotEmail, timezone string,
) string {
	var sb strings.Builder
	sb.WriteString("version: \"3.9\"\nservices:\n")

	// Headscale service
	sb.WriteString(fmt.Sprintf(`  headscale:
    image: headscale/headscale:stable
    container_name: %s
    command: ["serve"]
    restart: unless-stopped
    ports:
      - "%s:8080"
      - "%s:50443"
    environment:
      HEADSCALE_DATABASE_TYPE: %s
      HEADSCALE_DATABASE_URL: %s
      HEADSCALE_API_KEY: %s
    volumes:
      - %s:/etc/headscale
      - %s:/var/lib/headscale
      - ./headscale/run:/var/run/headscale
      - /usr/share/zoneinfo/%s:/etc/localtime:ro
    networks:
      - private
`, hsContainerName, hsHTTPPort, hsGRPCPort, hsDBDriver, hsDBURL, hsAPIKey,
		hsConfigPath, hsDataPath, hsTimezone))

	// DERP service
	if derpEnabled && derpContainerName != "" {
		sb.WriteString(fmt.Sprintf(`
  derper:
    image: fredliang/derper
    container_name: %s
    restart: unless-stopped
    ports:
      - "%s:6060"
      - "%s:3478/udp"
    environment:
      DERP_DOMAIN: %s
      DERP_ADDR: :6060
      DERP_REGION_CODE: %s
      DERP_CERT_MODE: %s
      DERP_VERIFY_CLIENTS: "%v"
    volumes:
      - /var/run/tailscale:/var/run/tailscale
      - /usr/share/zoneinfo/%s:/etc/localtime:ro
    networks:
      - private
`, derpContainerName, derpPort, stunPort, derpDomain, derpRegionCode, derpCertMode,
			derpVerifyClients, timezone))
	}

	// Nginx service
	if proxyMode == "built_in" {
		ngxName := nginxContainerName
		if ngxName == "" {
			ngxName = "headscale-nginx"
		}
		sb.WriteString(fmt.Sprintf(`
  nginx:
    image: nginx:1.27-alpine
    container_name: %s
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./deploy/nginx/conf.d:/etc/nginx/conf.d
      - ./deploy/nginx/certbot/www:/var/www/certbot
      - ./deploy/nginx/certbot/conf:/etc/letsencrypt
      - /usr/share/zoneinfo/%s:/etc/localtime:ro
    networks:
      - private
`, ngxName, timezone))

		// Certbot service
		if deployCertbot {
			cbName := certbotContainerName
			if cbName == "" {
				cbName = "headscale-certbot"
			}
			domains := make([]string, 0, 3)
			if panelDomain != "" {
				domains = append(domains, panelDomain)
			}
			if headscaleHost != "" {
				domains = append(domains, headscaleHost)
			}
			if derpHost != "" {
				domains = append(domains, derpHost)
			}
			sb.WriteString(fmt.Sprintf(`
  certbot:
    image: certbot/certbot:latest
    container_name: %s
    restart: unless-stopped
    environment:
      CERTBOT_EMAIL: %s
      CERTBOT_DOMAINS: %s
    command:
      - sh
      - -c
      - >-
        trap exit TERM;
        while :; do
          certbot certonly --webroot -w /var/www/certbot --agree-tos --no-eff-email --email "$CERTBOT_EMAIL" -d "$CERTBOT_DOMAINS" || true;
          certbot renew --webroot -w /var/www/certbot --quiet || true;
          sleep 12h & wait $!;
        done
    volumes:
      - ./deploy/nginx/certbot/www:/var/www/certbot
      - ./deploy/nginx/certbot/conf:/etc/letsencrypt
    networks:
      - private
`, cbName, certbotEmail, strings.Join(domains, ",")))
		}
	}

	sb.WriteString("\nnetworks:\n  private:\n    name: private\n    driver: bridge\n")
	return sb.String()
}
