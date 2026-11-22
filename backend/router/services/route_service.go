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
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/unifyerror"
	"net/netip"
)

const (
	exitRouteIPv4 = "0.0.0.0/0"
	exitRouteIPv6 = "::/0"
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
	if err := RequirePermission(actorUserID, constants.PermNetworkRouteList); err != nil {
		return nil, 0, err
	}
	page, pageSize = normalizePagination(page, pageSize)
	client, err := headscaleRESTClient()
	if err != nil {
		return nil, 0, err
	}
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, 0, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	nodes, listErr := client.ListNodes(queryCtx, "")
	if listErr != nil {
		return nil, 0, unifyerror.HeadscaleAPIError(listErr)
	}

	allRoutes := make([]HeadscaleRoute, 0)
	for i := range nodes {
		node := &nodes[i]
		if !actorCanAccessNode(scope, node) {
			continue
		}
		nodeID := parseHSUserID(node.Id)
		userName := node.User.Name

		// approvedRoutes is the state the operator controls; availableRoutes is
		// what the node advertises. A route only matters when both exist, but the
		// list shows advertised ones so a not-yet-approved route is visible.
		approvedSet := make(map[string]bool, len(node.ApprovedRoutes))
		for _, r := range node.ApprovedRoutes {
			approvedSet[r] = true
		}

		for _, cidr := range node.AvailableRoutes {
			route := HeadscaleRoute{
				ID:          fmt.Sprintf("%d-%s", nodeID, cidr),
				MachineID:   nodeID,
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
	if err := RequirePermission(actorUserID, constants.PermNetworkRouteUpdate); err != nil {
		return err
	}
	if err := validateMaskedCIDR(destination); err != nil {
		return err
	}
	client, err := headscaleRESTClient()
	if err != nil {
		return err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	node, getErr := client.GetNode(queryCtx, machineID)
	if getErr != nil {
		return unifyerror.HeadscaleAPIError(getErr)
	}
	if err := ensureActorCanAccessNode(actorUserID, node); err != nil {
		return err
	}

	routesToAdd := []string{destination}
	if isExitNodeRoute(destination) {
		routesToAdd = []string{exitRouteIPv4, exitRouteIPv6}
	}

	approved := append([]string(nil), node.ApprovedRoutes...)
	for _, wanted := range routesToAdd {
		if !containsString(approved, wanted) {
			approved = append(approved, wanted)
		}
	}

	if _, setErr := client.SetApprovedRoutes(queryCtx, machineID, approved); setErr != nil {
		return unifyerror.HeadscaleAPIError(setErr)
	}
	return nil
}

// DisableRoute removes a route from approved_routes on a node
func (s *routeService) DisableRoute(actorUserID uint, machineID uint64, destination string) error {
	return s.DisableRouteWithContext(context.Background(), actorUserID, machineID, destination)
}

func (s *routeService) DisableRouteWithContext(ctx context.Context, actorUserID uint, machineID uint64, destination string) error {
	if err := RequirePermission(actorUserID, constants.PermNetworkRouteUpdate); err != nil {
		return err
	}
	client, err := headscaleRESTClient()
	if err != nil {
		return err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	node, getErr := client.GetNode(queryCtx, machineID)
	if getErr != nil {
		return unifyerror.HeadscaleAPIError(getErr)
	}
	if err := ensureActorCanAccessNode(actorUserID, node); err != nil {
		return err
	}

	toRemove := map[string]bool{destination: true}
	if isExitNodeRoute(destination) {
		// The exit node is selected as a pair; leaving one half behind would
		// advertise an unreachable exit.
		toRemove = map[string]bool{exitRouteIPv4: true, exitRouteIPv6: true}
	}

	approved := make([]string, 0, len(node.ApprovedRoutes))
	for _, r := range node.ApprovedRoutes {
		if !toRemove[r] {
			approved = append(approved, r)
		}
	}

	if _, setErr := client.SetApprovedRoutes(queryCtx, machineID, approved); setErr != nil {
		return unifyerror.HeadscaleAPIError(setErr)
	}
	return nil
}

func containsString(values []string, want string) bool {
	for _, v := range values {
		if v == want {
			return true
		}
	}
	return false
}

// isExitNodeRoute checks if a route is an exit node route.
func isExitNodeRoute(destination string) bool {
	return destination == exitRouteIPv6 || destination == exitRouteIPv4
}

// validateMaskedCIDR rejects unmasked prefixes before calling Headscale,
// matching Headscale 0.30's strict util.CheckRouteMasked validation.
func validateMaskedCIDR(destination string) error {
	prefix, err := netip.ParsePrefix(destination)
	if err != nil {
		return unifyerror.WrongParam("destination")
	}
	if prefix != prefix.Masked() {
		return unifyerror.WrongParam(fmt.Sprintf("destination (%s must be masked as %s)", destination, prefix.Masked().String()))
	}
	return nil
}
