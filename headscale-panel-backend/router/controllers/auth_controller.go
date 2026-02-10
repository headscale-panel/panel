package controllers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"headscale-panel/model"
	"headscale-panel/pkg/utils/jwt"
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"

	oidc "github.com/coreos/go-oidc/v3/oidc"
	"github.com/gin-gonic/gin"
	"golang.org/x/oauth2"
	"gorm.io/gorm"
)

type AuthController struct{}

func NewAuthController() *AuthController {
	return &AuthController{}
}

// In-memory state storage for OIDC login flow
var (
	oidcStates   = make(map[string]time.Time)
	oidcStatesMu sync.Mutex
)

// cleanExpiredStates removes expired entries from the state map.
func cleanExpiredStates() {
	now := time.Now()
	for k, v := range oidcStates {
		if now.After(v) {
			delete(oidcStates, k)
		}
	}
}

// OIDCStatus returns whether OIDC login is available and provider metadata.
func (a *AuthController) OIDCStatus(c *gin.Context) {
	hsConfig, err := services.HeadscaleConfigService.GetConfig()
	if err != nil {
		serializer.Success(c, gin.H{
			"enabled":       false,
			"builtin":       false,
			"provider_name": "",
		})
		return
	}

	if hsConfig.OIDC.Issuer != "" && hsConfig.OIDC.ClientID != "" {
		serializer.Success(c, gin.H{
			"enabled":       true,
			"builtin":       false,
			"provider_name": "OIDC",
			"issuer":        hsConfig.OIDC.Issuer,
		})
		return
	}

	serializer.Success(c, gin.H{
		"enabled":       false,
		"builtin":       false,
		"provider_name": "",
	})
}

// OIDCLogin initiates the OIDC authorization code flow by returning the
// authorization URL the frontend should redirect the user to.
func (a *AuthController) OIDCLogin(c *gin.Context) {
	hsConfig, err := services.HeadscaleConfigService.GetConfig()
	if err != nil {
		serializer.Fail(c, fmt.Errorf("failed to read OIDC config: %w", err))
		return
	}

	if hsConfig.OIDC.Issuer == "" || hsConfig.OIDC.ClientID == "" {
		serializer.FailWithCode(c, serializer.CodeParamErr, "OIDC is not configured")
		return
	}

	// 32 random bytes → 64 hex chars
	stateBytes := make([]byte, 32)
	if _, err := rand.Read(stateBytes); err != nil {
		serializer.Fail(c, fmt.Errorf("failed to generate random state: %w", err))
		return
	}
	state := hex.EncodeToString(stateBytes)

	oidcStatesMu.Lock()
	cleanExpiredStates()
	oidcStates[state] = time.Now().Add(10 * time.Minute)
	oidcStatesMu.Unlock()

	scopes := hsConfig.OIDC.Scope
	if len(scopes) == 0 {
		scopes = []string{"openid", "profile", "email"}
	}

	// Derive redirect_uri from the request origin
	origin := c.GetHeader("Origin")
	if origin == "" {
		referer := c.GetHeader("Referer")
		if referer != "" {
			// Extract scheme + host from Referer
			parts := strings.SplitN(referer, "//", 2)
			if len(parts) == 2 {
				hostPart := strings.SplitN(parts[1], "/", 2)
				origin = parts[0] + "//" + hostPart[0]
			}
		}
	}
	if origin == "" {
		origin = fmt.Sprintf("%s://%s", schemeFromRequest(c), c.Request.Host)
	}
	redirectURI := origin + "/login"

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	provider, err := oidc.NewProvider(ctx, hsConfig.OIDC.Issuer)
	if err != nil {
		serializer.Fail(c, fmt.Errorf("OIDC discovery failed: %w", err))
		return
	}

	oauthCfg := oauth2.Config{
		ClientID:     hsConfig.OIDC.ClientID,
		ClientSecret: hsConfig.OIDC.ClientSecret,
		RedirectURL:  redirectURI,
		Endpoint:     provider.Endpoint(),
		Scopes:       scopes,
	}

	authURL := oauthCfg.AuthCodeURL(state)

	serializer.Success(c, gin.H{
		"redirect_url": authURL,
	})
}

// OIDCCallback handles the authorization code callback from the OIDC provider,
// exchanges the code for tokens, extracts user info, and returns a panel JWT.
func (a *AuthController) OIDCCallback(c *gin.Context) {
	code := c.Query("code")
	state := c.Query("state")

	if code == "" || state == "" {
		serializer.FailWithCode(c, serializer.CodeParamErr, "missing code or state parameter")
		return
	}

	oidcStatesMu.Lock()
	expiry, exists := oidcStates[state]
	if exists {
		delete(oidcStates, state)
	}
	oidcStatesMu.Unlock()

	if !exists || time.Now().After(expiry) {
		serializer.FailWithCode(c, serializer.CodeParamErr, "invalid or expired state parameter")
		return
	}

	hsConfig, err := services.HeadscaleConfigService.GetConfig()
	if err != nil {
		serializer.Fail(c, fmt.Errorf("failed to read OIDC config: %w", err))
		return
	}

	if hsConfig.OIDC.Issuer == "" || hsConfig.OIDC.ClientID == "" {
		serializer.FailWithCode(c, serializer.CodeParamErr, "OIDC is not configured")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	provider, err := oidc.NewProvider(ctx, hsConfig.OIDC.Issuer)
	if err != nil {
		serializer.Fail(c, fmt.Errorf("OIDC discovery failed: %w", err))
		return
	}

	scopes := hsConfig.OIDC.Scope
	if len(scopes) == 0 {
		scopes = []string{"openid", "profile", "email"}
	}

	// Reconstruct redirect_uri
	origin := c.GetHeader("Origin")
	if origin == "" {
		referer := c.GetHeader("Referer")
		if referer != "" {
			parts := strings.SplitN(referer, "//", 2)
			if len(parts) == 2 {
				hostPart := strings.SplitN(parts[1], "/", 2)
				origin = parts[0] + "//" + hostPart[0]
			}
		}
	}
	if origin == "" {
		origin = fmt.Sprintf("%s://%s", schemeFromRequest(c), c.Request.Host)
	}
	redirectURI := origin + "/login"

	oauthCfg := oauth2.Config{
		ClientID:     hsConfig.OIDC.ClientID,
		ClientSecret: hsConfig.OIDC.ClientSecret,
		RedirectURL:  redirectURI,
		Endpoint:     provider.Endpoint(),
		Scopes:       scopes,
	}

	oauthToken, err := oauthCfg.Exchange(ctx, code)
	if err != nil {
		serializer.Fail(c, fmt.Errorf("failed to exchange authorization code: %w", err))
		return
	}

	rawIDToken, ok := oauthToken.Extra("id_token").(string)
	if !ok {
		serializer.FailWithCode(c, serializer.CodeInternalError, "no id_token in token response")
		return
	}

	verifier := provider.Verifier(&oidc.Config{ClientID: hsConfig.OIDC.ClientID})
	idToken, err := verifier.Verify(ctx, rawIDToken)
	if err != nil {
		serializer.Fail(c, fmt.Errorf("failed to verify ID token: %w", err))
		return
	}

	var claims struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
		PreferredUser string `json:"preferred_username"`
		Picture       string `json:"picture"`
	}
	if err := idToken.Claims(&claims); err != nil {
		serializer.Fail(c, fmt.Errorf("failed to parse ID token claims: %w", err))
		return
	}

	if claims.Sub == "" {
		serializer.FailWithCode(c, serializer.CodeParamErr, "ID token missing sub claim")
		return
	}

	user, err := findOrCreateOIDCUser(claims.Sub, claims.Email, claims.Name, claims.PreferredUser, claims.Picture)
	if err != nil {
		serializer.Fail(c, fmt.Errorf("failed to find or create user: %w", err))
		return
	}

	token, err := jwt.GenerateToken(user.ID, user.Username, user.GroupID)
	if err != nil {
		serializer.Fail(c, fmt.Errorf("failed to generate token: %w", err))
		return
	}

	serializer.Success(c, gin.H{
		"token": token,
		"user": gin.H{
			"id":           user.ID,
			"username":     user.Username,
			"email":        user.Email,
			"display_name": user.DisplayName,
			"group_id":     user.GroupID,
		},
	})
}

// findOrCreateOIDCUser looks up an existing panel user by OIDC provider+sub,
// falling back to email lookup, and finally creating a new user if none exists.
func findOrCreateOIDCUser(sub, email, name, preferredUsername, picture string) (*model.User, error) {
	// Try 1: Find by provider + provider_id (sub)
	var user model.User
	err := model.DB.Preload("Group").
		Where("provider = ? AND provider_id = ?", "oidc", sub).
		First(&user).Error
	if err == nil {
		// Update profile fields if they changed
		updates := map[string]interface{}{}
		if email != "" && user.Email != email {
			updates["email"] = email
		}
		if name != "" && user.DisplayName != name {
			updates["display_name"] = name
		}
		if picture != "" && user.ProfilePicURL != picture {
			updates["profile_pic_url"] = picture
		}
		if len(updates) > 0 {
			model.DB.Model(&user).Updates(updates)
		}
		return &user, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	// Try 2: Find by email (link existing account)
	if email != "" {
		err = model.DB.Preload("Group").
			Where("email = ? AND email != ''", email).
			First(&user).Error
		if err == nil {
			// Link the OIDC identity to the existing account
			model.DB.Model(&user).Updates(map[string]interface{}{
				"provider":        "oidc",
				"provider_id":     sub,
				"profile_pic_url": picture,
			})
			if name != "" && user.DisplayName == "" {
				model.DB.Model(&user).Update("display_name", name)
			}
			return &user, nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}

	// Try 3: Create a new user
	// Derive a username from preferred_username, name, or email
	username := deriveUsername(preferredUsername, name, email, sub)

	// Ensure username uniqueness
	username = ensureUniqueUsername(username)

	// Look up the "User" group (default group for OIDC users)
	var userGroup model.Group
	if err := model.DB.Where("name = ?", "User").First(&userGroup).Error; err != nil {
		return nil, fmt.Errorf("default User group not found: %w", err)
	}

	newUser := model.User{
		Username:      username,
		Email:         email,
		DisplayName:   name,
		Provider:      "oidc",
		ProviderID:    sub,
		ProfilePicURL: picture,
		GroupID:       userGroup.ID,
		HeadscaleName: username,
	}

	if err := model.DB.Create(&newUser).Error; err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	// Reload with group
	model.DB.Preload("Group").First(&newUser, newUser.ID)
	return &newUser, nil
}

// deriveUsername picks the best available username string from OIDC claims.
func deriveUsername(preferredUsername, name, email, sub string) string {
	if preferredUsername != "" {
		return sanitizeUsername(preferredUsername)
	}
	if email != "" {
		parts := strings.SplitN(email, "@", 2)
		if len(parts) > 0 && parts[0] != "" {
			return sanitizeUsername(parts[0])
		}
	}
	if name != "" {
		return sanitizeUsername(strings.ReplaceAll(name, " ", "_"))
	}
	// Last resort: use a portion of the sub
	if len(sub) > 16 {
		return "oidc_" + sub[:16]
	}
	return "oidc_" + sub
}

// sanitizeUsername removes characters that are problematic for usernames.
func sanitizeUsername(s string) string {
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' || r == '.' {
			b.WriteRune(r)
		}
	}
	result := b.String()
	if result == "" {
		return "oidc_user"
	}
	return result
}

// ensureUniqueUsername appends a numeric suffix if the username is already taken.
func ensureUniqueUsername(base string) string {
	candidate := base
	for i := 1; ; i++ {
		var count int64
		model.DB.Model(&model.User{}).Where("username = ?", candidate).Count(&count)
		if count == 0 {
			return candidate
		}
		candidate = fmt.Sprintf("%s_%d", base, i)
	}
}

// schemeFromRequest infers the URL scheme from the request.
func schemeFromRequest(c *gin.Context) string {
	if c.Request.TLS != nil {
		return "https"
	}
	if proto := c.GetHeader("X-Forwarded-Proto"); proto != "" {
		return proto
	}
	if c.Request.URL.Scheme != "" {
		return c.Request.URL.Scheme
	}
	return "http"
}

// Ensure the controller satisfies any interface at compile time (optional guard).
var _ = (*AuthController)(nil)

// Suppress unused import warnings — the http package is used implicitly via oauth2.
var _ = http.StatusOK
