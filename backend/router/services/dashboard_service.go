package services

import (
	"context"
	"headscale-panel/model"
	v1 "headscale-panel/pkg/proto/headscale/v1"
)

type dashboardService struct{}

var DashboardService = new(dashboardService)

type OverviewResponse struct {
	UserCount         int64 `json:"user_count"`
	GroupCount        int64 `json:"group_count"`
	ResourceCount     int64 `json:"resource_count"`
	DeviceCount       int64 `json:"device_count"`
	OnlineDeviceCount int64 `json:"online_device_count"`
	DNSRecordCount    int64 `json:"dns_record_count"`
}

type DashboardTopologyNode struct {
	Name     string                   `json:"name"`
	Type     string                   `json:"type"` // server, group, user, device
	Children []*DashboardTopologyNode `json:"children,omitempty"`
	Info     interface{}              `json:"info,omitempty"`
}

func (s *dashboardService) GetOverview(actorUserID uint) (*OverviewResponse, error) {
	return s.GetOverviewWithContext(context.Background(), actorUserID)
}

func (s *dashboardService) GetOverviewWithContext(ctx context.Context, actorUserID uint) (*OverviewResponse, error) {
	if err := RequirePermission(actorUserID, "dashboard:view"); err != nil {
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

	deviceCount := int64(len(nodes))
	var onlineDeviceCount int64
	for _, node := range nodes {
		if node.Online {
			onlineDeviceCount++
		}
	}

	var userCount, groupCount, resourceCount, dnsRecordCount int64
	if scope.isAdmin {
		if err := model.DB.Model(&model.User{}).Count(&userCount).Error; err != nil {
			return nil, err
		}
		if err := model.DB.Model(&model.Group{}).Count(&groupCount).Error; err != nil {
			return nil, err
		}
		if err := model.DB.Model(&model.Resource{}).Count(&resourceCount).Error; err != nil {
			return nil, err
		}
		_ = model.DB.Model(&model.DNSRecord{}).Count(&dnsRecordCount).Error
	} else {
		var actor model.User
		if err := model.DB.Preload("Group").First(&actor, actorUserID).Error; err != nil {
			return nil, err
		}
		userCount = 1
		if actor.GroupID != 0 {
			groupCount = 1
		}
		if err := model.DB.Model(&model.Resource{}).Where("creator_id = ?", actorUserID).Count(&resourceCount).Error; err != nil {
			return nil, err
		}
	}

	return &OverviewResponse{
		UserCount:         userCount,
		GroupCount:        groupCount,
		ResourceCount:     resourceCount,
		DeviceCount:       deviceCount,
		OnlineDeviceCount: onlineDeviceCount,
		DNSRecordCount:    dnsRecordCount,
	}, nil
}

func (s *dashboardService) GetTopology(actorUserID uint) (*DashboardTopologyNode, error) {
	return s.GetTopologyWithContext(context.Background(), actorUserID)
}

func (s *dashboardService) GetTopologyWithContext(ctx context.Context, actorUserID uint) (*DashboardTopologyNode, error) {
	if err := RequirePermission(actorUserID, "dashboard:view"); err != nil {
		return nil, err
	}

	// Root: Headscale Server
	root := &DashboardTopologyNode{
		Name:     "Headscale Server",
		Type:     "server",
		Children: []*DashboardTopologyNode{},
	}

	nodesResp, scope, err := listAccessibleNodes(ctx, actorUserID)
	if err != nil {
		return nil, err
	}

	// Group nodes by user
	nodesByUser := make(map[string][]*v1.Node)
	for _, node := range nodesResp {
		if node.User != nil {
			nodesByUser[node.User.Name] = append(nodesByUser[node.User.Name], node)
		}
	}

	if !scope.isAdmin {
		var actor model.User
		if err := model.DB.Preload("Group").First(&actor, actorUserID).Error; err != nil {
			return nil, err
		}

		groupName := "Ungrouped"
		if actor.GroupID != 0 && actor.Group.Name != "" {
			groupName = actor.Group.Name
		}

		groupNode := &DashboardTopologyNode{
			Name:     groupName,
			Type:     "group",
			Children: []*DashboardTopologyNode{},
		}
		userNode := &DashboardTopologyNode{
			Name:     actor.Username,
			Type:     "user",
			Children: []*DashboardTopologyNode{},
		}
		for _, node := range nodesByUser[scope.headscaleName] {
			userNode.Children = append(userNode.Children, &DashboardTopologyNode{
				Name: node.Name,
				Type: "device",
				Info: map[string]interface{}{
					"ip":     node.IpAddresses,
					"id":     node.Id,
					"online": node.Online,
				},
			})
		}
		groupNode.Children = append(groupNode.Children, userNode)
		root.Children = append(root.Children, groupNode)
		return root, nil
	}

	// Level 2: Groups
	var groups []model.Group
	if err := model.DB.Preload("Users").Find(&groups).Error; err != nil {
		return nil, err
	}

	for _, g := range groups {
		groupNode := &DashboardTopologyNode{
			Name:     g.Name,
			Type:     "group",
			Children: []*DashboardTopologyNode{},
		}

		// Level 3: Users
		for _, u := range g.Users {
			userNode := &DashboardTopologyNode{
				Name:     u.Username,
				Type:     "user",
				Children: []*DashboardTopologyNode{},
			}

			// Level 4: Devices (Real Data)
			if nodes, ok := nodesByUser[u.Username]; ok {
				for _, node := range nodes {
					deviceNode := &DashboardTopologyNode{
						Name: node.Name,
						Type: "device",
						Info: map[string]interface{}{
							"ip":     node.IpAddresses,
							"id":     node.Id,
							"online": node.Online,
						},
					}
					userNode.Children = append(userNode.Children, deviceNode)
				}
			}

			groupNode.Children = append(groupNode.Children, userNode)
		}

		root.Children = append(root.Children, groupNode)
	}

	return root, nil
}
