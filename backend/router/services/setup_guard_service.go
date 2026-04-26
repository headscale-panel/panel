package services

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"headscale-panel/pkg/unifyerror"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	setupTokenPurposeInit   = "init"
	setupTokenPurposeDeploy = "deploy"
)

type setupGuardService struct {
	mu          sync.Mutex
	tokenTTL    time.Duration
	setupTokens map[string]setupTokenMeta
}

type setupTokenMeta struct {
	Purpose       string
	ExpiresAt     time.Time
	ClientIP      string
	UserAgentHash string
}

var SetupGuardService = newSetupGuardService()

func newSetupGuardService() *setupGuardService {
	return &setupGuardService{
		tokenTTL:    2 * time.Minute,
		setupTokens: make(map[string]setupTokenMeta),
	}
}

func (s *setupGuardService) IssueInitToken(windowOpen bool, clientIP, userAgent string) (string, time.Time, error) {
	return s.issueToken(windowOpen, setupTokenPurposeInit, clientIP, userAgent)
}

func (s *setupGuardService) IssueDeployToken(windowOpen bool, clientIP, userAgent string) (string, time.Time, error) {
	return s.issueToken(windowOpen, setupTokenPurposeDeploy, clientIP, userAgent)
}

func (s *setupGuardService) ValidateAndConsumeInitToken(windowOpen bool, token, clientIP, userAgent string) error {
	return s.validateAndConsumeToken(windowOpen, setupTokenPurposeInit, token, clientIP, userAgent)
}

func (s *setupGuardService) ValidateAndConsumeDeployToken(windowOpen bool, token, clientIP, userAgent string) error {
	return s.validateAndConsumeToken(windowOpen, setupTokenPurposeDeploy, token, clientIP, userAgent)
}

func (s *setupGuardService) RevokeAllTokens() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.setupTokens = make(map[string]setupTokenMeta)
}

func (s *setupGuardService) issueToken(windowOpen bool, purpose, clientIP, userAgent string) (string, time.Time, error) {
	if !windowOpen {
		return "", time.Time{}, unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, "setup window closed")
	}

	token, err := generateSetupToken()
	if err != nil {
		return "", time.Time{}, unifyerror.ServerError(err)
	}

	now := time.Now()
	expiresAt := now.Add(s.tokenTTL)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupExpiredLocked(now)

	s.setupTokens[token] = setupTokenMeta{
		Purpose:       purpose,
		ExpiresAt:     expiresAt,
		ClientIP:      normalizeClientIP(clientIP),
		UserAgentHash: hashUserAgent(userAgent),
	}

	return token, expiresAt, nil
}

func (s *setupGuardService) validateAndConsumeToken(windowOpen bool, purpose, token, clientIP, userAgent string) error {
	if !windowOpen {
		return unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, "setup window closed")
	}

	token = strings.TrimSpace(token)
	if token == "" {
		return unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, "missing setup token")
	}

	now := time.Now()

	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupExpiredLocked(now)

	meta, ok := s.setupTokens[token]
	if !ok {
		return unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, "invalid or expired setup token")
	}
	delete(s.setupTokens, token)

	if meta.Purpose != purpose {
		return unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, "invalid setup token purpose")
	}
	if !now.Before(meta.ExpiresAt) {
		return unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, "setup token expired")
	}
	if meta.ClientIP != normalizeClientIP(clientIP) {
		return unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, "setup token client mismatch")
	}
	if meta.UserAgentHash != hashUserAgent(userAgent) {
		return unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, "setup token agent mismatch")
	}

	return nil
}

func (s *setupGuardService) cleanupExpiredLocked(now time.Time) {
	for token, meta := range s.setupTokens {
		if !now.Before(meta.ExpiresAt) {
			delete(s.setupTokens, token)
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
