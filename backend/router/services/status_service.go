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

package services

import (
	"headscale-panel/model"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/headscale"
)

type statusService struct{}

var StatusService = new(statusService)

// SystemStatus is the response payload for the global status endpoint.
type SystemStatus struct {
	// OIDCEnabled reports whether headscale OIDC is configured (non-empty issuer).
	OIDCEnabled bool `json:"oidc_enabled"`
	// DinDMode reports whether Docker-in-Docker auto-restart is enabled.
	DinDMode bool `json:"dind_mode"`
	// HSConnected reports whether the panel can reach the Headscale gRPC service.
	HSConnected bool `json:"hs_connected"`
	// SetupState is the current panel initialization state.
	SetupState string `json:"setup_state"`
	// CurrentUser is the authenticated user's basic info (nil when called without auth).
	CurrentUser *StatusUser `json:"current_user,omitempty"`
}

// StatusUser carries a minimal user representation for the status response.
type StatusUser struct {
	ID          uint   `json:"id"`
	Username    string `json:"username"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
}

// GetSystemStatus assembles the current system status for the given user.
func (s *statusService) GetSystemStatus(userID uint) (*SystemStatus, error) {
	// Setup state
	setupStateStr := "initialized"
	if state, err := SetupStateService.GetState(); err == nil {
		setupStateStr = string(state.State)
	}

	// OIDC enabled: check headscale config
	oidcEnabled := false
	if cfg, err := HeadscaleConfigService.GetConfig(); err == nil {
		oidcEnabled = cfg.OIDC.Issuer != ""
	}

	// DinD mode
	dindMode := headscale.IsDinDEnabled()

	// HS connected: lightweight gRPC probe (reuses HeadscaleStatusService logic)
	hsStatus := HeadscaleStatusService.GetHeadscaleServerStatus()

	status := &SystemStatus{
		OIDCEnabled: oidcEnabled,
		DinDMode:    dindMode,
		HSConnected: hsStatus.Running,
		SetupState:  setupStateStr,
	}

	// Current user info
	if userID > 0 {
		var user model.User
		if err := model.DB.Preload("Group").First(&user, userID).Error; err == nil {
			role := constants.ROLE_USER
			if IsAdminGroupName(user.Group.Name) {
				role = constants.ROLE_ADMIN
			}
			status.CurrentUser = &StatusUser{
				ID:          user.ID,
				Username:    user.Username,
				Email:       user.Email,
				DisplayName: user.DisplayName,
				Role:        role,
			}
		}
	}

	return status, nil
}
