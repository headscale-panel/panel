package services

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"headscale-panel/pkg/utils/serializer"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

type setupGuardService struct {
	mu           sync.Mutex
	bootTime     time.Time
	setupWindow  time.Duration
	tokenTTL     time.Duration
	deployTokens map[string]setupDeployToken
}

type setupDeployToken struct {
	ExpiresAt     time.Time
	ClientIP      string
	UserAgentHash string
}

var SetupGuardService = newSetupGuardService()

func newSetupGuardService() *setupGuardService {
	windowMinutes := 30
	if raw := strings.TrimSpace(os.Getenv("SETUP_WINDOW_MINUTES")); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 && v <= 240 {
			windowMinutes = v
		}
	}

	return &setupGuardService{
		bootTime:     time.Now(),
		setupWindow:  time.Duration(windowMinutes) * time.Minute,
		tokenTTL:     2 * time.Minute,
		deployTokens: make(map[string]setupDeployToken),
	}
}

func (s *setupGuardService) IsWindowOpen(initialized bool) bool {
	if initialized {
		return false
	}
	return time.Since(s.bootTime) <= s.setupWindow
}

func (s *setupGuardService) WindowDeadline() time.Time {
	return s.bootTime.Add(s.setupWindow)
}

func (s *setupGuardService) IssueDeployToken(initialized bool, clientIP, userAgent string) (string, time.Time, error) {
	if !s.IsWindowOpen(initialized) {
		return "", time.Time{}, serializer.NewError(serializer.CodeNoPermissionErr, "setup window closed", nil)
	}

	token, err := generateSetupToken()
	if err != nil {
		return "", time.Time{}, serializer.NewError(serializer.CodeInternalError, "failed to issue setup token", err)
	}

	now := time.Now()
	expiresAt := now.Add(s.tokenTTL)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupExpiredLocked(now)

	s.deployTokens[token] = setupDeployToken{
		ExpiresAt:     expiresAt,
		ClientIP:      normalizeClientIP(clientIP),
		UserAgentHash: hashUserAgent(userAgent),
	}

	return token, expiresAt, nil
}

func (s *setupGuardService) ValidateAndConsumeDeployToken(initialized bool, token, clientIP, userAgent string) error {
	if !s.IsWindowOpen(initialized) {
		return serializer.NewError(serializer.CodeNoPermissionErr, "setup window closed", nil)
	}

	token = strings.TrimSpace(token)
	if token == "" {
		return serializer.NewError(serializer.CodeNoPermissionErr, "missing setup deploy token", nil)
	}

	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupExpiredLocked(now)

	meta, ok := s.deployTokens[token]
	if !ok {
		return serializer.NewError(serializer.CodeNoPermissionErr, "invalid or expired setup deploy token", nil)
	}

	delete(s.deployTokens, token)

	if now.After(meta.ExpiresAt) {
		return serializer.NewError(serializer.CodeNoPermissionErr, "setup deploy token expired", nil)
	}

	if meta.ClientIP != normalizeClientIP(clientIP) {
		return serializer.NewError(serializer.CodeNoPermissionErr, "setup deploy token client mismatch", nil)
	}
	if meta.UserAgentHash != hashUserAgent(userAgent) {
		return serializer.NewError(serializer.CodeNoPermissionErr, "setup deploy token agent mismatch", nil)
	}

	return nil
}

func (s *setupGuardService) RevokeAllTokens() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.deployTokens = make(map[string]setupDeployToken)
}

func (s *setupGuardService) cleanupExpiredLocked(now time.Time) {
	for token, meta := range s.deployTokens {
		if now.After(meta.ExpiresAt) {
			delete(s.deployTokens, token)
		}
	}
}

func generateSetupToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func hashUserAgent(userAgent string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(userAgent)))
	return fmt.Sprintf("%x", sum[:])
}

func normalizeClientIP(clientIP string) string {
	ip := strings.TrimSpace(clientIP)
	if ip == "" {
		return "unknown"
	}
	return ip
}
