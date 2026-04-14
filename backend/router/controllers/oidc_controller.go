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
	baseURL := conf.Conf.System.BaseURL
	c.JSON(http.StatusOK, gin.H{
		"issuer":                 baseURL,
		"authorization_endpoint": baseURL + "/panel/api/v1/oidc/authorize",
		"token_endpoint":         baseURL + "/panel/api/v1/oidc/token",
		"jwks_uri":               baseURL + "/panel/api/v1/oidc/jwks",
		"userinfo_endpoint":      baseURL + "/panel/api/v1/oidc/userinfo",
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
		},
		"grant_types_supported": []string{
			"authorization_code",
			"refresh_token",
		},
		"token_endpoint_auth_methods_supported": []string{
			"client_secret_post",
		},
		"claims_supported": []string{
			"sub", "name", "preferred_username", "email", "email_verified", "picture",
		},
	})
}

// AuthorizeQuery is the query parameter struct for Authorize.
type AuthorizeQuery struct {
	ClientID     string `form:"client_id"`
	RedirectURI  string `form:"redirect_uri"`
	ResponseType string `form:"response_type"`
	Nonce        string `form:"nonce"`
	State        string `form:"state"`
	Scope        string `form:"scope,default=openid"`
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

	// Check authentication via Cookie
	token, err := c.Cookie("headscale_panel_token")
	var userID uint
	if err != nil || token == "" {
		returnURL := conf.Conf.System.BaseURL + c.Request.RequestURI
		c.Redirect(http.StatusFound, "/login?return_url="+url.QueryEscape(returnURL))
		return
	}

	claims, err := jwt.ParseToken(token)
	if err != nil {
		returnURL := conf.Conf.System.BaseURL + c.Request.RequestURI
		c.Redirect(http.StatusFound, "/login?return_url="+url.QueryEscape(returnURL))
		return
	}
	userID = claims.UserID

	// Generate Code
	code, err := services.OIDCService.GenerateAuthCode(userID, q.ClientID, q.RedirectURI, q.Nonce, q.Scope)
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

func (oc *OIDCController) Token(c *gin.Context) {
	grantType := c.PostForm("grant_type")
	clientID := c.PostForm("client_id")
	clientSecret := c.PostForm("client_secret")

	switch grantType {
	case "authorization_code":
		code := c.PostForm("code")
		idToken, accessToken, refreshToken, err := services.OIDCService.ExchangeCode(code, clientID, clientSecret)
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
