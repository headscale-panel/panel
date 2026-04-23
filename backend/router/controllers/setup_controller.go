package controllers

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"headscale-panel/model"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/headscale"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"
	"net"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

type SetupController struct{}

func NewSetupController() *SetupController {
	return &SetupController{}
}

// GetStatus godoc
// @Summary Get setup and initialization status
// @Tags setup
// @Produce json
// @Success 200 {object} serializer.Response{data=object}
// @Router /setup/status [get]
// GetStatus checks if the system has been initialized.
func (s *SetupController) GetStatus(ctx *gin.Context) {
	state, err := services.SetupStateService.GetState()
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	now := time.Now()
	windowOpen := services.SetupStateService.IsWindowOpen(state, now)
	initialized := state.State == model.SetupStateInitialized
	bootstrapAuthorized := isSetupBootstrapAuthorized(ctx)

	resp := gin.H{
		"initialized":           initialized,
		"setup_state":           state.State,
		"setup_window_open":     windowOpen,
		"setup_window_deadline": "",
		"bootstrap_configured":  isSetupBootstrapConfigured(),
	}

	if state.State == model.SetupStateInitWindow && state.WindowDeadline != nil {
		resp["setup_window_deadline"] = state.WindowDeadline.UTC().Format(time.RFC3339)
	}

	if windowOpen && bootstrapAuthorized {
		initToken, initTokenExpiresAt, err := services.SetupGuardService.IssueInitToken(true, ctx.ClientIP(), ctx.GetHeader("User-Agent"))
		if err == nil {
			resp["init_token"] = initToken
			resp["init_token_expires_at"] = initTokenExpiresAt.UTC().Format(time.RFC3339)
		}
	}

	serializer.Success(ctx, resp)
}

type SetupPreflightRequest struct {
	HeadscaleGRPCAddr string `json:"headscale_grpc_addr"`
	SkipNetworkChecks bool   `json:"skip_network_checks"`
}

// Preflight godoc
// @Summary Run preflight checks before setup
// @Tags setup
// @Accept json
// @Produce json
// @Param body body SetupPreflightRequest false "Preflight options"
// @Success 200 {object} serializer.Response{data=object}
// @Router /setup/preflight [post]
func (s *SetupController) Preflight(ctx *gin.Context) {
	var req SetupPreflightRequest
	if ctx.Request.ContentLength > 0 {
		if err := ctx.ShouldBindJSON(&req); err != nil {
			serializer.Fail(ctx, serializer.ErrBind)
			return
		}
	}

	checks := []gin.H{}

	if !req.SkipNetworkChecks {
		grpcAddr := normalizeGRPCAddress(req.HeadscaleGRPCAddr)
		ok, detail := checkTCPConnect(ctx.Request.Context(), grpcAddr)
		checks = append(checks, gin.H{
			"name":      "headscale_grpc",
			"address":   grpcAddr,
			"reachable": ok,
			"detail":    detail,
		})
	}

	serializer.Success(ctx, gin.H{
		"checks":               checks,
		"bootstrap_configured": isSetupBootstrapConfigured(),
	})
}

// ConnectivityCheckRequest holds the parameters for checking Headscale connectivity.
type ConnectivityCheckRequest struct {
	HeadscaleGRPCAddr string `json:"headscale_grpc_addr"`
	APIKey            string `json:"api_key"`
	StrictAPI         bool   `json:"strict_api"`
	GRPCAllowInsecure *bool  `json:"grpc_allow_insecure"`
}

// ConnectivityPollRequest holds the parameters for polling Headscale connectivity.
type ConnectivityPollRequest struct {
	HeadscaleGRPCAddr string `json:"headscale_grpc_addr"`
	APIKey            string `json:"api_key"`
	GRPCAllowInsecure *bool  `json:"grpc_allow_insecure"`
	MaxAttempts       int    `json:"max_attempts"`
	IntervalSeconds   int    `json:"interval_seconds"`
}

// ConnectivityCheck godoc
// @Summary Check Headscale gRPC connectivity
// @Tags setup
// @Accept json
// @Produce json
// @Param body body ConnectivityCheckRequest false "Connectivity check options"
// @Success 200 {object} serializer.Response{data=object}
// @Router /setup/connectivity-check [post]
// ConnectivityCheck validates gRPC reachability and optional API access.
func (s *SetupController) ConnectivityCheck(ctx *gin.Context) {
	var req ConnectivityCheckRequest
	if ctx.Request.ContentLength > 0 {
		if err := ctx.ShouldBindJSON(&req); err != nil {
			serializer.Fail(ctx, serializer.ErrBind)
			return
		}
	}

	grpcAddr := normalizeGRPCAddress(req.HeadscaleGRPCAddr)
	results := []gin.H{}

	ok, detail := checkTCPConnect(ctx.Request.Context(), grpcAddr)
	results = append(results, gin.H{
		"name":      "headscale_grpc",
		"address":   grpcAddr,
		"reachable": ok,
		"detail":    detail,
	})

	if req.StrictAPI {
		allowInsecure := true
		if req.GRPCAllowInsecure != nil {
			allowInsecure = *req.GRPCAllowInsecure
		}
		ok, detail = checkHeadscaleAPIAccess(ctx.Request.Context(), grpcAddr, req.APIKey, allowInsecure)
		results = append(results, gin.H{
			"name":      "headscale_api",
			"address":   grpcAddr,
			"reachable": ok,
			"detail":    detail,
		})
	}

	allReachable := len(results) > 0
	for _, item := range results {
		if reachable, _ := item["reachable"].(bool); !reachable {
			allReachable = false
			break
		}
	}

	serializer.Success(ctx, gin.H{
		"checks":        results,
		"all_reachable": allReachable,
	})
}

// ConnectivityPoll godoc
// @Summary Poll Headscale API access
// @Tags setup
// @Accept json
// @Produce json
// @Param body body ConnectivityPollRequest true "Poll options"
// @Success 200 {object} serializer.Response{data=object}
// @Router /setup/connectivity-poll [post]
// ConnectivityPoll retries Headscale API access for a short period.
func (s *SetupController) ConnectivityPoll(ctx *gin.Context) {
	var req ConnectivityPollRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	grpcAddr := normalizeGRPCAddress(req.HeadscaleGRPCAddr)
	allowInsecure := true
	if req.GRPCAllowInsecure != nil {
		allowInsecure = *req.GRPCAllowInsecure
	}

	maxAttempts := req.MaxAttempts
	if maxAttempts <= 0 || maxAttempts > 30 {
		maxAttempts = 10
	}
	interval := req.IntervalSeconds
	if interval <= 0 || interval > 10 {
		interval = 3
	}

	var lastDetail string
	for i := 0; i < maxAttempts; i++ {
		ok, detail := checkHeadscaleAPIAccess(ctx.Request.Context(), grpcAddr, req.APIKey, allowInsecure)
		lastDetail = detail
		if ok {
			serializer.Success(ctx, gin.H{
				"ready":    true,
				"attempts": i + 1,
				"detail":   detail,
			})
			return
		}
		if ctx.Request.Context().Err() != nil {
			break
		}
		time.Sleep(time.Duration(interval) * time.Second)
	}

	serializer.Success(ctx, gin.H{
		"ready":    false,
		"attempts": maxAttempts,
		"detail":   lastDetail,
	})
}

// Initialize godoc
// @Summary Initialize the system with admin user and Headscale connection
// @Tags setup
// @Accept json
// @Produce json
// @Param body body InitializeRequest true "Initialize parameters"
// @Success 200 {object} serializer.Response
// @Failure 400 {object} serializer.Response
// @Router /setup/initialize [post]
// Initialize saves the Headscale connection settings and creates the first admin.
type InitializeRequest struct {
	HeadscaleGRPCAddr string `json:"headscale_grpc_addr"`
	APIKey            string `json:"api_key"`
	EnableTLS         *bool  `json:"enable_tls"`

	Username string `json:"username"`
	Password string `json:"password"`
	Email    string `json:"email"`
}

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

	setupInitToken := strings.TrimSpace(ctx.GetHeader("X-Setup-Init-Token"))
	if setupInitToken == "" {
		setupInitToken = strings.TrimSpace(ctx.GetHeader("X-Setup-Token"))
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

	grpcAddr := normalizeGRPCAddress(req.HeadscaleGRPCAddr)
	apiKey := strings.TrimSpace(req.APIKey)
	if apiKey == "" {
		serializer.Fail(ctx, serializer.NewError(serializer.CodeParamErr, "headscale api key is required", nil))
		return
	}

	enableTLS := false
	if req.EnableTLS != nil {
		enableTLS = *req.EnableTLS
	}
	allowInsecure := !enableTLS

	if ok, detail := checkHeadscaleAPIAccess(ctx.Request.Context(), grpcAddr, apiKey, allowInsecure); !ok {
		serializer.Fail(ctx, serializer.NewError(serializer.CodeThirdPartyServiceError, detail, nil))
		return
	}

	if err := applyHeadscaleConnectionConfig(grpcAddr, apiKey, allowInsecure); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	username := strings.TrimSpace(req.Username)
	if username == "" {
		username = "admin"
	}

	password := req.Password
	passwordGenerated := false
	if strings.TrimSpace(password) == "" {
		generated, genErr := generateSecurePassword(24)
		if genErr != nil {
			serializer.Fail(ctx, serializer.NewError(serializer.CodeInternalError, "failed to generate admin password", genErr))
			return
		}
		password = generated
		passwordGenerated = true
	}

	var adminGroup model.Group
	if err := model.DB.Where("name = ?", "Admin").First(&adminGroup).Error; err != nil {
		serializer.Fail(ctx, serializer.NewError(serializer.CodeInternalError, "admin group not found, please check database initialization", err))
		return
	}

	user := model.User{
		Username:      username,
		Password:      password,
		Email:         strings.TrimSpace(req.Email),
		GroupID:       adminGroup.ID,
		HeadscaleName: username,
		Provider:      "local",
	}

	if err := model.DB.Create(&user).Error; err != nil {
		serializer.Fail(ctx, serializer.ErrDatabase.WithError(err))
		return
	}

	if err := services.SetupStateService.MarkInitialized(); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	// Sync resources from Headscale ACL into local database during initialization
	_ = services.HeadscaleService.SyncACL()

	services.SetupGuardService.RevokeAllTokens()

	resp := gin.H{
		"message": "setup completed",
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"email":    user.Email,
		},
		"connection": gin.H{
			"headscale_grpc_addr": grpcAddr,
			"enable_tls":          enableTLS,
		},
		"password_generated": passwordGenerated,
	}
	if passwordGenerated {
		resp["generated_password"] = password
	}

	serializer.Success(ctx, resp)
}

func applyHeadscaleConnectionConfig(grpcAddr, apiKey string, insecureMode bool) error {
	old := conf.Conf.Headscale

	conf.Conf.Headscale.GRPCAddr = grpcAddr
	conf.Conf.Headscale.APIKey = apiKey
	conf.Conf.Headscale.Insecure = insecureMode

	if err := services.PersistHeadscaleConnection(grpcAddr, apiKey, insecureMode); err != nil {
		conf.Conf.Headscale = old
		return serializer.NewError(serializer.CodeDBError, "failed to persist Headscale connection settings to DB", err)
	}

	headscale.Close()
	if err := headscale.Init(); err != nil {
		conf.Conf.Headscale = old
		_ = headscale.Init()
		return serializer.NewError(serializer.CodeThirdPartyServiceError, "failed to reinitialize headscale client", err)
	}

	return nil
}

func generateSecurePassword(length int) (string, error) {
	if length < 12 {
		length = 12
	}
	buf := make([]byte, length)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	encoded := base64.RawURLEncoding.EncodeToString(buf)
	if len(encoded) < length {
		return encoded, nil
	}
	return encoded[:length], nil
}

func requireSetupBootstrap(ctx *gin.Context) error {
	expected := strings.TrimSpace(conf.Conf.System.SetupBootstrapToken)
	if expected == "" {
		// Bootstrap token is optional; if not configured, allow setup flow without credential.
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

func normalizeGRPCAddress(raw string) string {
	grpcAddr := strings.TrimSpace(raw)
	if grpcAddr == "" {
		grpcAddr = conf.Conf.Headscale.GRPCAddr
	}
	if strings.TrimSpace(grpcAddr) == "" {
		grpcAddr = "127.0.0.1:50443"
	}
	if !strings.Contains(grpcAddr, ":") {
		grpcAddr += ":50443"
	}
	return grpcAddr
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

func checkHeadscaleAPIAccess(ctx context.Context, addr, apiKey string, allowInsecure bool) (bool, string) {
	targetAddr := strings.TrimSpace(addr)
	if targetAddr == "" {
		return false, "headscale gRPC address is required"
	}
	token := strings.TrimSpace(apiKey)
	if token == "" {
		return false, "headscale api key is required"
	}

	var transport credentials.TransportCredentials
	if allowInsecure {
		transport = insecure.NewCredentials()
	} else {
		transport = credentials.NewTLS(&tls.Config{MinVersion: tls.VersionTLS12})
	}

	conn, err := grpc.NewClient(targetAddr, grpc.WithTransportCredentials(transport))
	if err != nil {
		return false, fmt.Sprintf("grpc client init failed: %v", err)
	}
	defer conn.Close()

	client := v1.NewHeadscaleServiceClient(conn)
	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	queryCtx = metadata.AppendToOutgoingContext(queryCtx, "authorization", "Bearer "+token)

	if _, err := client.ListUsers(queryCtx, &v1.ListUsersRequest{}); err != nil {
		return false, fmt.Sprintf("headscale api request failed: %v", err)
	}
	return true, "headscale api reachable"
}
