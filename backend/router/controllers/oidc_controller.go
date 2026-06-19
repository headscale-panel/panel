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
	"fmt"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/utils/jwt"
	"headscale-panel/router/services"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
)

type OIDCController struct{}

func NewOIDCController() *OIDCController {
	return &OIDCController{}
}

func (oc *OIDCController) Discovery(c *gin.Context) {
	baseURL := strings.TrimRight(conf.Conf.System.BaseURL, "/")
	c.JSON(http.StatusOK, gin.H{
		"issuer":                 baseURL,
		"authorization_endpoint": baseURL + "/api/v1/oidc/authorize",
		"token_endpoint":         baseURL + "/api/v1/oidc/token",
		"jwks_uri":               baseURL + "/api/v1/oidc/jwks",
		"userinfo_endpoint":      baseURL + "/api/v1/oidc/userinfo",
		"response_types_supported": []string{
			"code",
		},
		"subject_types_supported": []string{
			"public",
		},
		"id_token_signing_alg_values_supported": []string{
			"RS256",
		},
		"scopes_supported": []string{
			"openid",
			"profile",
			"email",
			"groups",
		},
		"grant_types_supported": []string{
			"authorization_code",
			"refresh_token",
		},
		"token_endpoint_auth_methods_supported": []string{
			"client_secret_post",
			"client_secret_basic",
		},
		"code_challenge_methods_supported": []string{
			"S256",
		},
		"claims_supported": []string{
			"sub", "name", "preferred_username", "email", "email_verified", "picture", "groups",
		},
	})
}

// AuthorizeQuery is the query parameter struct for Authorize.
type AuthorizeQuery struct {
	ClientID            string `form:"client_id"`
	RedirectURI         string `form:"redirect_uri"`
	ResponseType        string `form:"response_type"`
	Nonce               string `form:"nonce"`
	State               string `form:"state"`
	Scope               string `form:"scope,default=openid"`
	CodeChallenge       string `form:"code_challenge"`
	CodeChallengeMethod string `form:"code_challenge_method"`
}

func (oc *OIDCController) Authorize(c *gin.Context) {
	var q AuthorizeQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request"})
		return
	}

	if q.ResponseType != "code" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported_response_type"})
		return
	}

	if !services.OIDCService.ValidateRedirectURI(q.ClientID, q.RedirectURI) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_client_or_redirect_uri"})
		return
	}
	if err := services.ValidatePKCEChallenge(q.CodeChallenge, q.CodeChallengeMethod); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_request", "error_description": "invalid PKCE challenge"})
		return
	}

	// Check authentication via Cookie. SYSTEM_BASE_URL is the external panel
	// base (for example https://vpn.example.com/panel), so the login page is
	// relative to that base rather than the domain root.
	token, err := c.Cookie("headscale_panel_token")
	var userID uint
	if err != nil || token == "" {
		c.Redirect(http.StatusFound, oidcLoginURL(conf.Conf.System.BaseURL, c.Request.RequestURI))
		return
	}

	claims, err := jwt.ParseToken(token)
	if err != nil {
		c.Redirect(http.StatusFound, oidcLoginURL(conf.Conf.System.BaseURL, c.Request.RequestURI))
		return
	}
	userID = claims.UserID

	// Generate Code
	code, err := services.OIDCService.GenerateAuthCode(userID, q.ClientID, q.RedirectURI, q.Nonce, q.Scope, q.CodeChallenge, q.CodeChallengeMethod)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server_error"})
		return
	}

	// Redirect back to client
	separator := "?"
	if strings.Contains(q.RedirectURI, "?") {
		separator = "&"
	}
	target := fmt.Sprintf("%s%scode=%s", q.RedirectURI, separator, code)
	if q.State != "" {
		target += "&state=" + q.State
	}

	c.Redirect(http.StatusFound, target)
}

func oidcLoginURL(baseURL, requestURI string) string {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	parsed, err := url.Parse(base)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "/panel/login?return_url=" + url.QueryEscape(requestURI)
	}

	origin := parsed.Scheme + "://" + parsed.Host
	returnURL := origin + requestURI
	return base + "/login?return_url=" + url.QueryEscape(returnURL)
}

func (oc *OIDCController) Token(c *gin.Context) {
	grantType := c.PostForm("grant_type")
	clientID := c.PostForm("client_id")
	clientSecret := c.PostForm("client_secret")
	if basicClientID, basicClientSecret, ok := c.Request.BasicAuth(); ok {
		if clientID == "" {
			clientID = basicClientID
		}
		if clientSecret == "" {
			clientSecret = basicClientSecret
		}
	}

	switch grantType {
	case "authorization_code":
		code := c.PostForm("code")
		redirectURI := c.PostForm("redirect_uri")
		codeVerifier := c.PostForm("code_verifier")
		idToken, accessToken, refreshToken, err := services.OIDCService.ExchangeCode(code, clientID, clientSecret, redirectURI, codeVerifier)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_grant"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"access_token":  accessToken,
			"id_token":      idToken,
			"refresh_token": refreshToken,
			"token_type":    "Bearer",
			"expires_in":    3600,
		})

	case "refresh_token":
		refreshTokenStr := c.PostForm("refresh_token")
		idToken, accessToken, newRefreshToken, err := services.OIDCService.RefreshTokens(refreshTokenStr, clientID, clientSecret)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_grant"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"access_token":  accessToken,
			"id_token":      idToken,
			"refresh_token": newRefreshToken,
			"token_type":    "Bearer",
			"expires_in":    3600,
		})

	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported_grant_type"})
	}
}

func (oc *OIDCController) JWKS(c *gin.Context) {
	jwks, err := services.OIDCService.GetJWKS()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "server_error"})
		return
	}
	c.JSON(http.StatusOK, jwks)
}

func (oc *OIDCController) UserInfo(c *gin.Context) {
	// Extract Bearer token from Authorization header
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing or invalid authorization header"})
		return
	}
	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

	// Validate the access token
	claims, err := services.OIDCService.ValidateAccessToken(tokenStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_token"})
		return
	}

	sub, _ := claims["sub"].(string)
	if sub == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_token", "error_description": "missing subject"})
		return
	}

	// Get user info
	userInfo, err := services.OIDCService.GetUserInfoBySub(sub)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user_not_found"})
		return
	}

	c.JSON(http.StatusOK, userInfo)
}
