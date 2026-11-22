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
	"strconv"

	"headscale-panel/internal/config"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

type HeadscaleConfigController struct{}

func NewHeadscaleConfigController() *HeadscaleConfigController {
	return &HeadscaleConfigController{}
}

// configSaveRequest is the body of a save request.
//
// Values are registry keys, not a config struct: sending only what the operator
// changed is what lets the panel leave everything else in the file alone.
type configSaveRequest struct {
	Values map[string]any `json:"values"`
	// Restart applies the config after writing it. Defaults to true because a saved
	// config that is never applied looks like a bug to the operator.
	Restart *bool `json:"restart"`
}

// Get godoc
// @Summary Get the current Headscale configuration
// @Tags headscale-config
// @Produce json
// @Success 200 {object} unifyerror.Response{data=services.ConfigView}
// @Security BearerAuth
// @Router /headscale/config [get]
func (c *HeadscaleConfigController) Get(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	if err := services.RequirePermission(userID, constants.PermSystemConfigRead); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	view, err := services.HeadscaleConfigService.Get()
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, view)
}

// Update godoc
// @Summary Save the Headscale configuration
// @Tags headscale-config
// @Accept json
// @Produce json
// @Param body body configSaveRequest true "Config values keyed by registry key"
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/config [put]
func (c *HeadscaleConfigController) Update(ctx *gin.Context) {
	var body configSaveRequest
	if err := ctx.ShouldBindJSON(&body); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.RequirePermission(userID, constants.PermSystemConfigUpdate); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	result, err := services.HeadscaleConfigService.Save(userID, ctx.GetString("username"), body.Values)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	restart := true
	if body.Restart != nil {
		restart = *body.Restart
	}

	response := gin.H{
		"message":    constants.MsgConfigSaved,
		"changes":    result.Changes,
		"blocked":    result.Blocked,
		"deployment": result.Deployment,
	}
	if restart {
		outcome, restartErr := services.HeadscaleConfigService.Restart(ctx.Request.Context())
		if restartErr != nil {
			// The file is already written and valid, so a failed restart must not turn
			// a successful save into an error.
			response["restart"] = gin.H{
				"performed":       false,
				"requires_manual": true,
				"manual_hint":     restartErr.Error(),
			}
		} else {
			response["restart"] = outcome
		}
	}

	unifyerror.Success(ctx, response)
}

// Deployments godoc
// @Summary List recent config publications
// @Tags headscale-config
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /headscale/config/deployments [get]
func (c *HeadscaleConfigController) Deployments(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	if err := services.RequirePermission(userID, constants.PermSystemConfigRead); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	limit, _ := strconv.Atoi(ctx.DefaultQuery("limit", "20"))
	list, err := services.HeadscaleConfigService.Deployments(limit)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, gin.H{"items": list})
}

// VerifyDeployment godoc
// @Summary Verify headscale after a restart, rolling back on failure
// @Tags headscale-config
// @Produce json
// @Param id path int true "Deployment id"
// @Success 200 {object} unifyerror.Response{data=object}
// @Failure 409 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/config/deployments/{id}/verify [post]
func (c *HeadscaleConfigController) VerifyDeployment(ctx *gin.Context) {
	id, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		unifyerror.Fail(ctx, unifyerror.WrongParam("id"))
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.RequirePermission(userID, constants.PermSystemConfigUpdate); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	dep, verifyErr := services.HeadscaleConfigService.VerifyDeployment(ctx.Request.Context(), uint(id))
	if verifyErr != nil {
		unifyerror.Fail(ctx, verifyErr)
		return
	}

	unifyerror.Success(ctx, gin.H{"deployment": dep})
}

// Bootstrap godoc
// @Summary Generate or repair the Headscale config
// @Tags headscale-config
// @Accept json
// @Produce json
// @Param action path string true "generate|repair|resync"
// @Param body body configSaveRequest true "Known values"
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/config/bootstrap/{action} [post]
func (c *HeadscaleConfigController) Bootstrap(ctx *gin.Context) {
	action, ok := bootstrapAction(ctx.Param("action"))
	if !ok {
		unifyerror.Fail(ctx, unifyerror.WrongParam("action"))
		return
	}

	var body configSaveRequest
	if err := ctx.ShouldBindJSON(&body); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.RequirePermission(userID, constants.PermSystemConfigUpdate); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	result, err := services.HeadscaleConfigService.PublishBootstrap(userID, ctx.GetString("username"), action, body.Values)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, gin.H{
		"message":    constants.MsgConfigSaved,
		"action":     action,
		"changes":    result.Changes,
		"blocked":    result.Blocked,
		"deployment": result.Deployment,
	})
}

// bootstrapAction maps the path segment to a recorded action name.
func bootstrapAction(raw string) (string, bool) {
	switch raw {
	case "generate":
		return config.ActionGenerate, true
	case "repair":
		return config.ActionRepair, true
	case "resync":
		return config.ActionResync, true
	}
	return "", false
}

// Preview godoc
// @Summary Preview the YAML output of a Headscale configuration
// @Tags headscale-config
// @Accept json
// @Produce json
// @Param body body configSaveRequest true "Config values keyed by registry key"
// @Success 200 {object} unifyerror.Response{data=object} "yaml string"
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/config/preview [post]
func (c *HeadscaleConfigController) Preview(ctx *gin.Context) {
	var body configSaveRequest
	if err := ctx.ShouldBindJSON(&body); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.RequirePermission(userID, constants.PermSystemConfigUpdate); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	rendered, result, err := services.HeadscaleConfigService.Preview(body.Values)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, gin.H{
		"yaml":    rendered,
		"changes": result.Changes,
		"blocked": result.Blocked,
	})
}

// GetMode godoc
// @Summary Get the config ownership mode
// @Tags headscale-config
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /headscale/config/mode [get]
func (c *HeadscaleConfigController) GetMode(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	if err := services.RequirePermission(userID, constants.PermSystemConfigRead); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, gin.H{"mode": services.HeadscaleConfigService.Mode()})
}

// UpdateMode godoc
// @Summary Switch the config ownership mode
// @Tags headscale-config
// @Accept json
// @Produce json
// @Param body body object true "{mode: managed|observed}"
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/config/mode [put]
func (c *HeadscaleConfigController) UpdateMode(ctx *gin.Context) {
	var body struct {
		Mode string `json:"mode"`
	}
	if err := ctx.ShouldBindJSON(&body); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.RequirePermission(userID, constants.PermSystemConfigUpdate); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	mode := config.OwnershipMode(body.Mode)
	if !mode.Valid() {
		unifyerror.Fail(ctx, unifyerror.BadRequest("mode must be managed or observed"))
		return
	}
	if err := services.HeadscaleConfigService.SetMode(mode); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, gin.H{"mode": mode})
}

// Running godoc
// @Summary Get the live redacted YAML configuration from Headscale API
// @Tags headscale-config
// @Produce json
// @Param docs query bool false "Include inline key documentation comments (default true)"
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /system/config/headscale/running [get]
func (c *HeadscaleConfigController) Running(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	if err := services.RequirePermission(userID, constants.PermSystemConfigRead); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	includeDocs := true
	if raw := ctx.Query("docs"); raw != "" {
		if parsed, err := strconv.ParseBool(raw); err == nil {
			includeDocs = parsed
		}
	}

	yamlDoc, err := services.HeadscaleConfigService.GetRunningConfig(ctx.Request.Context(), includeDocs)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, gin.H{"yaml": yamlDoc, "docs": includeDocs})
}
