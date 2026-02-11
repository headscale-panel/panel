package services

import (
	"context"
	"fmt"
	v1 "headscale-panel/pkg/proto/headscale/v1"
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
		return nil, 0, err
	}
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, 0, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, err := client.ListNodes(queryCtx, &v1.ListNodesRequest{})
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list nodes from Headscale: %w", err)
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

	// Paginate
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
	node, err := client.GetNode(queryCtx, &v1.GetNodeRequest{
		NodeId: machineID,
	})
	if err != nil {
		return fmt.Errorf("failed to get node: %w", err)
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

	_, err = client.SetApprovedRoutes(queryCtx, &v1.SetApprovedRoutesRequest{
		NodeId: machineID,
		Routes: approvedRoutes,
	})
	if err != nil {
		return fmt.Errorf("failed to set approved routes: %w", err)
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
	node, err := client.GetNode(queryCtx, &v1.GetNodeRequest{
		NodeId: machineID,
	})
	if err != nil {
		return fmt.Errorf("failed to get node: %w", err)
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

	_, err = client.SetApprovedRoutes(queryCtx, &v1.SetApprovedRoutesRequest{
		NodeId: machineID,
		Routes: approvedRoutes,
	})
	if err != nil {
		return fmt.Errorf("failed to set approved routes: %w", err)
	}

	return nil
}

// isExitNodeRoute checks if a route is an exit node route
func isExitNodeRoute(destination string) bool {
	return destination == "::/0" || destination == "0.0.0.0/0"
}
