package controllers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"headscale-panel/pkg/conf"
	"net/http"
	"net/url"
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

// OIDCStatus godoc
// @Summary Get OIDC login availability
// @Tags auth
// @Produce json
// @Success 200 {object} serializer.Response{data=object}
// @Router /auth/oidc/status [get]
// OIDCStatus returns whether OIDC login is available and provider metadata.
func (a *AuthController) OIDCStatus(c *gin.Context) {
	oidcCfg := services.PanelSettingsService.GetOIDCConfig()
	if oidcCfg != nil && oidcCfg.Enabled && oidcCfg.Issuer != "" && oidcCfg.ClientID != "" {
		serializer.Success(c, gin.H{
			"enabled":       true,
			"builtin":       false,
			"provider_name": "OIDC",
			"issuer":        oidcCfg.Issuer,
		})
		return
	}

	serializer.Success(c, gin.H{
		"enabled":       false,
		"builtin":       false,
		"provider_name": "",
	})
}

// OIDCLogin godoc
// @Summary Initiate OIDC authorization code flow
// @Tags auth
// @Produce json
// @Success 200 {object} serializer.Response{data=object} "redirect_url"
// @Failure 500 {object} serializer.Response
// @Router /auth/oidc/login [get]
// OIDCLogin initiates the OIDC authorization code flow by returning the
// authorization URL the frontend should redirect the user to.
func (a *AuthController) OIDCLogin(c *gin.Context) {
	oidcCfg := services.PanelSettingsService.GetOIDCConfig()
	if oidcCfg == nil || !oidcCfg.Enabled || oidcCfg.Issuer == "" || oidcCfg.ClientID == "" {
		failOIDCAuth(c)
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

	scopes := oidcCfg.Scope
	if len(scopes) == 0 {
		scopes = []string{"openid", "profile", "email"}
	}

	redirectURI, err := oidcRedirectURI()
	if err != nil {
		serializer.Fail(c, serializer.NewError(serializer.CodeInternalError, "invalid OIDC redirect base URL", err))
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	provider, err := oidc.NewProvider(ctx, oidcCfg.Issuer)
	if err != nil {
		failOIDCAuth(c)
		return
	}

	oauthCfg := oauth2.Config{
		ClientID:     oidcCfg.ClientID,
		ClientSecret: oidcCfg.ClientSecret,
		RedirectURL:  redirectURI,
		Endpoint:     provider.Endpoint(),
		Scopes:       scopes,
	}

	authURL := oauthCfg.AuthCodeURL(state)

	serializer.Success(c, gin.H{
		"redirect_url": authURL,
	})
}

// OIDCCallbackQuery is the query parameter struct for OIDCCallback.
type OIDCCallbackQuery struct {
	Code  string `form:"code"  binding:"required"`
	State string `form:"state" binding:"required"`
}

// OIDCCallback godoc
// @Summary Handle OIDC authorization code callback
// @Tags auth
// @Produce json
// @Param code query string true "Authorization code"
// @Param state query string true "State parameter"
// @Success 200 {object} serializer.Response{data=object} "token"
// @Failure 400 {object} serializer.Response
// @Router /auth/oidc/callback [get]
// OIDCCallback handles the authorization code callback from the OIDC provider,
// exchanges the code for tokens, extracts user info, and returns a panel JWT.
func (a *AuthController) OIDCCallback(c *gin.Context) {
	var q OIDCCallbackQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		serializer.FailWithCode(c, serializer.CodeParamErr, "missing code or state parameter")
		return
	}

	oidcStatesMu.Lock()
	expiry, exists := oidcStates[q.State]
	if exists {
		delete(oidcStates, q.State)
	}
	oidcStatesMu.Unlock()

	if !exists || time.Now().After(expiry) {
		serializer.FailWithCode(c, serializer.CodeParamErr, "invalid or expired state parameter")
		return
	}

	oidcCfg := services.PanelSettingsService.GetOIDCConfig()
	if oidcCfg == nil || !oidcCfg.Enabled || oidcCfg.Issuer == "" || oidcCfg.ClientID == "" {
		failOIDCAuth(c)
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	provider, err := oidc.NewProvider(ctx, oidcCfg.Issuer)
	if err != nil {
		failOIDCAuth(c)
		return
	}

	scopes := oidcCfg.Scope
	if len(scopes) == 0 {
		scopes = []string{"openid", "profile", "email"}
	}

	redirectURI, err := oidcRedirectURI()
	if err != nil {
		failOIDCAuth(c)
		return
	}

	oauthCfg := oauth2.Config{
		ClientID:     oidcCfg.ClientID,
		ClientSecret: oidcCfg.ClientSecret,
		RedirectURL:  redirectURI,
		Endpoint:     provider.Endpoint(),
		Scopes:       scopes,
	}

	oauthToken, err := oauthCfg.Exchange(ctx, q.Code)
	if err != nil {
		failOIDCAuth(c)
		return
	}

	rawIDToken, ok := oauthToken.Extra("id_token").(string)
	if !ok {
		failOIDCAuth(c)
		return
	}

	verifier := provider.Verifier(&oidc.Config{ClientID: oidcCfg.ClientID})
	idToken, err := verifier.Verify(ctx, rawIDToken)
	if err != nil {
		failOIDCAuth(c)
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
		failOIDCAuth(c)
		return
	}

	if claims.Sub == "" {
		failOIDCAuth(c)
		return
	}
	if oidcCfg.EmailVerifiedRequired && !claims.EmailVerified {
		failOIDCAuth(c)
		return
	}

	user, err := findOrCreateOIDCUser(oidcCfg, claims.Sub, claims.Email, claims.Name, claims.PreferredUser, claims.Picture)
	if err != nil {
		failOIDCAuth(c)
		return
	}
	if err := services.EnsureUserCanAuthenticate(user); err != nil {
		failOIDCAuth(c)
		return
	}

	token, err := jwt.GenerateToken(user.ID, user.Username, user.GroupID)
	if err != nil {
		failOIDCAuth(c)
		return
	}

	// Set HttpOnly cookie for OIDC authorize flow
	secure := strings.HasPrefix(conf.Conf.System.BaseURL, "https")
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("headscale_panel_token", token, int(conf.Conf.JWT.Expire*3600), "/", "", secure, true)

	serializer.Success(c, gin.H{
		"token": token,
		"user": gin.H{
			"id":                 user.ID,
			"username":           user.Username,
			"email":              user.Email,
			"display_name":       user.DisplayName,
			"group_id":           user.GroupID,
			"guide_tour_seen_at": user.GuideTourSeenAt,
		},
		"permissions": func() []string {
			permissions, _ := services.UserService.GetUserPermissions(user.ID)
			return permissions
		}(),
	})
}

// findOrCreateOIDCUser looks up an existing panel user by OIDC provider+sub,
// falling back to email lookup (with allowlist guard), and finally creating a new user if none exists.
func findOrCreateOIDCUser(oidcCfg *services.OIDCSettingsPayload, sub, email, name, preferredUsername, picture string) (*model.User, error) {
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
			if err := model.DB.Model(&user).Updates(updates).Error; err != nil {
				return nil, fmt.Errorf("failed to update oidc user profile: %w", err)
			}
		}
		return &user, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	hasAllowlist := oidcCfg != nil && (len(oidcCfg.AllowedUsers) > 0 || len(oidcCfg.AllowedDomains) > 0 || len(oidcCfg.AllowedGroups) > 0)
	if hasAllowlist {
		allowed := false
		if oidcCfg != nil {
			for _, u := range oidcCfg.AllowedUsers {
				if strings.EqualFold(u, email) {
					allowed = true
					break
				}
			}
			if !allowed {
				parts := strings.SplitN(email, "@", 2)
				if len(parts) == 2 {
					domain := strings.ToLower(parts[1])
					for _, d := range oidcCfg.AllowedDomains {
						if strings.ToLower(d) == domain {
							allowed = true
							break
						}
					}
				}
			}
		}
		if !allowed {
			return nil, errors.New("oidc access denied by allowlist")
		}
	}

	// Try 2: Find by email (link existing non-local account)
	if email != "" {
		err = model.DB.Preload("Group").
			Where("email = ? AND email != ''", email).
			First(&user).Error
		if err == nil && user.Provider != "" && user.Provider != "local" {
			// Link the OIDC identity to the existing account
			if err := model.DB.Model(&user).Updates(map[string]interface{}{
				"provider":        "oidc",
				"provider_id":     sub,
				"profile_pic_url": picture,
			}).Error; err != nil {
				return nil, fmt.Errorf("failed to link oidc account: %w", err)
			}
			if name != "" && user.DisplayName == "" {
				if err := model.DB.Model(&user).Update("display_name", name).Error; err != nil {
					return nil, fmt.Errorf("failed to update display name: %w", err)
				}
			}
			return &user, nil
		}
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}

	// Try 3: Create a new user
	// Derive a username from preferred_username, name, or email
	username := deriveUsername(preferredUsername, name, email, sub)

	// Ensure username uniqueness
	username, err = ensureUniqueUsername(username)
	if err != nil {
		return nil, err
	}

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
	if err := model.DB.Preload("Group").First(&newUser, newUser.ID).Error; err != nil {
		return nil, fmt.Errorf("failed to reload created user: %w", err)
	}
	return &newUser, nil
}

func failOIDCAuth(c *gin.Context) {
	serializer.Fail(c, serializer.NewError(serializer.CodeNoPermissionErr, "OIDC authentication failed", nil))
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
func ensureUniqueUsername(base string) (string, error) {
	candidate := base
	for i := 1; i <= 100; i++ {
		var count int64
		if err := model.DB.Model(&model.User{}).Where("username = ?", candidate).Count(&count).Error; err != nil {
			return "", fmt.Errorf("failed to check username uniqueness: %w", err)
		}
		if count == 0 {
			return candidate, nil
		}
		candidate = fmt.Sprintf("%s_%d", base, i)
	}
	return "", fmt.Errorf("failed to find unique username after 100 attempts for base %q", base)
}

func oidcRedirectURI() (string, error) {
	baseURL := strings.TrimSpace(conf.Conf.System.BaseURL)
	if baseURL == "" {
		return "", errors.New("system.base_url is empty")
	}

	parsed, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("invalid system.base_url: %w", err)
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("system.base_url must be absolute")
	}

	return strings.TrimRight(baseURL, "/") + "/login", nil
}

// Ensure the controller satisfies any interface at compile time (optional guard).
var _ = (*AuthController)(nil)
