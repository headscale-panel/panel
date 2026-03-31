package services

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"headscale-panel/model"
	"headscale-panel/pkg/conf"
	"math/big"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type oidcService struct {
	privateKey *rsa.PrivateKey
	codes      map[string]authCodeData // code -> data
	mu         sync.Mutex
}

type authCodeData struct {
	UserID      uint
	ClientID    string
	RedirectURI string
	Nonce       string
	Scope       string
	ExpiresAt   time.Time
}

var OIDCService = &oidcService{
	codes: make(map[string]authCodeData),
}

func (s *oidcService) Init() error {
	// Load or generate persisted RSA signing key
	key, err := s.loadOrCreatePrivateKey()
	if err != nil {
		return fmt.Errorf("failed to initialize OIDC signing key: %w", err)
	}
	s.privateKey = key

	// Validate existing clients to prevent insecure defaults and wildcard redirect.
	var clients []model.OauthClient
	if err := model.DB.Find(&clients).Error; err != nil {
		return err
	}
	for i := range clients {
		client := &clients[i]
		if err := migrateLegacyOAuthClientSecret(client); err != nil {
			return fmt.Errorf("oidc client %q secret migration failed: %w", client.ClientID, err)
		}
		if !isSafeOIDCClient(*client) {
			return fmt.Errorf("oidc client %q has insecure secret or invalid redirect_uris", client.ClientID)
		}
	}

	return nil
}

func (s *oidcService) GenerateAuthCode(userID uint, clientID, redirectURI, nonce, scope string) (string, error) {
	code := make([]byte, 32)
	if _, err := rand.Read(code); err != nil {
		return "", fmt.Errorf("failed to generate auth code: %w", err)
	}
	codeStr := base64.URLEncoding.EncodeToString(code)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupExpiredCodesLocked(time.Now())
	s.codes[codeStr] = authCodeData{
		UserID:      userID,
		ClientID:    clientID,
		RedirectURI: redirectURI,
		Nonce:       nonce,
		Scope:       scope,
		ExpiresAt:   time.Now().Add(10 * time.Minute),
	}
	return codeStr, nil
}

// ExchangeCode validates an authorization code and returns id_token, access_token, refresh_token.
func (s *oidcService) ExchangeCode(code, clientID, clientSecret string) (string, string, string, error) {
	var client model.OauthClient
	if err := model.DB.Where("client_id = ?", clientID).First(&client).Error; err != nil {
		return "", "", "", errors.New("invalid client")
	}
	validSecret, err := verifyOAuthClientSecret(&client, clientSecret)
	if err != nil || !validSecret {
		return "", "", "", errors.New("invalid client")
	}
	if !isSafeOIDCClient(client) {
		return "", "", "", errors.New("invalid client")
	}

	s.mu.Lock()
	s.cleanupExpiredCodesLocked(time.Now())
	data, ok := s.codes[code]
	if ok {
		delete(s.codes, code) // Consume code
	}
	s.mu.Unlock()

	if !ok {
		return "", "", "", errors.New("invalid code")
	}
	if time.Now().After(data.ExpiresAt) {
		return "", "", "", errors.New("code expired")
	}
	if data.ClientID != clientID {
		return "", "", "", errors.New("client mismatch")
	}

	// Get user
	var user model.User
	if err := model.DB.Preload("Group").First(&user, data.UserID).Error; err != nil {
		return "", "", "", errors.New("user not found")
	}

	// Generate ID Token
	idToken, err := s.generateIDToken(user, clientID, data.Nonce)
	if err != nil {
		return "", "", "", err
	}

	// Generate Access Token (proper JWT)
	accessToken, err := s.generateAccessToken(user, clientID, data.Scope)
	if err != nil {
		return "", "", "", err
	}

	// Generate Refresh Token
	refreshToken, err := s.generateRefreshToken(user, clientID)
	if err != nil {
		return "", "", "", err
	}

	return idToken, accessToken, refreshToken, nil
}

// RefreshTokens validates a refresh token and returns new id_token, access_token, refresh_token.
func (s *oidcService) RefreshTokens(refreshTokenStr, clientID, clientSecret string) (string, string, string, error) {
	var client model.OauthClient
	if err := model.DB.Where("client_id = ?", clientID).First(&client).Error; err != nil {
		return "", "", "", errors.New("invalid client")
	}
	validSecret, err := verifyOAuthClientSecret(&client, clientSecret)
	if err != nil || !validSecret {
		return "", "", "", errors.New("invalid client")
	}
	if !isSafeOIDCClient(client) {
		return "", "", "", errors.New("invalid client")
	}

	// Parse and validate the refresh token
	claims, err := s.parseToken(refreshTokenStr)
	if err != nil {
		return "", "", "", errors.New("invalid refresh token")
	}

	tokenType, _ := claims["type"].(string)
	if tokenType != "refresh" {
		return "", "", "", errors.New("not a refresh token")
	}

	sub, _ := claims["sub"].(string)
	if sub == "" {
		return "", "", "", errors.New("invalid token subject")
	}

	// Find user
	var user model.User
	if err := model.DB.Preload("Group").Where("id = ?", sub).First(&user).Error; err != nil {
		return "", "", "", errors.New("user not found")
	}

	// Generate new tokens
	idToken, err := s.generateIDToken(user, clientID, "")
	if err != nil {
		return "", "", "", err
	}

	accessToken, err := s.generateAccessToken(user, clientID, "openid profile email")
	if err != nil {
		return "", "", "", err
	}

	newRefreshToken, err := s.generateRefreshToken(user, clientID)
	if err != nil {
		return "", "", "", err
	}

	return idToken, accessToken, newRefreshToken, nil
}

// ValidateAccessToken validates an access token and returns its claims.
func (s *oidcService) ValidateAccessToken(tokenStr string) (jwt.MapClaims, error) {
	claims, err := s.parseToken(tokenStr)
	if err != nil {
		return nil, err
	}

	tokenType, _ := claims["type"].(string)
	if tokenType != "access" {
		return nil, errors.New("not an access token")
	}

	return claims, nil
}

// GetUserInfoBySub retrieves user info by subject identifier (user ID string).
func (s *oidcService) GetUserInfoBySub(sub string) (map[string]interface{}, error) {
	var user model.User
	if err := model.DB.Preload("Group").Where("id = ?", sub).First(&user).Error; err != nil {
		return nil, errors.New("user not found")
	}

	displayName := user.DisplayName
	if displayName == "" {
		displayName = user.Username
	}

	info := map[string]interface{}{
		"sub":                fmt.Sprintf("%d", user.ID),
		"name":               displayName,
		"preferred_username": user.Username,
		"email":              user.Email,
		"email_verified":     true,
	}
	if user.ProfilePicURL != "" {
		info["picture"] = user.ProfilePicURL
	}

	return info, nil
}

func (s *oidcService) generateIDToken(user model.User, clientID, nonce string) (string, error) {
	now := time.Now()
	displayName := user.DisplayName
	if displayName == "" {
		displayName = user.Username
	}

	claims := jwt.MapClaims{
		"iss":                conf.Conf.System.BaseURL,
		"sub":                fmt.Sprintf("%d", user.ID),
		"aud":                clientID,
		"exp":                now.Add(1 * time.Hour).Unix(),
		"iat":                now.Unix(),
		"name":               displayName,
		"preferred_username": user.Username,
		"email":              user.Email,
		"email_verified":     true,
	}
	if nonce != "" {
		claims["nonce"] = nonce
	}
	if user.ProfilePicURL != "" {
		claims["picture"] = user.ProfilePicURL
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = "1"
	return token.SignedString(s.privateKey)
}

func (s *oidcService) generateAccessToken(user model.User, clientID, scope string) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"iss":   conf.Conf.System.BaseURL,
		"sub":   fmt.Sprintf("%d", user.ID),
		"aud":   clientID,
		"exp":   now.Add(1 * time.Hour).Unix(),
		"iat":   now.Unix(),
		"type":  "access",
		"scope": scope,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = "1"
	return token.SignedString(s.privateKey)
}

func (s *oidcService) generateRefreshToken(user model.User, clientID string) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"iss":  conf.Conf.System.BaseURL,
		"sub":  fmt.Sprintf("%d", user.ID),
		"aud":  clientID,
		"exp":  now.Add(30 * 24 * time.Hour).Unix(),
		"iat":  now.Unix(),
		"type": "refresh",
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = "1"
	return token.SignedString(s.privateKey)
}

// parseToken parses and validates a JWT token signed by this service.
func (s *oidcService) parseToken(tokenStr string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return &s.privateKey.PublicKey, nil
	})
	if err != nil {
		return nil, err
	}
	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		return claims, nil
	}
	return nil, errors.New("invalid token")
}

func (s *oidcService) GetJWKS() (interface{}, error) {
	pub := s.privateKey.PublicKey
	return map[string]interface{}{
		"keys": []map[string]interface{}{
			{
				"kty": "RSA",
				"alg": "RS256",
				"use": "sig",
				"kid": "1",
				"n":   base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
				"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pub.E)).Bytes()),
			},
		},
	}, nil
}

func (s *oidcService) ValidateRedirectURI(clientID, redirectURI string) bool {
	var client model.OauthClient
	if err := model.DB.Where("client_id = ?", clientID).First(&client).Error; err != nil {
		return false
	}
	if !isSafeOIDCClient(client) {
		return false
	}

	validRedirect, err := validateRedirectURI(redirectURI)
	if err != nil {
		return false
	}

	normalizedRedirectURIs, err := normalizeRedirectURIs(client.RedirectURIs)
	if err != nil {
		return false
	}
	uris := strings.Split(normalizedRedirectURIs, ",")
	for _, u := range uris {
		if strings.TrimSpace(u) == validRedirect {
			return true
		}
	}
	return false
}

func (s *oidcService) cleanupExpiredCodesLocked(now time.Time) {
	for code, data := range s.codes {
		if !now.Before(data.ExpiresAt) {
			delete(s.codes, code)
		}
	}
}

func isInsecureOIDCClientSecret(secret string) bool {
	normalized := strings.TrimSpace(strings.ToLower(secret))
	return normalized == "" || normalized == "headscale-secret"
}

func isSafeOIDCClient(client model.OauthClient) bool {
	if strings.TrimSpace(client.ClientSecretHash) == "" {
		legacySecret := strings.TrimSpace(client.ClientSecret)
		if legacySecret == "" || isInsecureOIDCClientSecret(legacySecret) {
			return false
		}
	}
	if strings.TrimSpace(client.ClientSecretHash) == "" && strings.TrimSpace(client.ClientSecret) == "" {
		return false
	}
	_, err := normalizeRedirectURIs(client.RedirectURIs)
	return err == nil
}

func normalizeRedirectURIs(redirectURIs string) (string, error) {
	if strings.TrimSpace(redirectURIs) == "" {
		return "", errors.New("redirect URIs cannot be empty")
	}

	parts := strings.Split(redirectURIs, ",")
	normalized := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))

	for _, part := range parts {
		uri, err := validateRedirectURI(part)
		if err != nil {
			return "", err
		}
		if _, ok := seen[uri]; ok {
			continue
		}
		seen[uri] = struct{}{}
		normalized = append(normalized, uri)
	}

	if len(normalized) == 0 {
		return "", errors.New("redirect URIs cannot be empty")
	}

	sort.Strings(normalized)
	return strings.Join(normalized, ","), nil
}

func validateRedirectURI(uri string) (string, error) {
	normalized := strings.TrimSpace(uri)
	if normalized == "" {
		return "", errors.New("redirect URI cannot be empty")
	}
	if strings.Contains(normalized, "*") {
		return "", errors.New("wildcard redirect URI is not allowed")
	}
	if strings.Contains(normalized, "#") {
		return "", fmt.Errorf("redirect URI must not contain fragment: %s", normalized)
	}

	parsed, err := url.ParseRequestURI(normalized)
	if err != nil {
		return "", fmt.Errorf("invalid redirect URI: %s", normalized)
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("redirect URI must be absolute: %s", normalized)
	}
	return normalized, nil
}

// signingKeyPath returns the file path for the persisted OIDC signing key.
// It stores the key alongside the application database so backups naturally
// include both data and key material.
func (s *oidcService) signingKeyPath() string {
	dbPath := conf.Conf.DB.Path
	if dbPath == "" {
		dbPath = "headscale-panel.db"
	}
	return filepath.Join(filepath.Dir(dbPath), "oidc_signing_key.pem")
}

// loadOrCreatePrivateKey loads an existing RSA private key from disk, or
// generates a new 2048-bit key and persists it in PEM format with 0600
// permissions. This ensures OIDC tokens remain valid across restarts.
func (s *oidcService) loadOrCreatePrivateKey() (*rsa.PrivateKey, error) {
	keyPath := s.signingKeyPath()

	// Try loading existing key
	pemData, err := os.ReadFile(keyPath)
	if err == nil {
		block, _ := pem.Decode(pemData)
		if block == nil {
			return nil, fmt.Errorf("invalid PEM data in %s", keyPath)
		}
		key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("failed to parse private key from %s: %w", keyPath, err)
		}
		return key, nil
	}

	if !os.IsNotExist(err) {
		return nil, fmt.Errorf("failed to read signing key %s: %w", keyPath, err)
	}

	// Generate new key
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("failed to generate RSA key: %w", err)
	}

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(keyPath), 0700); err != nil {
		return nil, fmt.Errorf("failed to create key directory: %w", err)
	}

	// Persist
	pemBlock := &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	}
	if err := os.WriteFile(keyPath, pem.EncodeToMemory(pemBlock), 0600); err != nil {
		return nil, fmt.Errorf("failed to write signing key to %s: %w", keyPath, err)
	}

	return key, nil
}
