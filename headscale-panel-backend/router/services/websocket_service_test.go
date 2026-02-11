package services

import (
	"headscale-panel/pkg/conf"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestExtractWebSocketToken(t *testing.T) {
	gin.SetMode(gin.TestMode)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req := httptest.NewRequest(http.MethodGet, "/ws?token=query-token", nil)
	req.Header.Set("Authorization", "Bearer header-token")
	c.Request = req

	if got := extractWebSocketToken(c); got != "query-token" {
		t.Fatalf("expected query token, got %q", got)
	}

	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	req2 := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req2.Header.Set("Authorization", "Bearer header-token")
	c2.Request = req2

	if got := extractWebSocketToken(c2); got != "header-token" {
		t.Fatalf("expected bearer token, got %q", got)
	}
}

func TestIsOriginAllowed(t *testing.T) {
	originalBaseURL := conf.Conf.System.BaseURL
	t.Cleanup(func() {
		conf.Conf.System.BaseURL = originalBaseURL
	})

	t.Run("empty origin allowed", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "http://localhost/ws", nil)
		req.Host = "localhost:8080"
		if !isOriginAllowed(req) {
			t.Fatalf("expected empty origin to be allowed")
		}
	})

	t.Run("same host origin allowed", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "http://api.example.com/ws", nil)
		req.Host = "api.example.com:8080"
		req.Header.Set("Origin", "http://api.example.com:8080")
		if !isOriginAllowed(req) {
			t.Fatalf("expected same host origin to be allowed")
		}
	})

	t.Run("base url origin allowed", func(t *testing.T) {
		conf.Conf.System.BaseURL = "https://panel.example.com"
		req := httptest.NewRequest(http.MethodGet, "http://api.internal/ws", nil)
		req.Host = "api.internal:8080"
		req.Header.Set("Origin", "https://panel.example.com")
		if !isOriginAllowed(req) {
			t.Fatalf("expected base_url host origin to be allowed")
		}
	})

	t.Run("untrusted origin rejected", func(t *testing.T) {
		conf.Conf.System.BaseURL = "https://panel.example.com"
		req := httptest.NewRequest(http.MethodGet, "http://api.internal/ws", nil)
		req.Host = "api.internal:8080"
		req.Header.Set("Origin", "https://evil.example.com")
		if isOriginAllowed(req) {
			t.Fatalf("expected untrusted origin to be rejected")
		}
	})
}

func TestHandleWebSocketRejectsUnauthorized(t *testing.T) {
	gin.SetMode(gin.TestMode)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/ws", nil)

	HandleWebSocket(c)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, w.Code)
	}
}

func TestHandleWebSocketRejectsInvalidToken(t *testing.T) {
	gin.SetMode(gin.TestMode)

	originalSecret := conf.Conf.JWT.Secret
	conf.Conf.JWT.Secret = "12345678901234567890123456789012"
	t.Cleanup(func() {
		conf.Conf.JWT.Secret = originalSecret
	})

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/ws?token=invalid-token", nil)

	HandleWebSocket(c)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected status %d, got %d", http.StatusUnauthorized, w.Code)
	}
}

func TestGenerateClientIDFormat(t *testing.T) {
	re := regexp.MustCompile(`^ws-[0-9a-f]{32}$`)

	id1 := generateClientID()
	id2 := generateClientID()

	if !re.MatchString(id1) {
		t.Fatalf("unexpected client ID format: %q", id1)
	}
	if !re.MatchString(id2) {
		t.Fatalf("unexpected client ID format: %q", id2)
	}
	if id1 == id2 {
		t.Fatalf("generated duplicate client IDs: %q", id1)
	}
}
