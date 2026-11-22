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

package controllers

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"headscale-panel/internal/account"
	"headscale-panel/model"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/services"
	"net"
	"net/http"
	"net/url"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
)

type SetupController struct{}

func NewSetupController() *SetupController {
	return &SetupController{}
}

// GetStatus godoc
// @Summary Get setup and initialization status
// @Tags setup
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Router /setup/status [get]
// GetStatus checks if the system has been initialized.
func (s *SetupController) GetStatus(ctx *gin.Context) {
	state, err := services.SetupStateService.GetState()
	if err != nil {
		unifyerror.Fail(ctx, err)
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

	unifyerror.Success(ctx, resp)
}

type SetupPreflightRequest struct {
	HeadscaleAPIAddr  string `json:"headscale_api_addr"`
	SkipNetworkChecks bool   `json:"skip_network_checks"`
}

// Preflight godoc
// @Summary Run preflight checks before setup
// @Tags setup
// @Accept json
// @Produce json
// @Param body body SetupPreflightRequest false "Preflight options"
// @Success 200 {object} unifyerror.Response{data=object}
// @Router /setup/preflight [post]
func (s *SetupController) Preflight(ctx *gin.Context) {
	if err := requireSetupBootstrap(ctx); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	if _, err := services.SetupStateService.RequireSetupWindow(); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	var req SetupPreflightRequest
	if ctx.Request.ContentLength > 0 {
		if err := ctx.ShouldBindJSON(&req); err != nil {
			unifyerror.Fail(ctx, unifyerror.ErrBind)
			return
		}
	}

	checks := []gin.H{}

	if !req.SkipNetworkChecks {
		apiAddr := normalizeAPIAddr(req.HeadscaleAPIAddr)
		ok, detail := checkTCPConnect(ctx.Request.Context(), apiAddr)
		checks = append(checks, gin.H{
			"name":      "headscale_api",
			"address":   apiAddr,
			"reachable": ok,
			"detail":    detail,
		})
	}

	unifyerror.Success(ctx, gin.H{
		"checks":               checks,
		"bootstrap_configured": isSetupBootstrapConfigured(),
	})
}

// ConnectivityCheckRequest holds the parameters for checking Headscale connectivity.
type ConnectivityCheckRequest struct {
	HeadscaleAPIAddr string `json:"headscale_api_addr"`
	APIKey           string `json:"api_key"`
	StrictAPI        bool   `json:"strict_api"`
	APIAllowInsecure *bool  `json:"api_allow_insecure"`
	APITLSSkipVerify *bool  `json:"api_tls_skip_verify"`
	APITLSCACert     string `json:"api_tls_ca_cert"`
}

// ConnectivityPollRequest holds the parameters for polling Headscale connectivity.
type ConnectivityPollRequest struct {
	HeadscaleAPIAddr string `json:"headscale_api_addr"`
	APIKey           string `json:"api_key"`
	APIAllowInsecure *bool  `json:"api_allow_insecure"`
	APITLSSkipVerify *bool  `json:"api_tls_skip_verify"`
	APITLSCACert     string `json:"api_tls_ca_cert"`
	MaxAttempts      int    `json:"max_attempts"`
	IntervalSeconds  int    `json:"interval_seconds"`
}

// ConnectivityCheck godoc
// @Summary Check Headscale gRPC connectivity
// @Tags setup
// @Accept json
// @Produce json
// @Param body body ConnectivityCheckRequest false "Connectivity check options"
// @Success 200 {object} unifyerror.Response{data=object}
// @Router /setup/connectivity-check [post]
// ConnectivityCheck validates gRPC reachability and optional API access.
func (s *SetupController) ConnectivityCheck(ctx *gin.Context) {
	if err := requireSetupBootstrap(ctx); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	if _, err := services.SetupStateService.RequireSetupWindow(); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	var req ConnectivityCheckRequest
	if ctx.Request.ContentLength > 0 {
		if err := ctx.ShouldBindJSON(&req); err != nil {
			unifyerror.Fail(ctx, unifyerror.ErrBind)
			return
		}
	}

	apiAddr := normalizeAPIAddr(req.HeadscaleAPIAddr)
	results := []gin.H{}

	ok, detail := checkTCPConnect(ctx.Request.Context(), apiAddr)
	results = append(results, gin.H{
		"name":      "headscale_api",
		"address":   apiAddr,
		"reachable": ok,
		"detail":    detail,
	})

	if req.StrictAPI {
		allowInsecure := true
		if req.APIAllowInsecure != nil {
			allowInsecure = *req.APIAllowInsecure
		}
		tlsSkipVerify := false
		if req.APITLSSkipVerify != nil {
			tlsSkipVerify = *req.APITLSSkipVerify
		}
		ok, detail = services.CheckHeadscaleConnectivityWithConfig(ctx.Request.Context(), apiAddr, req.APIKey, allowInsecure, tlsSkipVerify, req.APITLSCACert)
		results = append(results, gin.H{
			"name":      "headscale_api",
			"address":   apiAddr,
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

	unifyerror.Success(ctx, gin.H{
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
// @Success 200 {object} unifyerror.Response{data=object}
// @Router /setup/connectivity-poll [post]
// ConnectivityPoll retries Headscale API access for a short period.
func (s *SetupController) ConnectivityPoll(ctx *gin.Context) {
	if err := requireSetupBootstrap(ctx); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	if _, err := services.SetupStateService.RequireSetupWindow(); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	var req ConnectivityPollRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	apiAddr := normalizeAPIAddr(req.HeadscaleAPIAddr)
	allowInsecure := true
	if req.APIAllowInsecure != nil {
		allowInsecure = *req.APIAllowInsecure
	}
	tlsSkipVerify := false
	if req.APITLSSkipVerify != nil {
		tlsSkipVerify = *req.APITLSSkipVerify
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
		ok, detail := services.CheckHeadscaleConnectivityWithConfig(ctx.Request.Context(), apiAddr, req.APIKey, allowInsecure, tlsSkipVerify, req.APITLSCACert)
		lastDetail = detail
		if ok {
			unifyerror.Success(ctx, gin.H{
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

	unifyerror.Success(ctx, gin.H{
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
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Router /setup/initialize [post]
// Initialize saves the Headscale connection settings and creates the first admin.
type InitializeRequest struct {
	HeadscaleAPIAddr string `json:"headscale_api_addr"`
	APIKey           string `json:"api_key"`
	EnableTLS        *bool  `json:"enable_tls"`
	TLSSkipVerify    *bool  `json:"tls_skip_verify"`
	TLSCACert        string `json:"tls_ca_cert"`

	Username string `json:"username"`
	Password string `json:"password"`
	Email    string `json:"email"`
}

func (s *SetupController) Initialize(ctx *gin.Context) {
	if err := requireSetupBootstrap(ctx); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	state, err := services.SetupStateService.RequireSetupWindow()
	if err != nil {
		unifyerror.Fail(ctx, err)
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
		unifyerror.Fail(ctx, err)
		return
	}

	var count int64
	if err := model.DB.Model(&account.Account{}).Count(&count).Error; err != nil {
		unifyerror.Fail(ctx, unifyerror.DbError(err))
		return
	}
	if count > 0 {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusConflict, unifyerror.CodeConflict, "system already initialized"))
		return
	}

	var req InitializeRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	apiAddr := normalizeAPIAddr(req.HeadscaleAPIAddr)
	apiKey := strings.TrimSpace(req.APIKey)
	if apiKey == "" {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "headscale api key is required"))
		return
	}

	enableTLS := false
	if req.EnableTLS != nil {
		enableTLS = *req.EnableTLS
	}
	allowInsecure := !enableTLS
	tlsSkipVerify := false
	if req.TLSSkipVerify != nil {
		tlsSkipVerify = *req.TLSSkipVerify
	}

	if ok, detail := services.CheckHeadscaleConnectivityWithConfig(ctx.Request.Context(), apiAddr, apiKey, allowInsecure, tlsSkipVerify, req.TLSCACert); !ok {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusOK, unifyerror.CodeHeadscaleAPIErr, detail))
		return
	}

	if err := services.SaveConnectionAndInitialize(ctx.Request.Context(), apiAddr, apiKey, allowInsecure, tlsSkipVerify, req.TLSCACert); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	username := strings.TrimSpace(req.Username)
	if username == "" {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "username is required"))
		return
	}

	password := req.Password
	passwordGenerated := false
	if strings.TrimSpace(password) == "" {
		generated, genErr := generateSecurePassword(24)
		if genErr != nil {
			unifyerror.Fail(ctx, unifyerror.New(http.StatusInternalServerError, unifyerror.CodeServerErr, "failed to generate admin password"))
			return
		}
		password = generated
		passwordGenerated = true
	}

	adminRole, roleErr := services.Accounts.RoleByName(constants.SystemAdminRoleName)
	if roleErr != nil {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusInternalServerError, unifyerror.CodeServerErr,
			"the system administrator role is missing; the database is not correctly initialized"))
		return
	}

	created, createErr := services.CreateAccount(services.AccountCreateInput{
		Username:    username,
		Password:    password,
		Email:       strings.TrimSpace(req.Email),
		DisplayName: username,
		RoleID:      adminRole.ID,
	})
	if createErr != nil {
		unifyerror.Fail(ctx, createErr)
		return
	}

	// Panel initialization deliberately stops here.
	//
	// Creating a matching headscale user is not part of bringing the panel up: it
	// is a network decision the operator makes later, once they have chosen where
	// network identities come from. Doing it here is how the two concepts became
	// entangled in the first place.
	if err := services.SetupStateService.MarkInitialized(); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	services.SetupGuardService.RevokeAllTokens()

	resp := gin.H{
		"message": "setup completed",
		"account": gin.H{
			"id":       created.ID,
			"username": created.Username,
			"email":    created.Email,
		},
		"connection": gin.H{
			"headscale_api_addr": apiAddr,
			"enable_tls":         enableTLS,
			"tls_skip_verify":    tlsSkipVerify,
			"has_ca_cert":        req.TLSCACert != "",
		},
		"password_generated": passwordGenerated,
	}
	if passwordGenerated {
		resp["generated_password"] = password
	}

	unifyerror.Success(ctx, resp)
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
		return unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, "missing setup bootstrap credential")
	}

	if subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
		return unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, "invalid setup bootstrap credential")
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

// normalizeAPIAddr coerces user input into an absolute http(s) URL.
//
// Accepts a bare host ("headscale.example.com"), a host:port, a full URL, or
// nothing at all (falls back to the configured address). A scheme is inferred:
// plain http for loopback and private addresses, https otherwise, because
// headscale's default deployment is TLS-terminated.
func normalizeAPIAddr(raw string) string {
	apiAddr := strings.TrimSpace(raw)
	if apiAddr == "" {
		apiAddr = strings.TrimSpace(conf.Conf.Headscale.APIAddr)
	}
	if apiAddr == "" {
		return "http://127.0.0.1:8080"
	}

	if !strings.Contains(apiAddr, "://") {
		scheme := "https"
		if isLoopbackOrPrivateHost(apiAddr) {
			scheme = "http"
		}
		apiAddr = scheme + "://" + apiAddr
	}

	parsed, err := url.Parse(apiAddr)
	if err != nil || parsed.Host == "" {
		return apiAddr
	}

	return strings.TrimRight(parsed.String(), "/")
}

// isLoopbackOrPrivateHost inspects the host portion of a host[:port] string.
func isLoopbackOrPrivateHost(addr string) bool {
	host := addr
	if h, _, err := net.SplitHostPort(addr); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")

	if host == "localhost" {
		return true
	}

	ip := net.ParseIP(host)
	return ip != nil && (ip.IsLoopback() || ip.IsPrivate())
}

// checkTCPConnect reports whether the host:port behind an API URL accepts TCP
// connections. It only proves the listener exists; authentication is verified
// separately by the API probe.
func checkTCPConnect(ctx context.Context, apiAddr string) (bool, string) {
	parsed, err := url.Parse(apiAddr)
	if err != nil || parsed.Host == "" {
		return false, "invalid API address: " + apiAddr
	}

	host := parsed.Host
	if _, _, splitErr := net.SplitHostPort(host); splitErr != nil {
		if parsed.Scheme == "https" {
			host = net.JoinHostPort(parsed.Hostname(), "443")
		} else {
			host = net.JoinHostPort(parsed.Hostname(), "80")
		}
	}

	connectCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	d := net.Dialer{
		Control: func(_, address string, _ syscall.RawConn) error {
			h, _, splitErr := net.SplitHostPort(address)
			if splitErr != nil {
				return fmt.Errorf("blocked address")
			}
			ip := net.ParseIP(h)
			if ip != nil && (ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified()) {
				return fmt.Errorf("address is not permitted")
			}
			return nil
		},
	}
	conn, err := d.DialContext(connectCtx, "tcp", host)
	if err != nil {
		return false, "connection failed"
	}
	_ = conn.Close()
	return true, "reachable"
}
