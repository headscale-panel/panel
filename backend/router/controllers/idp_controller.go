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
	"headscale-panel/pkg/idp"
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/middleware"
	"headscale-panel/router/services"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
)

// IdPController serves the panel acting as an OpenID Provider for headscale.
//
// These endpoints are hit by headscale and by a browser mid-flow, so they are
// public: there is no panel session to check. Authorisation happens at the
// consent step, where the panel session is required, and again when the code is
// redeemed.
type IdPController struct{}

// NewIdPController builds the controller.
func NewIdPController() *IdPController {
	return &IdPController{}
}

// Discovery godoc
// @Summary OpenID configuration
// @Tags idp
// @Produce json
// @Router /.well-known/openid-configuration [get]
func (i *IdPController) Discovery(c *gin.Context) {
	doc, err := services.IdPService.Discovery()
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	c.JSON(http.StatusOK, doc)
}

// JWKS godoc
// @Summary Signing keys
// @Tags idp
// @Produce json
// @Router /.well-known/jwks.json [get]
func (i *IdPController) JWKS(c *gin.Context) {
	keys, err := services.IdPService.JWKS()
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	c.JSON(http.StatusOK, keys)
}

// Authorize godoc
// @Summary Authorization endpoint
// @Tags idp
// @Router /idp/authorize [get]
// Authorize issues a code and redirects back to headscale.
//
// The caller must already hold a panel session: the browser is sent here after
// signing in, and an unauthenticated request renders a prompt instead of leaking
// whether a session exists.
func (i *IdPController) Authorize(c *gin.Context) {
	session := middleware.CurrentSession(c)
	if session == nil {
		unifyerror.Fail(c, unifyerror.InvalidToken())
		return
	}

	query := idp.AuthorizationQuery{
		ClientID:            c.Query("client_id"),
		RedirectURI:         c.Query("redirect_uri"),
		ResponseType:        c.Query("response_type"),
		Scope:               c.Query("scope"),
		State:               c.Query("state"),
		Nonce:               c.Query("nonce"),
		CodeChallenge:       c.Query("code_challenge"),
		CodeChallengeMethod: c.Query("code_challenge_method"),
	}

	code, err := services.IdPService.Authorize(c.Request.Context(), session.Account.ID, query)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	parsedTarget, parseErr := url.Parse(query.RedirectURI)
	if parseErr != nil {
		unifyerror.Fail(c, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "invalid redirect_uri"))
		return
	}
	params := parsedTarget.Query()
	params.Set("code", code)
	if state := strings.TrimSpace(query.State); state != "" {
		params.Set("state", state)
	}
	parsedTarget.RawQuery = params.Encode()
	c.Redirect(http.StatusFound, parsedTarget.String())
}

// Token godoc
// @Summary Token endpoint
// @Tags idp
// @Accept x-www-form-urlencoded
// @Produce json
// @Router /idp/token [post]
func (i *IdPController) Token(c *gin.Context) {
	grantType := c.PostForm("grant_type")
	if grantType != "authorization_code" {
		// Refresh tokens are out of scope by design: headscale re-runs the flow
		// when a token nears expiry.
		c.JSON(http.StatusBadRequest, gin.H{
			"error":             "unsupported_grant_type",
			"error_description": "only authorization_code is supported",
		})
		return
	}

	clientID := c.PostForm("client_id")
	clientSecret := c.PostForm("client_secret")
	if basicUser, basicPass, ok := c.Request.BasicAuth(); ok {
		if clientID == "" {
			clientID = basicUser
		}
		if clientSecret == "" {
			clientSecret = basicPass
		}
	}

	idToken, accessToken, err := services.IdPService.Exchange(c.Request.Context(),
		c.PostForm("code"),
		clientID,
		clientSecret,
		c.PostForm("redirect_uri"),
		c.PostForm("code_verifier"))
	if err != nil {
		if err == idp.ErrInvalidClient {
			c.Header("WWW-Authenticate", `Basic realm="headscale-panel-idp"`)
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":             "invalid_client",
				"error_description": "client authentication failed",
			})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{
			"error":             "invalid_grant",
			"error_description": "the authorization code could not be redeemed",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token": accessToken,
		"id_token":     idToken,
		"token_type":   "Bearer",
		"expires_in":   int(idp.TokenTTL.Seconds()),
	})
}

// UserInfo godoc
// @Summary UserInfo endpoint
// @Tags idp
// @Produce json
// @Security BearerAuth
// @Router /idp/userinfo [get]
func (i *IdPController) UserInfo(c *gin.Context) {
	raw := strings.TrimSpace(c.GetHeader("Authorization"))
	raw = strings.TrimSpace(strings.TrimPrefix(raw, "Bearer "))
	if raw == "" {
		c.Header("WWW-Authenticate", "Bearer")
		unifyerror.Fail(c, unifyerror.New(http.StatusUnauthorized, unifyerror.CodeUnauth, "missing access token"))
		return
	}

	info, err := services.IdPService.UserInfo(raw)
	if err != nil {
		c.Header("WWW-Authenticate", `Bearer error="invalid_token"`)
		unifyerror.Fail(c, err)
		return
	}
	c.JSON(http.StatusOK, info)
}

// State godoc
// @Summary Read the panel IdP status
// @Tags idp
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /system/auth/idp [get]
func (i *IdPController) State(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionAuthManage); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	state, err := services.IdPService.DescribeState(c.Request.Context())
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, state)
}

// SetEnabledRequest toggles the provider.
type SetEnabledRequest struct {
	Enabled bool `json:"enabled"`
}

// SetEnabled godoc
// @Summary Turn the panel IdP on or off
// @Tags idp
// @Accept json
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /system/auth/idp [put]
// SetEnabled flips the persisted switch.
//
// Disabling takes effect immediately at the capability layer: /idp/* starts
// answering 400 regardless of what the headscale config file still says, which is
// what stops a stale `oidc:` block from reviving the flow.
func (i *IdPController) SetEnabled(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionAuthManage); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	var req SetEnabledRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	state, err := services.IdPService.SetEnabled(c.GetUint("userID"), req.Enabled)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, state)
}

// GrantEnroll godoc
// @Summary Grant a role permission to enrol devices
// @Tags idp
// @Accept json
// @Produce json
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /system/auth/grant-enroll [post]
// GrantEnroll adds the enrolment permission to a role.
//
// It exists because turning the IdP on is useless until some role may enrol:
// the gate rejects every account otherwise, and the operator would have to hunt
// for the right permission code.
func (i *IdPController) GrantEnroll(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionRoleManage); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	var req struct {
		RoleID uint `json:"role_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	role, err := services.GrantEnrollPermission(c.GetUint("userID"), req.RoleID)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, role)
}
