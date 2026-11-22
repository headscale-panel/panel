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
	"headscale-panel/internal/network"
	"headscale-panel/pkg/hsapi"

	"gorm.io/gorm"
)

// Network is the network identity domain, wired once at startup.
var Network *network.Service

// InitNetworkDomain creates the network service over the shared database.
func InitNetworkDomain(db *gorm.DB) {
	Network = network.NewService(db, upstreamReader{})
}

// upstreamReader adapts the live headscale client to the domain's Upstream
// interface. It resolves the client per call so it keeps working after the
// connection settings change.
type upstreamReader struct{}

func (upstreamReader) ListUsers(ctx context.Context) ([]hsapi.User, error) {
	client, err := headscaleRESTClient()
	if err != nil {
		return nil, err
	}
	return client.ListUsers(ctx)
}

func (upstreamReader) ListNodes(ctx context.Context, userName string) ([]hsapi.Node, error) {
	client, err := headscaleRESTClient()
	if err != nil {
		return nil, err
	}
	return client.ListNodes(ctx, userName)
}
