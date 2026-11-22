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
	"headscale-panel/pkg/hslifecycle"
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

// PanelSSOController manages the panel's own OIDC client settings.
type PanelSSOController struct{}

// NewPanelSSOController builds the controller.
func NewPanelSSOController() *PanelSSOController {
	return &PanelSSOController{}
}

// Get godoc
// @Summary Read the panel SSO settings
// @Tags system
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /system/auth/panel-sso [get]
func (p *PanelSSOController) Get(c *gin.Context) {
	view, err := services.PanelSSOService.Get(c.GetUint("userID"))
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, view)
}

// SavePanelSSORequest is the settings payload.
type SavePanelSSORequest struct {
	Enabled               bool     `json:"enabled"`
	Issuer                string   `json:"issuer"`
	ClientID              string   `json:"client_id"`
	ClientSecret          string   `json:"client_secret"`
	Scopes                []string `json:"scopes"`
	EmailVerifiedRequired bool     `json:"email_verified_required"`
	Provisioning          string   `json:"provisioning"`
	DefaultRoleID         uint     `json:"default_role_id"`
}

// Save godoc
// @Summary Save the panel SSO settings
// @Tags system
// @Accept json
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /system/auth/panel-sso [put]
// Save requires provisioning to be stated explicitly; there is no default,
// because "create accounts automatically" and "reject unknown users" are both
// defensible and guessing wrong is a security incident.
func (p *PanelSSOController) Save(c *gin.Context) {
	var req SavePanelSSORequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	view, err := services.PanelSSOService.Save(c.GetUint("userID"), services.PanelSSOSaveInput{
		Enabled:               req.Enabled,
		Issuer:                req.Issuer,
		ClientID:              req.ClientID,
		ClientSecret:          req.ClientSecret,
		Scopes:                req.Scopes,
		EmailVerifiedRequired: req.EmailVerifiedRequired,
		Provisioning:          req.Provisioning,
		DefaultRoleID:         req.DefaultRoleID,
	})
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, view)
}

// LifecycleController starts, stops and restarts the headscale container.
type LifecycleController struct{}

// NewLifecycleController builds the controller.
func NewLifecycleController() *LifecycleController {
	return &LifecycleController{}
}

// Status godoc
// @Summary Report headscale container state
// @Tags system
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /system/hs/status [get]
func (l *LifecycleController) Status(c *gin.Context) {
	status := hslifecycle.Inspect(c.Request.Context())
	unifyerror.Success(c, status)
}

// Start godoc
// @Summary Start the headscale container
// @Tags system
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /system/hs/start [post]
func (l *LifecycleController) Start(c *gin.Context) {
	outcome, err := hslifecycle.Start(c.Request.Context(), hslifecycle.ReasonManualStart)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, outcome)
}

// Stop godoc
// @Summary Stop the headscale container
// @Tags system
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /system/hs/stop [post]
func (l *LifecycleController) Stop(c *gin.Context) {
	outcome, err := hslifecycle.Stop(c.Request.Context(), hslifecycle.ReasonManualStop)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, outcome)
}

// Restart godoc
// @Summary Restart the headscale container
// @Tags system
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /system/hs/restart [post]
func (l *LifecycleController) Restart(c *gin.Context) {
	outcome, err := hslifecycle.RequestRestart(c.Request.Context(), hslifecycle.ReasonManualRestart)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, outcome)
}
