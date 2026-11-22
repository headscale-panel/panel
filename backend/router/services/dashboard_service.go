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
	"headscale-panel/internal/account"
	"headscale-panel/internal/network"
	"headscale-panel/model"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/unifyerror"
)

type dashboardService struct{}

// DashboardService owns the overview counters and the topology tree.
var DashboardService = new(dashboardService)

// OverviewResponse is the dashboard summary card payload.
type OverviewResponse struct {
	AccountCount      int64 `json:"account_count"`
	RoleCount         int64 `json:"role_count"`
	ResourceCount     int64 `json:"resource_count"`
	IdentityCount     int64 `json:"identity_count"`
	DeviceCount       int64 `json:"device_count"`
	OnlineDeviceCount int64 `json:"online_device_count"`
	DNSRecordCount    int64 `json:"dns_record_count"`
}

// TopologyNode is one node of the dashboard tree.
type TopologyNode struct {
	Name     string          `json:"name"`
	Type     string          `json:"type"` // server, owner, device
	Children []*TopologyNode `json:"children,omitempty"`
	Info     map[string]any  `json:"info,omitempty"`
}

// GetOverview returns the dashboard counters.
func (s *dashboardService) GetOverview(actorUserID uint) (*OverviewResponse, error) {
	return s.GetOverviewWithContext(context.Background(), actorUserID)
}

// GetOverviewWithContext returns the dashboard counters.
//
// Non-administrators see the shape of the system but only their own resources:
// a count that includes resources the actor cannot open is worse than useless,
// because it invites them to look for a page they will be refused.
func (s *dashboardService) GetOverviewWithContext(ctx context.Context, actorUserID uint) (*OverviewResponse, error) {
	if err := RequirePermission(actorUserID, constants.PermDashboardView); err != nil {
		return nil, err
	}

	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, err
	}

	nodes, _, err := listAccessibleNodes(ctx, actorUserID)
	if err != nil {
		return nil, err
	}

	out := &OverviewResponse{DeviceCount: int64(len(nodes))}
	for _, n := range nodes {
		if n.Online {
			out.OnlineDeviceCount++
		}
	}

	if scope.isAdmin {
		if err := model.DB.Model(&account.Account{}).Count(&out.AccountCount).Error; err != nil {
			return nil, unifyerror.DbError(err)
		}
		if err := model.DB.Model(&account.Role{}).Count(&out.RoleCount).Error; err != nil {
			return nil, unifyerror.DbError(err)
		}
		if err := model.DB.Model(&model.Resource{}).Count(&out.ResourceCount).Error; err != nil {
			return nil, unifyerror.DbError(err)
		}
	} else {
		out.AccountCount = 1
		out.RoleCount = 1
		if err := model.DB.Model(&model.Resource{}).
			Where("creator_id = ?", actorUserID).
			Count(&out.ResourceCount).Error; err != nil {
			return nil, unifyerror.DbError(err)
		}
	}

	_ = model.DB.Model(&model.DNSRecord{}).Count(&out.DNSRecordCount).Error

	snap, snapErr := identitySnapshot(ctx)
	if snapErr == nil {
		out.IdentityCount = visibleIdentityCount(snap, scope)
	}
	return out, nil
}

// GetTopology returns the dashboard tree.
func (s *dashboardService) GetTopology(actorUserID uint) (*TopologyNode, error) {
	return s.GetTopologyWithContext(context.Background(), actorUserID)
}

// GetTopologyWithContext builds the dashboard tree.
//
// The tree is driven entirely by the network snapshot, so a device can only
// appear under the owner headscale actually reports. Tagged devices appear under
// their own owner rather than silently vanishing or being attributed to the
// previous human owner.
func (s *dashboardService) GetTopologyWithContext(ctx context.Context, actorUserID uint) (*TopologyNode, error) {
	if err := RequirePermission(actorUserID, constants.PermDashboardView); err != nil {
		return nil, err
	}

	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, err
	}

	snap, err := identitySnapshot(ctx)
	if err != nil {
		return nil, unifyerror.HeadscaleAPIError(err)
	}

	root := &TopologyNode{
		Name:     "Headscale server",
		Type:     "server",
		Children: []*TopologyNode{},
	}

	for i := range snap.Identities {
		ident := &snap.Identities[i]
		if !scope.AllowsHeadscaleUser(ident.HSUserID) {
			continue
		}

		owner := &TopologyNode{
			Name:     ownerLabel(ident.Name, ident.Tagged),
			Type:     "owner",
			Children: []*TopologyNode{},
			Info: map[string]any{
				"hs_user_id": ident.HSUserID,
				"origin":     string(ident.Origin),
				"tagged":     ident.Tagged,
				"devices":    ident.DeviceCount,
			},
		}
		if ident.Binding != nil {
			owner.Info["account_id"] = ident.Binding.AccountID
		}

		for _, node := range snap.DevicesOf(ident.HSUserID) {
			owner.Children = append(owner.Children, &TopologyNode{
				Name: node.Name,
				Type: "device",
				Info: map[string]any{
					"id":     parseHSUserID(node.Id),
					"ip":     node.IpAddresses,
					"online": node.Online,
					"tags":   node.Tags,
				},
			})
		}
		root.Children = append(root.Children, owner)
	}

	// Owners referenced by a device but absent from the user list must still be
	// reachable, or their devices would become invisible in the UI.
	for _, orphan := range snap.Unlisted {
		if !scope.AllowsHeadscaleUser(orphan.HSUserID) {
			continue
		}
		root.Children = append(root.Children, &TopologyNode{
			Name: ownerLabel(orphan.Name, orphan.Tagged),
			Type: "owner",
			Info: map[string]any{
				"hs_user_id": orphan.HSUserID,
				"tagged":     orphan.Tagged,
				"devices":    orphan.DeviceCount,
				"unlisted":   true,
			},
		})
	}

	return root, nil
}

// ownerLabel renders an owner name, making the synthetic tagged owner explicit
// so an operator never reads it as a real person.
func ownerLabel(name string, tagged bool) string {
	if tagged && name == "" {
		return network.TaggedDevicesName
	}
	if name == "" {
		return "(unnamed)"
	}
	return name
}

// visibleIdentityCount counts the identities inside the actor's scope.
func visibleIdentityCount(snap *network.Snapshot, scope *actorScope) int64 {
	if snap == nil {
		return 0
	}
	if scope == nil || scope.isAdmin {
		return int64(len(snap.Identities))
	}

	var count int64
	for i := range snap.Identities {
		if scope.AllowsHeadscaleUser(snap.Identities[i].HSUserID) {
			count++
		}
	}
	return count
}
