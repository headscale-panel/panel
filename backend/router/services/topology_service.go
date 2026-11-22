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
	"encoding/json"
	"headscale-panel/model"
	"headscale-panel/pkg/acl"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/unifyerror"
	"strconv"
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
	Tags        []string `json:"tags,omitempty"`
}

// TopologyACL represents an ACL rule
type TopologyACL struct {
	Src    string `json:"src"`
	Dst    string `json:"dst"`
	Action string `json:"action"` // "accept" or "deny"
}

// TopologyACLPolicy represents the full ACL policy for frontend
type TopologyACLPolicy struct {
	Groups    map[string][]string `json:"groups"`    // group:name -> [user emails]
	Hosts     map[string]string   `json:"hosts"`     // hostname -> IP/CIDR
	TagOwners map[string][]string `json:"tagOwners"` // tag:name -> [owners]
}

// TopologyResponse is the response format expected by frontend
type TopologyResponse struct {
	Users   []TopologyUser     `json:"users"`
	Devices []TopologyDevice   `json:"devices"`
	ACL     []TopologyACL      `json:"acl"`
	Policy  *TopologyACLPolicy `json:"policy,omitempty"` // Full ACL policy for advanced parsing
}

// GetTopology generates network topology data in frontend-expected format
func (s *topologyService) GetTopology(actorUserID uint) (*TopologyResponse, error) {
	return s.GetTopologyWithContext(context.Background(), actorUserID)
}

func (s *topologyService) GetTopologyWithContext(ctx context.Context, actorUserID uint) (*TopologyResponse, error) {
	if err := RequirePermission(actorUserID, constants.PermTopologyView); err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, err
	}

	// One snapshot for the whole view. Building users and devices from separate
	// upstream reads lets a device be reparented between two calls, which shows a
	// node under one owner and counts it against another.
	snapshot, err := Network.Snapshot(queryCtx, currentPanelIssuer())
	if err != nil {
		return nil, unifyerror.HeadscaleAPIError(err)
	}

	userViews := make([]TopologyUser, 0, len(snapshot.Identities))
	for _, identity := range snapshot.Identities {
		if !scope.isAdmin && !scope.AllowsHeadscaleUser(identity.HSUserID) {
			continue
		}
		userViews = append(userViews, TopologyUser{
			ID:          strconv.FormatUint(identity.HSUserID, 10),
			Name:        identity.Name,
			Email:       identity.Email,
			Provider:    identity.Provider,
			DeviceCount: identity.DeviceCount,
		})
	}

	devices := make([]TopologyDevice, 0, len(snapshot.Nodes()))
	for _, node := range snapshot.Nodes() {
		if !scope.isAdmin && !scope.AllowsHeadscaleUser(parseHSUserID(node.User.Id)) {
			continue
		}

		online := node.Online
		if !online && node.LastSeen != nil {
			// headscale's online flag is authoritative for "connected now", but a
			// node that dropped a moment ago still reads as present to a user.
			online = time.Since(*node.LastSeen) < 5*time.Minute
		}

		lastSeen := ""
		if node.LastSeen != nil {
			lastSeen = node.LastSeen.Format(time.RFC3339)
		}

		name := node.GivenName
		if name == "" {
			name = node.Name
		}

		devices = append(devices, TopologyDevice{
			ID:          node.Id,
			Name:        name,
			User:        node.User.Name,
			Online:      online,
			IPAddresses: node.IpAddresses,
			LastSeen:    lastSeen,
			Tags:        node.Tags,
		})
	}

	return &TopologyResponse{
		Users:   userViews,
		Devices: devices,
		ACL:     []TopologyACL{}, // Empty for basic topology
	}, nil
}

// GetACLMatrix generates ACL connectivity matrix
func (s *topologyService) GetACLMatrix(actorUserID uint) (map[string]map[string]string, error) {
	return s.GetACLMatrixWithContext(context.Background(), actorUserID)
}

func (s *topologyService) GetACLMatrixWithContext(ctx context.Context, actorUserID uint) (map[string]map[string]string, error) {
	if err := RequirePermission(actorUserID, constants.PermTopologyACLView); err != nil {
		return nil, err
	}

	nodesResp, _, err := listAccessibleNodes(ctx, actorUserID)
	if err != nil {
		return nil, err
	}

	// Build matrix - same user devices can always communicate
	matrix := make(map[string]map[string]string)
	for i := range nodesResp {
		source := &nodesResp[i]
		matrix[source.Id] = make(map[string]string)

		for j := range nodesResp {
			target := &nodesResp[j]
			matrix[source.Id][target.Id] = "unknown"

			// Devices owned by the same headscale user can always talk, which
			// headscale enforces before policy is even consulted.
			if source.User.Id != "" && source.User.Id == target.User.Id {
				matrix[source.Id][target.Id] = "accept"
			}
		}
	}

	return matrix, nil
}

// GetTopologyWithACL generates topology with full ACL information
func (s *topologyService) GetTopologyWithACL(actorUserID uint) (*TopologyResponse, error) {
	return s.GetTopologyWithACLContext(context.Background(), actorUserID)
}

func (s *topologyService) GetTopologyWithACLContext(ctx context.Context, actorUserID uint) (*TopologyResponse, error) {
	if err := RequirePermission(actorUserID, constants.PermTopologyACLView); err != nil {
		return nil, err
	}

	topology, err := s.GetTopologyWithContext(ctx, actorUserID)
	if err != nil {
		return nil, err
	}
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, err
	}

	// Get ACL policy from Headscale
	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()
	aclClient, err := headscaleRESTClient()
	if err != nil {
		return topology, nil
	}
	policyResp, policyErr := aclClient.GetPolicy(queryCtx)
	if policyErr != nil {
		// A missing or unreadable policy degrades the view to "no edges" rather
		// than failing the whole topology render.
		return topology, nil
	}

	var policy model.ACLPolicyStructure
	if err := json.Unmarshal([]byte(policyResp.Policy), &policy); err != nil {
		return topology, nil
	}

	// Store full policy for frontend
	if scope.isAdmin {
		topology.Policy = &TopologyACLPolicy{
			Groups:    policy.Groups,
			Hosts:     policy.Hosts,
			TagOwners: policy.TagOwners,
		}
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

	// Get all devices belonging to users in a group
	getGroupDevices := func(groupName string) []TopologyDevice {
		var devices []TopologyDevice
		members := acl.GetGroupMembers(&policy, groupName)
		for _, member := range members {
			for userName, userDevices := range userToDevices {
				if acl.MatchUserToMember(userName, member) {
					devices = append(devices, userDevices...)
				}
			}
		}
		return devices
	}

	getTaggedDevices := func(tagName string) []TopologyDevice {
		var devices []TopologyDevice
		for _, device := range topology.Devices {
			for _, tag := range device.Tags {
				if strings.EqualFold(strings.TrimSpace(tag), strings.TrimSpace(tagName)) {
					devices = append(devices, device)
					break
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

		if strings.HasPrefix(dst, "tag:") {
			parts := strings.SplitN(dst, ":", 3)
			tagName := dst
			if len(parts) >= 2 {
				tagName = parts[0] + ":" + parts[1]
			}
			for _, device := range getTaggedDevices(tagName) {
				deviceIDs = append(deviceIDs, device.ID)
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
	applyNetworkRule := func(sources, destinations []string) {
		var srcDevices []TopologyDevice
		for _, src := range sources {
			if src == "*" {
				srcDevices = append(srcDevices, topology.Devices...)
			} else if strings.HasPrefix(src, "group:") {
				srcDevices = append(srcDevices, getGroupDevices(src)...)
			} else if strings.HasPrefix(src, "tag:") {
				srcDevices = append(srcDevices, getTaggedDevices(src)...)
			} else if src == "autogroup:member" {
				for _, device := range topology.Devices {
					if len(device.Tags) == 0 {
						srcDevices = append(srcDevices, device)
					}
				}
			} else if src == "autogroup:tagged" {
				for _, device := range topology.Devices {
					if len(device.Tags) > 0 {
						srcDevices = append(srcDevices, device)
					}
				}
			} else {
				for userName, devices := range userToDevices {
					if acl.MatchUserToMember(userName, src) {
						srcDevices = append(srcDevices, devices...)
					}
				}
			}
		}

		for _, srcDevice := range srcDevices {
			var dstDeviceIDs []string
			for _, dst := range destinations {
				switch dst {
				case "autogroup:self", "autogroup:self:*":
					for _, device := range userToDevices[srcDevice.User] {
						dstDeviceIDs = append(dstDeviceIDs, device.ID)
					}
				case "autogroup:member", "autogroup:member:*":
					for _, device := range topology.Devices {
						if len(device.Tags) == 0 {
							dstDeviceIDs = append(dstDeviceIDs, device.ID)
						}
					}
				case "autogroup:tagged", "autogroup:tagged:*":
					for _, device := range topology.Devices {
						if len(device.Tags) > 0 {
							dstDeviceIDs = append(dstDeviceIDs, device.ID)
						}
					}
				default:
					dstDeviceIDs = append(dstDeviceIDs, resolveDestination(dst)...)
				}
			}
			for _, dstID := range dstDeviceIDs {
				if srcDevice.ID != dstID {
					aclMatrix[srcDevice.ID][dstID] = "accept"
				}
			}
		}
	}

	if policy.ACLs == nil && policy.Grants == nil {
		applyNetworkRule([]string{"*"}, []string{"*"})
	} else {
		for _, rule := range policy.ACLs {
			if rule.Action == "accept" {
				applyNetworkRule(rule.Src, rule.Dst)
			}
		}
		for _, grant := range policy.Grants {
			if acl.GrantHasNetworkAccess(grant) {
				applyNetworkRule(grant.Src, grant.Dst)
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
