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
	"time"

	"headscale-panel/pkg/headscale"
)

type headscaleStatusService struct{}

var HeadscaleStatusService = new(headscaleStatusService)

// HeadscaleServerStatus represents the liveness of the Headscale API as observed
// from the panel.
type HeadscaleServerStatus struct {
	Running bool `json:"running"`
}

// GetHeadscaleServerStatus performs a lightweight authenticated health check.
//
// /api/v1/health is used rather than a data call: it answers whether the server is
// up and its database usable without pulling a list that grows with the deployment.
func (s *headscaleStatusService) GetHeadscaleServerStatus() HeadscaleServerStatus {
	client, err := headscale.GetOrRefreshClient()
	if err != nil || client == nil || client.REST == nil {
		return HeadscaleServerStatus{Running: false}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return HeadscaleServerStatus{Running: client.REST.Health(ctx) == nil}
}
