package services

import (
	"context"
	"headscale-panel/model"
	"headscale-panel/pkg/headscale"
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
}

type DashboardTopologyNode struct {
	Name     string                   `json:"name"`
	Type     string                   `json:"type"` // server, group, user, device
	Children []*DashboardTopologyNode `json:"children,omitempty"`
	Info     interface{}              `json:"info,omitempty"`
}

func (s *dashboardService) GetOverview() (*OverviewResponse, error) {
	var userCount, groupCount, resourceCount int64
	model.DB.Model(&model.User{}).Count(&userCount)
	model.DB.Model(&model.Group{}).Count(&groupCount)
	model.DB.Model(&model.Resource{}).Count(&resourceCount)

	ctx := context.Background()
	nodesResp, err := headscale.GlobalClient.Service.ListNodes(ctx, &v1.ListNodesRequest{})
	if err != nil {
		return nil, err
	}

	deviceCount := int64(len(nodesResp.Nodes))
	var onlineDeviceCount int64
	for _, node := range nodesResp.Nodes {
		if node.Online {
			onlineDeviceCount++
		}
	}

	return &OverviewResponse{
		UserCount:         userCount,
		GroupCount:        groupCount,
		ResourceCount:     resourceCount,
		DeviceCount:       deviceCount,
		OnlineDeviceCount: onlineDeviceCount,
	}, nil
}

func (s *dashboardService) GetTopology() (*DashboardTopologyNode, error) {
	// Root: Headscale Server
	root := &DashboardTopologyNode{
		Name:     "Headscale Server",
		Type:     "server",
		Children: []*DashboardTopologyNode{},
	}

	ctx := context.Background()
	nodesResp, err := headscale.GlobalClient.Service.ListNodes(ctx, &v1.ListNodesRequest{})
	if err != nil {
		return nil, err
	}

	// Group nodes by user
	nodesByUser := make(map[string][]*v1.Node)
	for _, node := range nodesResp.Nodes {
		if node.User != nil {
			nodesByUser[node.User.Name] = append(nodesByUser[node.User.Name], node)
		}
	}

	// Level 2: Groups
	var groups []model.Group
	model.DB.Preload("Users").Find(&groups)

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
