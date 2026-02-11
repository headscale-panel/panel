package services

import (
	"context"
	"encoding/json"
	"fmt"
	"headscale-panel/model"
	"headscale-panel/pkg/headscale"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"strings"
	"time"

	"github.com/tailscale/hujson"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type headscaleService struct{}

var HeadscaleService = new(headscaleService)

// HeadscaleUser represents a user fetched from Headscale gRPC
type HeadscaleUser struct {
	ID            uint64 `json:"id"`
	Name          string `json:"name"`
	CreatedAt     string `json:"created_at"`
	DisplayName   string `json:"display_name"`
	Email         string `json:"email"`
	Provider      string `json:"provider"`
	ProviderID    string `json:"provider_id"`
	ProfilePicURL string `json:"profile_pic_url"`
}

// HeadscaleMachine represents a machine/node fetched from Headscale gRPC
type HeadscaleMachine struct {
	ID              uint64            `json:"id"`
	MachineKey      string            `json:"machine_key"`
	NodeKey         string            `json:"node_key"`
	DiscoKey        string            `json:"disco_key"`
	IPAddresses     []string          `json:"ip_addresses"`
	Name            string            `json:"name"`
	GivenName       string            `json:"given_name"`
	User            *HeadscaleUser    `json:"user"`
	Online          bool              `json:"online"`
	LastSeen        *time.Time        `json:"last_seen"`
	Expiry          *time.Time        `json:"expiry"`
	CreatedAt       *time.Time        `json:"created_at"`
	RegisterMethod  string            `json:"register_method"`
	ForcedTags      []string          `json:"forced_tags"`
	InvalidTags     []string          `json:"invalid_tags"`
	ValidTags       []string          `json:"valid_tags"`
	ApprovedRoutes  []string          `json:"approved_routes"`
	AvailableRoutes []string          `json:"available_routes"`
	SubnetRoutes    []string          `json:"subnet_routes"`
	PreAuthKey      *HeadscaleAuthKey `json:"pre_auth_key,omitempty"`
}

// HeadscaleAuthKey represents pre-auth key info
type HeadscaleAuthKey struct {
	ID        uint64 `json:"id"`
	Key       string `json:"key"`
	User      string `json:"user"`
	Reusable  bool   `json:"reusable"`
	Ephemeral bool   `json:"ephemeral"`
	Used      bool   `json:"used"`
}

// ListHeadscaleUsers fetches users directly from Headscale via gRPC
func (s *headscaleService) ListHeadscaleUsers(actorUserID uint) ([]HeadscaleUser, error) {
	if err := RequirePermission(actorUserID, "headscale:user:list"); err != nil {
		return nil, err
	}

	ctx := context.Background()
	resp, err := headscale.GlobalClient.Service.ListUsers(ctx, &v1.ListUsersRequest{})
	if err != nil {
		return nil, fmt.Errorf("failed to list users from Headscale: %w", err)
	}

	users := make([]HeadscaleUser, 0, len(resp.Users))
	for _, u := range resp.Users {
		user := HeadscaleUser{
			ID:            u.Id,
			Name:          u.Name,
			DisplayName:   u.DisplayName,
			Email:         u.Email,
			Provider:      u.Provider,
			ProviderID:    u.ProviderId,
			ProfilePicURL: u.ProfilePicUrl,
		}
		if u.CreatedAt != nil {
			user.CreatedAt = u.CreatedAt.AsTime().Format(time.RFC3339)
		}
		users = append(users, user)
	}
	return users, nil
}

// ListMachines fetches machines directly from Headscale via gRPC with in-memory pagination/filtering
func (s *headscaleService) ListMachines(actorUserID uint, page, pageSize int, userFilter string, statusFilter string) ([]HeadscaleMachine, int64, error) {
	if err := RequirePermission(actorUserID, "headscale:machine:list"); err != nil {
		return nil, 0, err
	}

	ctx := context.Background()
	resp, err := headscale.GlobalClient.Service.ListNodes(ctx, &v1.ListNodesRequest{})
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list nodes from Headscale: %w", err)
	}

	// Convert all nodes to our format
	allMachines := make([]HeadscaleMachine, 0, len(resp.Nodes))
	for _, node := range resp.Nodes {
		machine := s.nodeToMachine(node)
		allMachines = append(allMachines, machine)
	}

	// Filter by user
	if userFilter != "" {
		filtered := make([]HeadscaleMachine, 0)
		for _, m := range allMachines {
			if m.User != nil && m.User.Name == userFilter {
				filtered = append(filtered, m)
			}
		}
		allMachines = filtered
	}

	// Filter by status (online/offline)
	if statusFilter != "" {
		filtered := make([]HeadscaleMachine, 0)
		for _, m := range allMachines {
			switch statusFilter {
			case "online":
				if m.Online {
					filtered = append(filtered, m)
				}
			case "offline":
				if !m.Online {
					filtered = append(filtered, m)
				}
			}
		}
		allMachines = filtered
	}

	total := int64(len(allMachines))

	// Paginate
	start := (page - 1) * pageSize
	if start >= len(allMachines) {
		return []HeadscaleMachine{}, total, nil
	}
	end := start + pageSize
	if end > len(allMachines) {
		end = len(allMachines)
	}

	return allMachines[start:end], total, nil
}

// GetMachine fetches a single machine by ID from Headscale
func (s *headscaleService) GetMachine(actorUserID uint, nodeID uint64) (*HeadscaleMachine, error) {
	if err := RequirePermission(actorUserID, "headscale:machine:get"); err != nil {
		return nil, err
	}

	ctx := context.Background()
	resp, err := headscale.GlobalClient.Service.GetNode(ctx, &v1.GetNodeRequest{
		NodeId: nodeID,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get node from Headscale: %w", err)
	}
	machine := s.nodeToMachine(resp.Node)
	return &machine, nil
}

// GetAccessibleMachines fetches machines from Headscale, optionally filtering by user
func (s *headscaleService) GetAccessibleMachines(actorUserID uint, userID uint, canAccessAll bool) ([]HeadscaleMachine, error) {
	if err := RequirePermission(actorUserID, "headscale:acl:access"); err != nil {
		return nil, err
	}

	ctx := context.Background()
	resp, err := headscale.GlobalClient.Service.ListNodes(ctx, &v1.ListNodesRequest{})
	if err != nil {
		return nil, fmt.Errorf("failed to list nodes from Headscale: %w", err)
	}

	machines := make([]HeadscaleMachine, 0, len(resp.Nodes))
	for _, node := range resp.Nodes {
		machine := s.nodeToMachine(node)

		if canAccessAll {
			machines = append(machines, machine)
		} else {
			// Filter by matching user: find panel user by ID, get headscale_name
			var panelUser model.User
			if err := model.DB.First(&panelUser, userID).Error; err == nil {
				if machine.User != nil && machine.User.Name == panelUser.HeadscaleName {
					machines = append(machines, machine)
				}
			}
		}
	}
	return machines, nil
}

// RenameMachine renames a node in Headscale
func (s *headscaleService) RenameMachine(actorUserID uint, nodeID uint64, newName string) (*HeadscaleMachine, error) {
	if err := RequirePermission(actorUserID, "headscale:machine:update"); err != nil {
		return nil, err
	}

	ctx := context.Background()
	resp, err := headscale.GlobalClient.Service.RenameNode(ctx, &v1.RenameNodeRequest{
		NodeId:  nodeID,
		NewName: newName,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to rename node: %w", err)
	}
	machine := s.nodeToMachine(resp.Node)
	return &machine, nil
}

// DeleteMachine deletes a node from Headscale
func (s *headscaleService) DeleteMachine(actorUserID uint, nodeID uint64) error {
	if err := RequirePermission(actorUserID, "headscale:machine:delete"); err != nil {
		return err
	}

	ctx := context.Background()
	_, err := headscale.GlobalClient.Service.DeleteNode(ctx, &v1.DeleteNodeRequest{
		NodeId: nodeID,
	})
	if err != nil {
		return fmt.Errorf("failed to delete node: %w", err)
	}
	return nil
}

// ExpireMachine expires a node in Headscale
func (s *headscaleService) ExpireMachine(actorUserID uint, nodeID uint64) (*HeadscaleMachine, error) {
	if err := RequirePermission(actorUserID, "headscale:machine:expire"); err != nil {
		return nil, err
	}

	ctx := context.Background()
	resp, err := headscale.GlobalClient.Service.ExpireNode(ctx, &v1.ExpireNodeRequest{
		NodeId: nodeID,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to expire node: %w", err)
	}
	machine := s.nodeToMachine(resp.Node)
	return &machine, nil
}

// SetMachineTags sets tags on a node in Headscale
func (s *headscaleService) SetMachineTags(actorUserID uint, nodeID uint64, tags []string) (*HeadscaleMachine, error) {
	if err := RequirePermission(actorUserID, "headscale:machine:tags"); err != nil {
		return nil, err
	}

	ctx := context.Background()
	resp, err := headscale.GlobalClient.Service.SetTags(ctx, &v1.SetTagsRequest{
		NodeId: nodeID,
		Tags:   tags,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to set tags: %w", err)
	}
	machine := s.nodeToMachine(resp.Node)
	return &machine, nil
}

// CreateUser creates a user in Headscale
func (s *headscaleService) CreateUser(actorUserID uint, name string) (*HeadscaleUser, error) {
	if err := RequirePermission(actorUserID, "headscale:user:create"); err != nil {
		return nil, err
	}

	ctx := context.Background()
	resp, err := headscale.GlobalClient.Service.CreateUser(ctx, &v1.CreateUserRequest{
		Name: name,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}
	user := HeadscaleUser{
		ID:   resp.User.Id,
		Name: resp.User.Name,
	}
	if resp.User.CreatedAt != nil {
		user.CreatedAt = resp.User.CreatedAt.AsTime().Format(time.RFC3339)
	}
	return &user, nil
}

// RenameUser renames a user in Headscale
func (s *headscaleService) RenameUser(actorUserID uint, oldID uint64, newName string) (*HeadscaleUser, error) {
	if err := RequirePermission(actorUserID, "headscale:user:update"); err != nil {
		return nil, err
	}

	ctx := context.Background()
	resp, err := headscale.GlobalClient.Service.RenameUser(ctx, &v1.RenameUserRequest{
		OldId:   oldID,
		NewName: newName,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to rename user: %w", err)
	}
	user := HeadscaleUser{
		ID:   resp.User.Id,
		Name: resp.User.Name,
	}
	return &user, nil
}

// DeleteUser deletes a user in Headscale
func (s *headscaleService) DeleteUser(actorUserID uint, id uint64) error {
	if err := RequirePermission(actorUserID, "headscale:user:delete"); err != nil {
		return err
	}

	ctx := context.Background()
	_, err := headscale.GlobalClient.Service.DeleteUser(ctx, &v1.DeleteUserRequest{
		Id: id,
	})
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}
	return nil
}

// GetPreAuthKeys gets pre-auth keys for a user
func (s *headscaleService) GetPreAuthKeys(actorUserID uint, userID uint64) (interface{}, error) {
	if err := RequirePermission(actorUserID, "headscale:preauthkey:list"); err != nil {
		return nil, err
	}

	ctx := context.Background()
	resp, err := headscale.GlobalClient.Service.ListPreAuthKeys(ctx, &v1.ListPreAuthKeysRequest{
		User: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list pre-auth keys: %w", err)
	}
	return resp.PreAuthKeys, nil
}

// CreatePreAuthKey creates a pre-auth key for a user
func (s *headscaleService) CreatePreAuthKey(actorUserID uint, userID uint64, reusable, ephemeral bool, expiration string) (interface{}, error) {
	if err := RequirePermission(actorUserID, "headscale:preauthkey:create"); err != nil {
		return nil, err
	}

	ctx := context.Background()
	req := &v1.CreatePreAuthKeyRequest{
		User:      userID,
		Reusable:  reusable,
		Ephemeral: ephemeral,
	}
	if expiration != "" {
		t, err := time.Parse(time.RFC3339, expiration)
		if err == nil {
			req.Expiration = timestamppb.New(t)
		}
	}
	resp, err := headscale.GlobalClient.Service.CreatePreAuthKey(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("failed to create pre-auth key: %w", err)
	}
	return resp.PreAuthKey, nil
}

// ExpirePreAuthKey expires a pre-auth key
func (s *headscaleService) ExpirePreAuthKey(actorUserID uint, userID uint64, key string) error {
	if err := RequirePermission(actorUserID, "headscale:preauthkey:expire"); err != nil {
		return err
	}

	ctx := context.Background()
	_, err := headscale.GlobalClient.Service.ExpirePreAuthKey(ctx, &v1.ExpirePreAuthKeyRequest{
		User: userID,
		Key:  key,
	})
	if err != nil {
		return fmt.Errorf("failed to expire pre-auth key: %w", err)
	}
	return nil
}

// SyncACL fetches the ACL from Headscale and syncs groups to local DB
func (s *headscaleService) SyncACL() error {
	ctx := context.Background()
	resp, err := headscale.GlobalClient.Service.GetPolicy(ctx, &v1.GetPolicyRequest{})
	if err != nil {
		return err
	}

	// Parse HuJSON
	ast, err := hujson.Parse([]byte(resp.Policy))
	if err != nil {
		return err
	}
	ast.Standardize()
	data := ast.Pack()

	var policy model.ACLPolicyStructure
	if err := json.Unmarshal(data, &policy); err != nil {
		return err
	}

	// Sync Groups
	for groupName := range policy.Groups {
		name := strings.TrimPrefix(groupName, "group:")
		var group model.Group
		if err := model.DB.Where("name = ?", name).First(&group).Error; err != nil {
			group = model.Group{
				Name: name,
			}
			model.DB.Create(&group)
		}
	}

	// Sync Hosts as Resources
	for hostName, ip := range policy.Hosts {
		var resource model.Resource
		if err := model.DB.Where("name = ?", hostName).First(&resource).Error; err != nil {
			resource = model.Resource{
				Name:        hostName,
				IPAddress:   ip,
				Description: "Synced from Headscale ACL",
				CreatorID:   1,
			}
			model.DB.Create(&resource)
		} else {
			resource.IPAddress = ip
			model.DB.Save(&resource)
		}
	}

	return nil
}

// nodeToMachine converts a protobuf Node to our HeadscaleMachine struct
func (s *headscaleService) nodeToMachine(node *v1.Node) HeadscaleMachine {
	machine := HeadscaleMachine{
		ID:              node.Id,
		MachineKey:      node.MachineKey,
		NodeKey:         node.NodeKey,
		DiscoKey:        node.DiscoKey,
		IPAddresses:     node.IpAddresses,
		Name:            node.Name,
		GivenName:       node.GivenName,
		Online:          node.Online,
		RegisterMethod:  node.RegisterMethod.String(),
		ForcedTags:      node.ForcedTags,
		InvalidTags:     node.InvalidTags,
		ValidTags:       node.ValidTags,
		ApprovedRoutes:  node.ApprovedRoutes,
		AvailableRoutes: node.AvailableRoutes,
		SubnetRoutes:    node.SubnetRoutes,
	}

	if node.User != nil {
		user := &HeadscaleUser{
			ID:            node.User.Id,
			Name:          node.User.Name,
			DisplayName:   node.User.DisplayName,
			Email:         node.User.Email,
			Provider:      node.User.Provider,
			ProviderID:    node.User.ProviderId,
			ProfilePicURL: node.User.ProfilePicUrl,
		}
		if node.User.CreatedAt != nil {
			user.CreatedAt = node.User.CreatedAt.AsTime().Format(time.RFC3339)
		}
		machine.User = user
	}

	if node.LastSeen != nil {
		t := node.LastSeen.AsTime()
		machine.LastSeen = &t
	}
	if node.Expiry != nil {
		t := node.Expiry.AsTime()
		machine.Expiry = &t
	}
	if node.CreatedAt != nil {
		t := node.CreatedAt.AsTime()
		machine.CreatedAt = &t
	}

	return machine
}
