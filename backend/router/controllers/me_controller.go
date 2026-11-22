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
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/middleware"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

// MeController serves the signed-in account's own profile.
type MeController struct{}

// NewMeController builds the controller.
func NewMeController() *MeController {
	return &MeController{}
}

// Get godoc
// @Summary Read the signed-in account
// @Tags me
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /me [get]
func (m *MeController) Get(c *gin.Context) {
	session := middleware.CurrentSession(c)
	if session == nil {
		unifyerror.Fail(c, unifyerror.InvalidToken())
		return
	}
	unifyerror.Success(c, services.BuildMeView(session))
}

// ChangePasswordRequest is the self-service password change payload.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required"`
}

// ChangePassword godoc
// @Summary Change the signed-in account's password
// @Tags me
// @Accept json
// @Produce json
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /me/password [put]
// ChangePassword requires the current password even though the caller is already
// authenticated: a stolen token must not be enough to take over the account.
func (m *MeController) ChangePassword(c *gin.Context) {
	session := middleware.CurrentSession(c)
	if session == nil {
		unifyerror.Fail(c, unifyerror.InvalidToken())
		return
	}

	var req ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	if err := services.Accounts.ChangePassword(session.Account.ID, req.CurrentPassword, req.NewPassword); err != nil {
		unifyerror.Fail(c, services.MapAccountError(err))
		return
	}
	unifyerror.Success(c, gin.H{"message": "password changed; please sign in again"})
}

// MarkTourSeen godoc
// @Summary Remember that the guide tour was completed
// @Tags me
// @Produce json
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /me/guide-tour/seen [post]
func (m *MeController) MarkTourSeen(c *gin.Context) {
	session := middleware.CurrentSession(c)
	if session == nil {
		unifyerror.Fail(c, unifyerror.InvalidToken())
		return
	}

	if err := services.MarkGuideTourSeen(session.Account.ID); err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, gin.H{"message": "recorded"})
}

// ResetTour godoc
// @Summary Replay the guide tour
// @Tags me
// @Produce json
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /me/guide-tour/reset [post]
func (m *MeController) ResetTour(c *gin.Context) {
	session := middleware.CurrentSession(c)
	if session == nil {
		unifyerror.Fail(c, unifyerror.InvalidToken())
		return
	}

	if err := services.ResetGuideTour(session.Account.ID); err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, gin.H{"message": "tour reset"})
}

// NetworkIdentities godoc
// @Summary List the signed-in account's network identities
// @Tags me
// @Produce json
// @Success 200 {object} unifyerror.Response{data=array}
// @Security BearerAuth
// @Router /me/network-identities [get]
func (m *MeController) NetworkIdentities(c *gin.Context) {
	session := middleware.CurrentSession(c)
	if session == nil {
		unifyerror.Fail(c, unifyerror.InvalidToken())
		return
	}

	bindings, err := services.Network.BindingsOf(session.Account.ID)
	if err != nil {
		unifyerror.Fail(c, dbError(err))
		return
	}

	snap, snapErr := services.IdentitySnapshot(c.Request.Context())
	if snapErr != nil {
		unifyerror.Fail(c, snapErr)
		return
	}

	out := make([]services.IdentityView, 0, len(bindings))
	for _, binding := range bindings {
		ident := snap.Identity(binding.HSUserID)
		if ident == nil {
			continue
		}
		out = append(out, services.ToIdentityView(ident))
	}
	unifyerror.Success(c, out)
}

// GenerateTOTP godoc
// @Summary Start TOTP enrolment
// @Tags me
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /me/totp/generate [post]
func (m *MeController) GenerateTOTP(c *gin.Context) {
	session := middleware.CurrentSession(c)
	if session == nil {
		unifyerror.Fail(c, unifyerror.InvalidToken())
		return
	}

	secret, url, err := services.GenerateTOTPSecret(session.Account)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, gin.H{"secret": secret, "url": url})
}

// EnableTOTPRequest confirms enrolment with a live code.
type EnableTOTPRequest struct {
	Code string `json:"code" binding:"required"`
}

// EnableTOTP godoc
// @Summary Confirm TOTP enrolment
// @Tags me
// @Accept json
// @Produce json
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /me/totp/enable [post]
func (m *MeController) EnableTOTP(c *gin.Context) {
	session := middleware.CurrentSession(c)
	if session == nil {
		unifyerror.Fail(c, unifyerror.InvalidToken())
		return
	}

	var req EnableTOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	if err := services.EnableTOTP(session.Account.ID, req.Code); err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, gin.H{"message": "two-factor authentication enabled"})
}

// DisableTOTPRequest carries re-authentication proof to turn off 2FA.
type DisableTOTPRequest struct {
	CurrentPassword string `json:"current_password"`
	TOTPCode        string `json:"totp_code"`
}

// DisableTOTP godoc
// @Summary Turn off TOTP
// @Tags me
// @Accept json
// @Produce json
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /me/totp [delete]
func (m *MeController) DisableTOTP(c *gin.Context) {
	session := middleware.CurrentSession(c)
	if session == nil {
		unifyerror.Fail(c, unifyerror.InvalidToken())
		return
	}

	var req DisableTOTPRequest
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			unifyerror.Fail(c, unifyerror.ErrBind)
			return
		}
	}

	if err := services.DisableTOTP(session.Account.ID, req.CurrentPassword, req.TOTPCode); err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, gin.H{"message": "two-factor authentication disabled"})
}
