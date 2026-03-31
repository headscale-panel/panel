package controllers

import (
	"headscale-panel/pkg/conf"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestSetupBootstrapOptionalWhenNotConfigured(t *testing.T) {
	previous := conf.Conf.System.SetupBootstrapToken
	conf.Conf.System.SetupBootstrapToken = ""
	defer func() {
		conf.Conf.System.SetupBootstrapToken = previous
	}()

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(w)
	ctx.Request = httptest.NewRequest("GET", "/api/v1/setup/status", nil)
	ctx.Request.RemoteAddr = "127.0.0.1:12345"

	if err := requireSetupBootstrap(ctx); err != nil {
		t.Fatalf("requireSetupBootstrap() should allow when token is not configured, got error: %v", err)
	}
	if !isSetupBootstrapAuthorized(ctx) {
		t.Fatal("isSetupBootstrapAuthorized() should return true when token is not configured")
	}
}

func TestSetupBootstrapRejectsNonLocalWhenNotConfigured(t *testing.T) {
	previous := conf.Conf.System.SetupBootstrapToken
	conf.Conf.System.SetupBootstrapToken = ""
	defer func() {
		conf.Conf.System.SetupBootstrapToken = previous
	}()

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(w)
	ctx.Request = httptest.NewRequest("GET", "/api/v1/setup/status", nil)
	ctx.Request.RemoteAddr = "198.51.100.10:12345"

	if err := requireSetupBootstrap(ctx); err == nil {
		t.Fatal("requireSetupBootstrap() should reject non-local requests when token is not configured")
	}
	if isSetupBootstrapAuthorized(ctx) {
		t.Fatal("isSetupBootstrapAuthorized() should be false for non-local requests when token is not configured")
	}
}

func TestSetupBootstrapValidationWhenConfigured(t *testing.T) {
	previous := conf.Conf.System.SetupBootstrapToken
	conf.Conf.System.SetupBootstrapToken = "0123456789abcdef0123456789abcdef"
	defer func() {
		conf.Conf.System.SetupBootstrapToken = previous
	}()

	gin.SetMode(gin.TestMode)

	// Missing token should fail.
	missingW := httptest.NewRecorder()
	missingCtx, _ := gin.CreateTestContext(missingW)
	missingCtx.Request = httptest.NewRequest("POST", "/api/v1/setup/init", nil)
	if err := requireSetupBootstrap(missingCtx); err == nil {
		t.Fatal("requireSetupBootstrap() should fail when configured token is missing")
	}

	// Correct token should pass.
	okW := httptest.NewRecorder()
	okCtx, _ := gin.CreateTestContext(okW)
	okCtx.Request = httptest.NewRequest("POST", "/api/v1/setup/init", nil)
	okCtx.Request.Header.Set("X-Setup-Bootstrap-Token", conf.Conf.System.SetupBootstrapToken)
	if err := requireSetupBootstrap(okCtx); err != nil {
		t.Fatalf("requireSetupBootstrap() should pass with correct token, got error: %v", err)
	}
	if !isSetupBootstrapAuthorized(okCtx) {
		t.Fatal("isSetupBootstrapAuthorized() should return true with correct token")
	}
}

func TestNormalizeSSLCertMode(t *testing.T) {
	cases := []struct {
		name          string
		mode          string
		deployCertbot bool
		want          string
	}{
		{name: "explicit certbot", mode: "certbot", deployCertbot: false, want: "certbot"},
		{name: "explicit manual", mode: "manual", deployCertbot: true, want: "manual"},
		{name: "fallback certbot", mode: "", deployCertbot: true, want: "certbot"},
		{name: "fallback manual", mode: "", deployCertbot: false, want: "manual"},
	}

	for _, tc := range cases {
		got := normalizeSSLCertMode(tc.mode, tc.deployCertbot)
		if got != tc.want {
			t.Fatalf("%s: expected %q, got %q", tc.name, tc.want, got)
		}
	}
}

func TestRenderSetupConfigTemplates(t *testing.T) {
	hsConfig := renderSetupHeadscaleConfig("", "", "")
	if !strings.Contains(hsConfig, "grpc_allow_insecure: true") {
		t.Fatal("renderSetupHeadscaleConfig() should include grpc_allow_insecure")
	}
	if !strings.Contains(hsConfig, "server_url: https://vpn.example.com") {
		t.Fatal("renderSetupHeadscaleConfig() should include default server_url")
	}

	hsConfigCustom := renderSetupHeadscaleConfig("https://custom.example.com", "example.net", "https://auth.example.com")
	if !strings.Contains(hsConfigCustom, "server_url: https://custom.example.com") {
		t.Fatal("renderSetupHeadscaleConfig() should use custom server_url")
	}
	if !strings.Contains(hsConfigCustom, "base_domain: example.net") {
		t.Fatal("renderSetupHeadscaleConfig() should use custom base_domain")
	}
	if !strings.Contains(hsConfigCustom, "issuer: \"https://auth.example.com\"") {
		t.Fatal("renderSetupHeadscaleConfig() should use custom oidc issuer")
	}

	derpConfig := renderSetupDERPConfig("derp.example.com")
	if !strings.Contains(derpConfig, "hostname: derp.example.com") {
		t.Fatal("renderSetupDERPConfig() should use provided hostname")
	}
}
