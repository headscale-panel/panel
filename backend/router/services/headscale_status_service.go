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
	"headscale-panel/pkg/headscale"
	v1 "github.com/juanfont/headscale/gen/go/headscale/v1"
	"time"
)

type headscaleStatusService struct{}

var HeadscaleStatusService = new(headscaleStatusService)

// HeadscaleServerStatus represents the liveness status of the Headscale gRPC
// service as observed from the panel.
type HeadscaleServerStatus struct {
	Running bool `json:"running"`
}

// GetHeadscaleServerStatus performs a lightweight gRPC probe (ListUsers with
// a 5-second timeout) to determine whether the Headscale server is reachable.
func (s *headscaleStatusService) GetHeadscaleServerStatus() HeadscaleServerStatus {
	client, err := headscale.GetOrRefreshClient()
	if err != nil || client == nil || client.Service == nil {
		return HeadscaleServerStatus{Running: false}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err = client.Service.ListUsers(ctx, &v1.ListUsersRequest{})
	return HeadscaleServerStatus{Running: err == nil}
}
