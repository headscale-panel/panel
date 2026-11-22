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
	"context"

	"headscale-panel/pkg/hslifecycle"
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

	// OIDC enabled: the headscale config is the only place that records it
	oidcEnabled := HeadscaleConfigService.OIDCIssuer() != ""

	// Lifecycle control: whether the panel may act on the container at all.
	// Reported from the lifecycle package so the UI's banner and the restart path
	// can never disagree about whether an automatic restart is possible.
	dindMode := hslifecycle.Inspect(context.Background()).Available

	// HS connected: authenticated health check
	hsStatus := HeadscaleStatusService.GetHeadscaleServerStatus()

	status := &SystemStatus{
		OIDCEnabled: oidcEnabled,
		DinDMode:    dindMode,
		HSConnected: hsStatus.Running,
		SetupState:  setupStateStr,
	}

	// Current account info
	if userID > 0 {
		if acc, err := Accounts.Get(userID); err == nil {
			status.CurrentUser = &StatusUser{
				ID:          acc.ID,
				Username:    acc.Username,
				Email:       acc.Email,
				DisplayName: acc.DisplayName,
				Role:        acc.Role.Name,
			}
		}
	}

	return status, nil
}
