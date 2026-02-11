package services

import (
	"context"
	"encoding/json"
	"fmt"
	"headscale-panel/pkg/headscale"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"strings"
	"time"
)

type topologyService struct{}

var TopologyService = &topologyService{}

// TopologyUser represents a user in the topology
type TopologyUser struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Email       string `json:"email,omitempty"`
	Provider    string `json:"provider,omitempty"`
	DeviceCount int    `json:"deviceCount"`
}

// TopologyDevice represents a device in the topology
type TopologyDevice struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	User        string   `json:"user"`
	Online      bool     `json:"online"`
	IPAddresses []string `json:"ipAddresses"`
	LastSeen    string   `json:"lastSeen"`
}

// TopologyACL represents an ACL rule
type TopologyACL struct {
	Src    string `json:"src"`
	Dst    string `json:"dst"`
	Action string `json:"action"` // "accept" or "deny"
}

// TopologyACLPolicy represents the full ACL policy for frontend
type TopologyACLPolicy struct {
	Groups map[string][]string `json:"groups"` // group:name -> [user emails]
	Hosts  map[string]string   `json:"hosts"`  // hostname -> IP/CIDR
}

// TopologyResponse is the response format expected by frontend
type TopologyResponse struct {
	Users   []TopologyUser     `json:"users"`
	Devices []TopologyDevice   `json:"devices"`
	ACL     []TopologyACL      `json:"acl"`
	Policy  *TopologyACLPolicy `json:"policy,omitempty"` // Full ACL policy for advanced parsing
}

// GetTopology generates network topology data in frontend-expected format
func (s *topologyService) GetTopology() (*TopologyResponse, error) {
	return s.GetTopologyWithContext(context.Background())
}

func (s *topologyService) GetTopologyWithContext(ctx context.Context) (*TopologyResponse, error) {
	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	// Get all users from Headscale
	usersResp, err := headscale.GlobalClient.Service.ListUsers(queryCtx, &v1.ListUsersRequest{})
	if err != nil {
		return nil, fmt.Errorf("failed to list users: %w", err)
	}

	// Get all nodes from Headscale
	nodesResp, err := headscale.GlobalClient.Service.ListNodes(queryCtx, &v1.ListNodesRequest{})
	if err != nil {
		return nil, fmt.Errorf("failed to list nodes: %w", err)
	}

	// Build user map for device count
	deviceCountByUser := make(map[string]int)
	for _, node := range nodesResp.Nodes {
		if node.User != nil {
			deviceCountByUser[node.User.Name]++
		}
	}

	// Build users list
	users := make([]TopologyUser, 0, len(usersResp.Users))
	for _, user := range usersResp.Users {
		users = append(users, TopologyUser{
			ID:          fmt.Sprintf("%d", user.Id),
			Name:        user.Name,
			Email:       user.Email,
			Provider:    user.Provider,
			DeviceCount: deviceCountByUser[user.Name],
		})
	}

	// Build devices list
	devices := make([]TopologyDevice, 0, len(nodesResp.Nodes))
	for _, node := range nodesResp.Nodes {
		userName := ""
		if node.User != nil {
			userName = node.User.Name
		}

		// Determine online status
		online := node.Online
		if !online && node.LastSeen != nil {
			lastSeen := node.LastSeen.AsTime()
			online = time.Since(lastSeen) < 5*time.Minute
		}

		lastSeenStr := ""
		if node.LastSeen != nil {
			lastSeenStr = node.LastSeen.AsTime().Format(time.RFC3339)
		}

		devices = append(devices, TopologyDevice{
			ID:          fmt.Sprintf("%d", node.Id),
			Name:        node.GivenName,
			User:        userName,
			Online:      online,
			IPAddresses: node.IpAddresses,
			LastSeen:    lastSeenStr,
		})
	}

	return &TopologyResponse{
		Users:   users,
		Devices: devices,
		ACL:     []TopologyACL{}, // Empty for basic topology
	}, nil
}

// GetACLMatrix generates ACL connectivity matrix
func (s *topologyService) GetACLMatrix() (map[string]map[string]string, error) {
	return s.GetACLMatrixWithContext(context.Background())
}

func (s *topologyService) GetACLMatrixWithContext(ctx context.Context) (map[string]map[string]string, error) {
	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	// Get all nodes
	nodesResp, err := headscale.GlobalClient.Service.ListNodes(queryCtx, &v1.ListNodesRequest{})
	if err != nil {
		return nil, fmt.Errorf("failed to list nodes: %w", err)
	}

	// Build matrix - same user devices can always communicate
	matrix := make(map[string]map[string]string)
	for _, source := range nodesResp.Nodes {
		sourceID := fmt.Sprintf("%d", source.Id)
		matrix[sourceID] = make(map[string]string)

		for _, target := range nodesResp.Nodes {
			targetID := fmt.Sprintf("%d", target.Id)
			// Default to unknown
			matrix[sourceID][targetID] = "unknown"

			// Same user devices can always communicate
			if source.User != nil && target.User != nil && source.User.Id == target.User.Id {
				matrix[sourceID][targetID] = "accept"
			}
		}
	}

	return matrix, nil
}

// GetTopologyWithACL generates topology with full ACL information
func (s *topologyService) GetTopologyWithACL() (*TopologyResponse, error) {
	return s.GetTopologyWithACLContext(context.Background())
}

func (s *topologyService) GetTopologyWithACLContext(ctx context.Context) (*TopologyResponse, error) {
	topology, err := s.GetTopologyWithContext(ctx)
	if err != nil {
		return nil, err
	}

	// Get ACL policy from Headscale
	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()
	policyResp, err := headscale.GlobalClient.Service.GetPolicy(queryCtx, &v1.GetPolicyRequest{})
	if err != nil {
		// If ACL fails, return topology without ACL
		return topology, nil
	}

	var policy struct {
		Groups map[string][]string `json:"groups"`
		Hosts  map[string]string   `json:"hosts"`
		ACLs   []struct {
			HAMeta *struct {
				Name string `json:"name"`
				Open bool   `json:"open"`
			} `json:"#ha-meta,omitempty"`
			Action string   `json:"action"`
			Src    []string `json:"src"`
			Dst    []string `json:"dst"`
		} `json:"acls"`
	}

	if err := json.Unmarshal([]byte(policyResp.Policy), &policy); err != nil {
		return topology, nil
	}

	// Store full policy for frontend
	topology.Policy = &TopologyACLPolicy{
		Groups: policy.Groups,
		Hosts:  policy.Hosts,
	}

	// Build user email to device mapping
	userToDevices := make(map[string][]TopologyDevice)
	deviceByIP := make(map[string]TopologyDevice)
	deviceByName := make(map[string]TopologyDevice)

	for _, device := range topology.Devices {
		userName := device.User
		userToDevices[userName] = append(userToDevices[userName], device)
		deviceByName[strings.ToLower(device.Name)] = device
		for _, ip := range device.IPAddresses {
			deviceByIP[ip] = device
		}
	}

	// Helper: Check if a user matches a group member pattern
	// Member patterns can be: "user@", "user@domain.com", "email@domain.com", "xinyun-local@"
	// User names from Headscale are like: "xinyun", "gggxbbb", etc.
	matchUserToMember := func(userName string, member string) bool {
		// Normalize: remove trailing @ and get base name
		memberClean := strings.TrimSuffix(member, "@")
		memberBase := strings.Split(memberClean, "@")[0]
		userNameLower := strings.ToLower(userName)
		memberBaseLower := strings.ToLower(memberBase)

		// Direct match
		if userNameLower == memberBaseLower {
			return true
		}

		// e.g. "xinyun-local" matches "xinyun"
		if strings.HasPrefix(memberBaseLower, userNameLower+"-") || strings.HasPrefix(memberBaseLower, userNameLower+"_") {
			return true
		}

		// Looser substring match
		// e.g., "xinyun-local" contains "xinyun"
		if strings.Contains(memberBaseLower, userNameLower) && len(userNameLower) >= 3 {
			return true
		}

		// Reverse substring match
		// e.g., user "gggxbbb" should match member "gggxbbb@foxmail.com"
		if strings.Contains(userNameLower, memberBaseLower) && len(memberBaseLower) >= 3 {
			return true
		}

		return false
	}

	// Helper: Get all devices belonging to users in a group
	getGroupDevices := func(groupName string) []TopologyDevice {
		var devices []TopologyDevice
		members, ok := policy.Groups[groupName]
		if !ok {
			return devices
		}

		for _, member := range members {
			for userName, userDevices := range userToDevices {
				if matchUserToMember(userName, member) {
					devices = append(devices, userDevices...)
				}
			}
		}
		return devices
	}

	// Helper: Resolve a destination to matching device IDs
	// Destination formats: "*:*", "group:xxx:*", "hostname:port", "ip:port", etc.
	resolveDestination := func(dst string) []string {
		var deviceIDs []string

		// Check for full wildcard "*:*"
		if dst == "*:*" || dst == "*" {
			for _, device := range topology.Devices {
				deviceIDs = append(deviceIDs, device.ID)
			}
			return deviceIDs
		}

		// Check for group destination: "group:xxx:*" or "group:xxx:port"
		if strings.HasPrefix(dst, "group:") {
			// Parse: group:name:ports
			parts := strings.SplitN(dst, ":", 3)
			if len(parts) >= 2 {
				groupName := parts[0] + ":" + parts[1] // "group:xxx"
				groupDevices := getGroupDevices(groupName)
				for _, device := range groupDevices {
					deviceIDs = append(deviceIDs, device.ID)
				}
			}
			return deviceIDs
		}

		// Parse target:ports format
		// Need to handle IPv4 addresses which contain dots and colons in port spec
		var target string
		if strings.Count(dst, ":") >= 1 {
			// Could be "hostname:port" or "ip:port"
			lastColonIdx := strings.LastIndex(dst, ":")
			target = dst[:lastColonIdx]
			if target == "" {
				target = dst
			}
		} else {
			target = dst
		}

		// hostIP is like "192.168.124.100/32"
		if hostIP, ok := policy.Hosts[target]; ok {
			baseIP := strings.Split(hostIP, "/")[0]
			// Find devices with this IP (for tailscale network devices)
			for _, device := range topology.Devices {
				for _, ip := range device.IPAddresses {
					if ip == baseIP {
						deviceIDs = append(deviceIDs, device.ID)
					}
				}
			}
			// Note: For hosts that are external (like 192.168.x.x),
			// they may not have a direct device but are accessed via routes
			return deviceIDs
		}

		if strings.Contains(target, ".") {
			baseIP := strings.Split(target, "/")[0]
			for _, device := range topology.Devices {
				for _, ip := range device.IPAddresses {
					if ip == baseIP {
						deviceIDs = append(deviceIDs, device.ID)
					}
				}
			}
			return deviceIDs
		}

		if device, ok := deviceByName[strings.ToLower(target)]; ok {
			deviceIDs = append(deviceIDs, device.ID)
		}

		return deviceIDs
	}

	// Build ACL matrix
	aclMatrix := make(map[string]map[string]string)
	for _, device := range topology.Devices {
		aclMatrix[device.ID] = make(map[string]string)
		for _, other := range topology.Devices {
			if device.ID != other.ID {
				aclMatrix[device.ID][other.ID] = "deny" // Default deny
			}
		}
	}

	// Process each ACL rule
	for _, rule := range policy.ACLs {
		if rule.Action != "accept" {
			continue // Only process accept rules for now
		}

		// For each source, find matching devices
		var srcDevices []TopologyDevice
		for _, src := range rule.Src {
			if src == "*" {
				srcDevices = append(srcDevices, topology.Devices...)
			} else if strings.HasPrefix(src, "group:") {
				srcDevices = append(srcDevices, getGroupDevices(src)...)
			} else {
				// Might be a user pattern like "user@"
				userPattern := strings.TrimSuffix(src, "@")
				userPattern = strings.Split(userPattern, "@")[0]
				for userName, devices := range userToDevices {
					if matchUserToMember(userName, src) {
						srcDevices = append(srcDevices, devices...)
					}
				}
				// Also try direct username match
				if devices, ok := userToDevices[userPattern]; ok {
					srcDevices = append(srcDevices, devices...)
				}
			}
		}

		// For each destination, resolve to device IDs
		var dstDeviceIDs []string
		for _, dst := range rule.Dst {
			dstDeviceIDs = append(dstDeviceIDs, resolveDestination(dst)...)
		}

		// Set access in matrix
		for _, srcDevice := range srcDevices {
			for _, dstID := range dstDeviceIDs {
				if srcDevice.ID != dstID {
					aclMatrix[srcDevice.ID][dstID] = "accept"
				}
			}
		}
	}

	// Same user devices can always communicate (implicit rule)
	for _, devices := range userToDevices {
		for _, d1 := range devices {
			for _, d2 := range devices {
				if d1.ID != d2.ID {
					aclMatrix[d1.ID][d2.ID] = "accept"
				}
			}
		}
	}

	// Build ACL list from matrix
	acl := make([]TopologyACL, 0)
	for srcID, targets := range aclMatrix {
		for dstID, action := range targets {
			if srcID != dstID && action == "accept" {
				acl = append(acl, TopologyACL{
					Src:    srcID,
					Dst:    dstID,
					Action: action,
				})
			}
		}
	}

	topology.ACL = acl
	return topology, nil
}
