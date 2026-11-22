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
	"headscale-panel/internal/audit"
	"headscale-panel/model"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/middleware"
	"headscale-panel/router/services"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gin-gonic/gin"
	"golang.org/x/oauth2"
)

// AuthController handles the panel's own sign-in flows.
//
// It knows about exactly one OIDC relationship: the panel as a *client* of some
// external provider. The panel acting as a provider lives in IdPController, and
// the two never share state.
type AuthController struct{}

// NewAuthController builds the controller.
func NewAuthController() *AuthController {
	return &AuthController{}
}

const ssoStateCookieName = "panel_sso_state"

type ssoStateEntry struct {
	verifier string
	nonce    string
	binding  string
	expiry   time.Time
}

var (
	ssoStates   = map[string]ssoStateEntry{}
	ssoStatesMu sync.Mutex
)

func cleanExpiredSSOStates(now time.Time) {
	for key, entry := range ssoStates {
		if now.After(entry.expiry) {
			delete(ssoStates, key)
		}
	}
}

// PasswordLoginRequest is the sign-in payload.
type PasswordLoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	TOTPCode string `json:"totp_code"`
}

// Login godoc
// @Summary Sign in with a password
// @Tags auth
// @Accept json
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Failure 400 {object} unifyerror.Response
// @Router /auth/login [post]
func (a *AuthController) Login(c *gin.Context) {
	var req PasswordLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	result, err := services.LoginWithPassword(c.Request.Context(), services.LoginRequest{
		Username: req.Username,
		Password: req.Password,
		TOTPCode: req.TOTPCode,
	})
	if err != nil {
		// Record the attempt before returning. A failed login is the single most
		// useful audit row during an incident, and it lives outside the
		// authenticated group so nothing else writes it.
		middleware.RecordAuthEvent(c, model.DB, audit.ActionLogin, req.Username, 0, false, err.Error())
		unifyerror.Fail(c, err)
		return
	}

	middleware.RecordAuthEvent(c, model.DB, audit.ActionLogin, result.Account.Username, result.Account.ID, true, "")

	unifyerror.Success(c, gin.H{
		"token":       result.Token,
		"account":     services.BuildMeViewFromAccount(result.Account, result.Permissions),
		"permissions": result.Permissions,
	})
}

// Logout godoc
// @Summary Sign out
// @Tags auth
// @Produce json
// @Security BearerAuth
// @Router /auth/logout [post]
// Logout revokes active sessions for the account and clears the cookie.
func (a *AuthController) Logout(c *gin.Context) {
	userID := c.GetUint("userID")
	if userID != 0 {
		_ = services.Accounts.IncrementSessionVersion(userID)
	}

	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("headscale_panel_token", "", -1, "/", "", usesHTTPS(), true)

	middleware.RecordAuthEvent(c, model.DB, audit.ActionLogout, c.GetString("username"), userID, true, "")

	unifyerror.Success(c, gin.H{"message": "signed out"})
}

// RegisterRequest is the self-service signup payload.
type RegisterRequest struct {
	Username    string `json:"username" binding:"required"`
	Password    string `json:"password" binding:"required"`
	Email       string `json:"email" binding:"required"`
	DisplayName string `json:"display_name"`
}

// Register godoc
// @Summary Self-service signup
// @Tags auth
// @Accept json
// @Produce json
// @Router /auth/register [post]
// Register creates an account in the default role.
//
// Registration is closed before the panel is initialized: the first account is
// the administrator and must be created through the setup flow, where the
// bootstrap credential is checked.
func (a *AuthController) Register(c *gin.Context) {
	canRegister, err := services.SetupStateService.CanRegister()
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	if !canRegister {
		unifyerror.Fail(c, unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden,
			"self-service registration is disabled"))
		return
	}

	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	roleID, roleErr := services.DefaultRoleID()
	if roleErr != nil {
		unifyerror.Fail(c, roleErr)
		return
	}

	if _, createErr := services.Accounts.Create(services.AccountCreateInput{
		Username:    req.Username,
		Password:    req.Password,
		Email:       req.Email,
		DisplayName: req.DisplayName,
		RoleID:      roleID,
	}); createErr != nil {
		unifyerror.Fail(c, services.MapAccountError(createErr))
		return
	}

	unifyerror.Success(c, gin.H{"message": "account created"})
}

// AuthStatus godoc
// @Summary Report which sign-in methods are available
// @Tags auth
// @Produce json
// @Router /auth/status [get]
// AuthStatus lets the login page decide what to render without guessing.
func (a *AuthController) AuthStatus(c *gin.Context) {
	unifyerror.Success(c, gin.H{
		"password_login": true,
		"panel_sso":      services.PanelSSOService.Enabled(),
		"registration":   registrationEnabled(),
	})
}

// PanelSSOLogin godoc
// @Summary Start the panel SSO flow
// @Tags auth
// @Router /auth/panel-sso/login [get]
func (a *AuthController) PanelSSOLogin(c *gin.Context) {
	cfg := services.PanelSSOService.Config()
	if cfg == nil {
		unifyerror.Fail(c, unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound,
			"panel SSO is not enabled"))
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	provider, err := oidc.NewProvider(ctx, cfg.Issuer)
	if err != nil {
		unifyerror.Fail(c, unifyerror.New(http.StatusBadGateway, unifyerror.CodeServerErr,
			"cannot reach the identity provider"))
		return
	}

	state, stateErr := randomURLSafe(24)
	if stateErr != nil {
		unifyerror.Fail(c, unifyerror.ServerError(stateErr))
		return
	}
	verifier, verifierErr := randomURLSafe(32)
	if verifierErr != nil {
		unifyerror.Fail(c, unifyerror.ServerError(verifierErr))
		return
	}
	nonce, nonceErr := randomURLSafe(24)
	if nonceErr != nil {
		unifyerror.Fail(c, unifyerror.ServerError(nonceErr))
		return
	}
	binding, bindingErr := randomURLSafe(24)
	if bindingErr != nil {
		unifyerror.Fail(c, unifyerror.ServerError(bindingErr))
		return
	}

	now := time.Now()
	ssoStatesMu.Lock()
	cleanExpiredSSOStates(now)
	ssoStates[state] = ssoStateEntry{
		verifier: verifier,
		nonce:    nonce,
		binding:  binding,
		expiry:   now.Add(10 * time.Minute),
	}
	ssoStatesMu.Unlock()

	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(ssoStateCookieName, binding, 600, "/", "", usesHTTPS(), true)

	oauthCfg := oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		RedirectURL:  services.PanelSSOService.RedirectURI(),
		Endpoint:     provider.Endpoint(),
		Scopes:       cfg.Scopes,
	}

	// The nonce is carried through the IdP round trip and verified on return; it
	// is what stops a replayed id_token from being accepted.
	target := oauthCfg.AuthCodeURL(state,
		oauth2.S256ChallengeOption(verifier),
		oidc.Nonce(nonce))

	c.Redirect(http.StatusFound, target)
}

// PanelSSOCallback godoc
// @Summary Complete the panel SSO flow
// @Tags auth
// @Router /auth/panel-sso/callback [get]
func (a *AuthController) PanelSSOCallback(c *gin.Context) {
	state := strings.TrimSpace(c.Query("state"))
	code := strings.TrimSpace(c.Query("code"))
	if state == "" || code == "" {
		unifyerror.Fail(c, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr,
			"missing code or state"))
		return
	}

	bindingCookie, _ := c.Cookie(ssoStateCookieName)
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(ssoStateCookieName, "", -1, "/", "", usesHTTPS(), true)

	ssoStatesMu.Lock()
	entry, found := ssoStates[state]
	if found {
		delete(ssoStates, state)
	}
	ssoStatesMu.Unlock()

	if !found || time.Now().After(entry.expiry) ||
		entry.binding == "" ||
		subtle.ConstantTimeCompare([]byte(bindingCookie), []byte(entry.binding)) != 1 {
		unifyerror.Fail(c, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr,
			"invalid or expired state"))
		return
	}

	cfg := services.PanelSSOService.Config()
	if cfg == nil {
		unifyerror.Fail(c, unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound,
			"panel SSO is not enabled"))
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()

	provider, err := oidc.NewProvider(ctx, cfg.Issuer)
	if err != nil {
		failSSO(c)
		return
	}

	oauthCfg := oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		RedirectURL:  services.PanelSSOService.RedirectURI(),
		Endpoint:     provider.Endpoint(),
		Scopes:       cfg.Scopes,
	}

	token, exchangeErr := oauthCfg.Exchange(ctx, code, oauth2.VerifierOption(entry.verifier))
	if exchangeErr != nil {
		failSSO(c)
		return
	}

	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		failSSO(c)
		return
	}

	verifier := provider.Verifier(&oidc.Config{ClientID: cfg.ClientID})
	idToken, verifyErr := verifier.Verify(ctx, rawIDToken)
	if verifyErr != nil {
		failSSO(c)
		return
	}
	if entry.nonce == "" || subtle.ConstantTimeCompare([]byte(idToken.Nonce), []byte(entry.nonce)) != 1 {
		failSSO(c)
		return
	}

	var claims struct {
		Sub               string `json:"sub"`
		Email             string `json:"email"`
		EmailVerified     bool   `json:"email_verified"`
		Name              string `json:"name"`
		PreferredUsername string `json:"preferred_username"`
		Picture           string `json:"picture"`
	}
	if claimErr := idToken.Claims(&claims); claimErr != nil {
		failSSO(c)
		return
	}
	if claims.Sub == "" {
		failSSO(c)
		return
	}
	if cfg.EmailVerifiedRequired && !claims.EmailVerified {
		failSSO(c)
		return
	}

	result, signInErr := services.SignInWithSSO(services.SSOClaims{
		Issuer:            cfg.Issuer,
		Subject:           claims.Sub,
		Email:             claims.Email,
		EmailVerified:     claims.EmailVerified,
		Name:              claims.Name,
		PreferredUsername: claims.PreferredUsername,
		Picture:           claims.Picture,
	})
	if signInErr != nil {
		unifyerror.Fail(c, signInErr)
		return
	}

	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("headscale_panel_token", result.Token, int(conf.Conf.JWT.Expire*3600), "/", "", usesHTTPS(), true)

	// Hand the token back to the single-page app in the URL fragment.
	//
	// A fragment is never sent to a server and is not included in the Referer, so
	// the token cannot end up in an access log or leak to a third party the page
	// later links to. The app clears it from the address bar as soon as it has
	// been stored.
	c.Redirect(http.StatusFound, panelRootURL()+"#sso_token="+url.QueryEscape(result.Token))
}

// panelRootURL is the external URL the browser should land on after sign-in.
func panelRootURL() string {
	base := strings.TrimRight(strings.TrimSpace(conf.Conf.System.BaseURL), "/")
	if base == "" {
		return "/"
	}
	return base + "/"
}

func failSSO(c *gin.Context) {
	unifyerror.Fail(c, unifyerror.New(http.StatusUnauthorized, unifyerror.CodeLoginFailed,
		"single sign-on failed"))
}

func registrationEnabled() bool {
	ok, err := services.SetupStateService.CanRegister()
	return err == nil && ok
}

func usesHTTPS() bool {
	return strings.HasPrefix(strings.TrimSpace(conf.Conf.System.BaseURL), "https")
}

func randomURLSafe(byteLen int) (string, error) {
	buf := make([]byte, byteLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
