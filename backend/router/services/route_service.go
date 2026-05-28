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
	"fmt"
	"headscale-panel/pkg/unifyerror"
	v1 "github.com/juanfont/headscale/gen/go/headscale/v1"
)

type routeService struct{}

var RouteService = &routeService{}

// HeadscaleRoute represents a route fetched from Headscale gRPC
type HeadscaleRoute struct {
	ID          string `json:"id"`
	MachineID   uint64 `json:"machine_id"`
	MachineName string `json:"machine_name"`
	UserName    string `json:"user_name"`
	Destination string `json:"destination"`
	Enabled     bool   `json:"enabled"`    // whether the route is in approved_routes
	Advertised  bool   `json:"advertised"` // whether the route is in available_routes
	IsExitNode  bool   `json:"is_exit_node"`
}

// ListRoutes fetches routes from all nodes in Headscale via gRPC
func (s *routeService) ListRoutes(actorUserID uint, page, pageSize int, userFilter string, machineIDFilter string) ([]HeadscaleRoute, int64, error) {
	return s.ListRoutesWithContext(context.Background(), actorUserID, page, pageSize, userFilter, machineIDFilter)
}

func (s *routeService) ListRoutesWithContext(ctx context.Context, actorUserID uint, page, pageSize int, userFilter string, machineIDFilter string) ([]HeadscaleRoute, int64, error) {
	if err := RequirePermission(actorUserID, "headscale:route:list"); err != nil {
		return nil, 0, err
	}
	page, pageSize = normalizePagination(page, pageSize)
	client, err := headscaleServiceClient()
	if err != nil {
		return nil, 0, unifyerror.GRPCError(err)
	}
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, 0, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, grpcErr := client.ListNodes(queryCtx, &v1.ListNodesRequest{})
	if grpcErr != nil {
		return nil, 0, unifyerror.GRPCError(grpcErr)
	}

	allRoutes := make([]HeadscaleRoute, 0)
	for _, node := range resp.Nodes {
		if !actorCanAccessNode(scope, node) {
			continue
		}
		userName := ""
		if node.User != nil {
			userName = node.User.Name
		}

		// Build approved set
		approvedSet := make(map[string]bool)
		for _, r := range node.ApprovedRoutes {
			approvedSet[r] = true
		}

		// available_routes contains all routes the node advertises
		for _, cidr := range node.AvailableRoutes {
			route := HeadscaleRoute{
				ID:          fmt.Sprintf("%d-%s", node.Id, cidr),
				MachineID:   node.Id,
				MachineName: node.GivenName,
				UserName:    userName,
				Destination: cidr,
				Advertised:  true,
				Enabled:     approvedSet[cidr],
				IsExitNode:  isExitNodeRoute(cidr),
			}
			if route.MachineName == "" {
				route.MachineName = node.Name
			}
			allRoutes = append(allRoutes, route)
		}
	}

	// Filter by user
	if userFilter != "" {
		filtered := make([]HeadscaleRoute, 0)
		for _, r := range allRoutes {
			if r.UserName == userFilter {
				filtered = append(filtered, r)
			}
		}
		allRoutes = filtered
	}

	// Filter by machine ID
	if machineIDFilter != "" {
		filtered := make([]HeadscaleRoute, 0)
		for _, r := range allRoutes {
			if fmt.Sprintf("%d", r.MachineID) == machineIDFilter {
				filtered = append(filtered, r)
			}
		}
		allRoutes = filtered
	}

	total := int64(len(allRoutes))

	// Paginate (pageSize < 0 means return all)
	if pageSize < 0 {
		return allRoutes, total, nil
	}
	start := (page - 1) * pageSize
	if start >= len(allRoutes) {
		return []HeadscaleRoute{}, total, nil
	}
	end := start + pageSize
	if end > len(allRoutes) {
		end = len(allRoutes)
	}

	return allRoutes[start:end], total, nil
}

// EnableRoute approves a route on a node (adds to approved_routes)
func (s *routeService) EnableRoute(actorUserID uint, machineID uint64, destination string) error {
	return s.EnableRouteWithContext(context.Background(), actorUserID, machineID, destination)
}

func (s *routeService) EnableRouteWithContext(ctx context.Context, actorUserID uint, machineID uint64, destination string) error {
	if err := RequirePermission(actorUserID, "headscale:route:enable"); err != nil {
		return err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	// Get current node state
	node, grpcErr := client.GetNode(queryCtx, &v1.GetNodeRequest{
		NodeId: machineID,
	})
	if grpcErr != nil {
		return unifyerror.GRPCError(grpcErr)
	}
	if err := ensureActorCanAccessNode(actorUserID, node.Node); err != nil {
		return err
	}

	// Determine routes to add
	routesToAdd := []string{destination}
	if isExitNodeRoute(destination) {
		routesToAdd = []string{"0.0.0.0/0", "::/0"}
	}

	// Add routes to approved routes if not present
	approvedRoutes := node.Node.ApprovedRoutes
	for _, newRoute := range routesToAdd {
		exists := false
		for _, r := range approvedRoutes {
			if r == newRoute {
				exists = true
				break
			}
		}
		if !exists {
			approvedRoutes = append(approvedRoutes, newRoute)
		}
	}

	_, grpcErr = client.SetApprovedRoutes(queryCtx, &v1.SetApprovedRoutesRequest{
		NodeId: machineID,
		Routes: approvedRoutes,
	})
	if grpcErr != nil {
		return unifyerror.GRPCError(grpcErr)
	}

	return nil
}

// DisableRoute removes a route from approved_routes on a node
func (s *routeService) DisableRoute(actorUserID uint, machineID uint64, destination string) error {
	return s.DisableRouteWithContext(context.Background(), actorUserID, machineID, destination)
}

func (s *routeService) DisableRouteWithContext(ctx context.Context, actorUserID uint, machineID uint64, destination string) error {
	if err := RequirePermission(actorUserID, "headscale:route:disable"); err != nil {
		return err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	// Get current node state
	node, grpcErr := client.GetNode(queryCtx, &v1.GetNodeRequest{
		NodeId: machineID,
	})
	if grpcErr != nil {
		return unifyerror.GRPCError(grpcErr)
	}
	if err := ensureActorCanAccessNode(actorUserID, node.Node); err != nil {
		return err
	}

	// Determine routes to remove
	routesToRemove := map[string]bool{destination: true}
	if isExitNodeRoute(destination) {
		routesToRemove = map[string]bool{"0.0.0.0/0": true, "::/0": true}
	}

	// Remove routes from approved routes
	approvedRoutes := []string{}
	for _, r := range node.Node.ApprovedRoutes {
		if !routesToRemove[r] {
			approvedRoutes = append(approvedRoutes, r)
		}
	}

	_, grpcErr = client.SetApprovedRoutes(queryCtx, &v1.SetApprovedRoutesRequest{
		NodeId: machineID,
		Routes: approvedRoutes,
	})
	if grpcErr != nil {
		return unifyerror.GRPCError(grpcErr)
	}

	return nil
}

// isExitNodeRoute checks if a route is an exit node route
func isExitNodeRoute(destination string) bool {
	return destination == "::/0" || destination == "0.0.0.0/0"
}
