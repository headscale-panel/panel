// Copyright (C) 2026
// SPDX-License-Identifier: AGPL-3.0-or-later

package middleware

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestFrontendMiddlewarePassesPanelDiscoveryRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)
	frontendDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(frontendDir, "index.html"), []byte("<html>SPA</html>"), 0o600); err != nil {
		t.Fatal(err)
	}

	router := gin.New()
	router.Use(FrontendMiddleware(frontendDir))
	router.GET("/panel/.well-known/openid-configuration", func(ctx *gin.Context) {
		ctx.JSON(http.StatusOK, gin.H{"issuer": "https://vpn.example.com/panel"})
	})

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/panel/.well-known/openid-configuration", nil)
	router.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if got := recorder.Header().Get("Content-Type"); got != "application/json; charset=utf-8" {
		t.Fatalf("Content-Type = %q, want JSON", got)
	}
}
