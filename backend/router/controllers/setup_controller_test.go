package controllers

import (
	"headscale-panel/pkg/conf"
	"net/http/httptest"
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
