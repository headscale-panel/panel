package services

import (
	"context"
	"encoding/json"
	"fmt"
	"headscale-panel/model"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"headscale-panel/pkg/utils/serializer"
	"strings"
	"time"

	"github.com/tailscale/hujson"
	"google.golang.org/protobuf/reflect/protoreflect"
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
	Tags            []string          `json:"tags"`
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

func normalizeHeadscaleProvider(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "oidc":
		return "oidc"
	case "local":
		return "local"
	case "headscale":
		return "headscale"
	case "":
		return "headscale"
	default:
		return strings.ToLower(strings.TrimSpace(raw))
	}
}

// ListHeadscaleUsers fetches users directly from Headscale via gRPC
func (s *headscaleService) ListHeadscaleUsers(actorUserID uint) ([]HeadscaleUser, error) {
	return s.ListHeadscaleUsersWithContext(context.Background(), actorUserID)
}

func (s *headscaleService) ListHeadscaleUsersWithContext(ctx context.Context, actorUserID uint) ([]HeadscaleUser, error) {
	if err := RequirePermission(actorUserID, "headscale:user:list"); err != nil {
		return nil, err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, err := client.ListUsers(queryCtx, &v1.ListUsersRequest{})
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
			Provider:      normalizeHeadscaleProvider(u.Provider),
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
	return s.ListMachinesWithContext(context.Background(), actorUserID, page, pageSize, userFilter, statusFilter)
}

func (s *headscaleService) ListMachinesWithContext(ctx context.Context, actorUserID uint, page, pageSize int, userFilter string, statusFilter string) ([]HeadscaleMachine, int64, error) {
	if err := RequirePermission(actorUserID, "headscale:machine:list"); err != nil {
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

	// Convert all nodes to our format
	allMachines := make([]HeadscaleMachine, 0, len(resp.Nodes))
	for _, node := range resp.Nodes {
		if !actorCanAccessNode(scope, node) {
			continue
		}
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
	return s.GetMachineWithContext(context.Background(), actorUserID, nodeID)
}

func (s *headscaleService) GetMachineWithContext(ctx context.Context, actorUserID uint, nodeID uint64) (*HeadscaleMachine, error) {
	if err := RequirePermission(actorUserID, "headscale:machine:get"); err != nil {
		return nil, err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, err := client.GetNode(queryCtx, &v1.GetNodeRequest{
		NodeId: nodeID,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get node from Headscale: %w", err)
	}
	if err := ensureActorCanAccessNode(actorUserID, resp.Node); err != nil {
		return nil, err
	}
	machine := s.nodeToMachine(resp.Node)
	return &machine, nil
}

// GetAccessibleMachines fetches machines from Headscale, optionally filtering by user
func (s *headscaleService) GetAccessibleMachines(actorUserID uint, userID uint, canAccessAll bool) ([]HeadscaleMachine, error) {
	return s.GetAccessibleMachinesWithContext(context.Background(), actorUserID, userID, canAccessAll)
}

func (s *headscaleService) GetAccessibleMachinesWithContext(ctx context.Context, actorUserID uint, userID uint, canAccessAll bool) ([]HeadscaleMachine, error) {
	if err := RequirePermission(actorUserID, "headscale:acl:access"); err != nil {
		return nil, err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, err := client.ListNodes(queryCtx, &v1.ListNodesRequest{})
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
	return s.RenameMachineWithContext(context.Background(), actorUserID, nodeID, newName)
}

func (s *headscaleService) RenameMachineWithContext(ctx context.Context, actorUserID uint, nodeID uint64, newName string) (*HeadscaleMachine, error) {
	if err := RequirePermission(actorUserID, "headscale:machine:update"); err != nil {
		return nil, err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	nodeResp, err := client.GetNode(queryCtx, &v1.GetNodeRequest{
		NodeId: nodeID,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get node from Headscale: %w", err)
	}
	if err := ensureActorCanAccessNode(actorUserID, nodeResp.Node); err != nil {
		return nil, err
	}

	resp, err := client.RenameNode(queryCtx, &v1.RenameNodeRequest{
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
	return s.DeleteMachineWithContext(context.Background(), actorUserID, nodeID)
}

func (s *headscaleService) DeleteMachineWithContext(ctx context.Context, actorUserID uint, nodeID uint64) error {
	if err := RequirePermission(actorUserID, "headscale:machine:delete"); err != nil {
		return err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()
	nodeResp, err := client.GetNode(queryCtx, &v1.GetNodeRequest{
		NodeId: nodeID,
	})
	if err != nil {
		return fmt.Errorf("failed to get node from Headscale: %w", err)
	}
	if err := ensureActorCanAccessNode(actorUserID, nodeResp.Node); err != nil {
		return err
	}
	_, err = client.DeleteNode(queryCtx, &v1.DeleteNodeRequest{
		NodeId: nodeID,
	})
	if err != nil {
		return fmt.Errorf("failed to delete node: %w", err)
	}
	return nil
}

// ExpireMachine expires a node in Headscale
func (s *headscaleService) ExpireMachine(actorUserID uint, nodeID uint64) (*HeadscaleMachine, error) {
	return s.ExpireMachineWithContext(context.Background(), actorUserID, nodeID)
}

func (s *headscaleService) ExpireMachineWithContext(ctx context.Context, actorUserID uint, nodeID uint64) (*HeadscaleMachine, error) {
	if err := RequirePermission(actorUserID, "headscale:machine:expire"); err != nil {
		return nil, err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	nodeResp, err := client.GetNode(queryCtx, &v1.GetNodeRequest{
		NodeId: nodeID,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get node from Headscale: %w", err)
	}
	if err := ensureActorCanAccessNode(actorUserID, nodeResp.Node); err != nil {
		return nil, err
	}

	resp, err := client.ExpireNode(queryCtx, &v1.ExpireNodeRequest{
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
	return s.SetMachineTagsWithContext(context.Background(), actorUserID, nodeID, tags)
}

func (s *headscaleService) SetMachineTagsWithContext(ctx context.Context, actorUserID uint, nodeID uint64, tags []string) (*HeadscaleMachine, error) {
	if err := RequirePermission(actorUserID, "headscale:machine:tags"); err != nil {
		return nil, err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	nodeResp, err := client.GetNode(queryCtx, &v1.GetNodeRequest{
		NodeId: nodeID,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get node from Headscale: %w", err)
	}
	if err := ensureActorCanAccessNode(actorUserID, nodeResp.Node); err != nil {
		return nil, err
	}

	resp, err := client.SetTags(queryCtx, &v1.SetTagsRequest{
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
	return s.CreateUserWithContext(context.Background(), actorUserID, name)
}

func (s *headscaleService) CreateUserWithContext(ctx context.Context, actorUserID uint, name string) (*HeadscaleUser, error) {
	if err := RequirePermission(actorUserID, "headscale:user:create"); err != nil {
		return nil, err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, err := client.CreateUser(queryCtx, &v1.CreateUserRequest{
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
	return s.RenameUserWithContext(context.Background(), actorUserID, oldID, newName)
}

func (s *headscaleService) RenameUserWithContext(ctx context.Context, actorUserID uint, oldID uint64, newName string) (*HeadscaleUser, error) {
	if err := RequirePermission(actorUserID, "headscale:user:update"); err != nil {
		return nil, err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, err := client.RenameUser(queryCtx, &v1.RenameUserRequest{
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
	return s.DeleteUserWithContext(context.Background(), actorUserID, id)
}

func (s *headscaleService) DeleteUserWithContext(ctx context.Context, actorUserID uint, id uint64) error {
	if err := RequirePermission(actorUserID, "headscale:user:delete"); err != nil {
		return err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	_, err = client.DeleteUser(queryCtx, &v1.DeleteUserRequest{
		Id: id,
	})
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}
	return nil
}

func (s *headscaleService) CountUserMachinesWithContext(ctx context.Context, userName string) (int, error) {
	client, err := headscaleServiceClient()
	if err != nil {
		return 0, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, err := client.ListNodes(queryCtx, &v1.ListNodesRequest{})
	if err != nil {
		return 0, fmt.Errorf("failed to list nodes from Headscale: %w", err)
	}

	count := 0
	for _, node := range resp.Nodes {
		if node.User == nil {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(node.User.Name), strings.TrimSpace(userName)) {
			count++
		}
	}

	return count, nil
}

func (s *headscaleService) ResolveUserIDByNameWithContext(ctx context.Context, userName string) (uint64, error) {
	client, err := headscaleServiceClient()
	if err != nil {
		return 0, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, err := client.ListUsers(queryCtx, &v1.ListUsersRequest{})
	if err != nil {
		return 0, fmt.Errorf("failed to list users from Headscale: %w", err)
	}

	for _, user := range resp.Users {
		if strings.EqualFold(strings.TrimSpace(user.Name), strings.TrimSpace(userName)) {
			return user.Id, nil
		}
	}

	return 0, serializer.NewError(serializer.CodeNotFound, "headscale user not found", nil)
}

// GetPreAuthKeys gets pre-auth keys for a user
func (s *headscaleService) GetPreAuthKeys(actorUserID uint, userID uint64) (interface{}, error) {
	return s.GetPreAuthKeysWithContext(context.Background(), actorUserID, userID)
}

func (s *headscaleService) GetPreAuthKeysWithContext(ctx context.Context, actorUserID uint, userID uint64) (interface{}, error) {
	if err := RequirePermission(actorUserID, "headscale:preauthkey:list"); err != nil {
		return nil, err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, err := client.ListPreAuthKeys(queryCtx, &v1.ListPreAuthKeysRequest{
		User: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list pre-auth keys: %w", err)
	}
	return resp.PreAuthKeys, nil
}

// CreatePreAuthKey creates a pre-auth key for a user
func (s *headscaleService) CreatePreAuthKey(actorUserID uint, userID uint64, reusable, ephemeral bool, expiration string) (interface{}, error) {
	return s.CreatePreAuthKeyWithContext(context.Background(), actorUserID, userID, reusable, ephemeral, expiration)
}

func (s *headscaleService) CreatePreAuthKeyWithContext(ctx context.Context, actorUserID uint, userID uint64, reusable, ephemeral bool, expiration string) (interface{}, error) {
	if err := RequirePermission(actorUserID, "headscale:preauthkey:create"); err != nil {
		return nil, err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

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
	resp, err := client.CreatePreAuthKey(queryCtx, req)
	if err != nil {
		return nil, fmt.Errorf("failed to create pre-auth key: %w", err)
	}
	return resp.PreAuthKey, nil
}

// ExpirePreAuthKey expires a pre-auth key
func (s *headscaleService) ExpirePreAuthKey(actorUserID uint, userID uint64, key string) error {
	return s.ExpirePreAuthKeyWithContext(context.Background(), actorUserID, userID, key)
}

func (s *headscaleService) ExpirePreAuthKeyWithContext(ctx context.Context, actorUserID uint, userID uint64, key string) error {
	if err := RequirePermission(actorUserID, "headscale:preauthkey:expire"); err != nil {
		return err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	_, err = client.ExpirePreAuthKey(queryCtx, &v1.ExpirePreAuthKeyRequest{
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
	return s.SyncACLWithContext(context.Background())
}

func (s *headscaleService) SyncACLWithContext(ctx context.Context) error {
	client, err := headscaleServiceClient()
	if err != nil {
		return err
	}
	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()
	resp, err := client.GetPolicy(queryCtx, &v1.GetPolicyRequest{})
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
			if err := model.DB.Create(&group).Error; err != nil {
				return serializer.ErrDatabase.WithError(err)
			}
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
			if err := model.DB.Create(&resource).Error; err != nil {
				return serializer.ErrDatabase.WithError(err)
			}
		} else {
			resource.IPAddress = ip
			if err := model.DB.Save(&resource).Error; err != nil {
				return serializer.ErrDatabase.WithError(err)
			}
		}
	}

	// Sync Users from Headscale
	usersResp, err := client.ListUsers(queryCtx, &v1.ListUsersRequest{})
	if err != nil {
		return fmt.Errorf("failed to list users from Headscale: %w", err)
	}

	for _, hsUser := range usersResp.Users {
		if hsUser.Name == "" {
			continue
		}
		var existingUser model.User
		if err := model.DB.Where("headscale_name = ?", hsUser.Name).First(&existingUser).Error; err != nil {
			// User doesn't exist in panel DB - create it (ungrouped by default)
			newUser := model.User{
				Username:      hsUser.Name,
				HeadscaleName: hsUser.Name,
				DisplayName:   hsUser.DisplayName,
				Email:         hsUser.Email,
				Provider:      "headscale",
			}
			if hsUser.ProfilePicUrl != "" {
				newUser.ProfilePicURL = hsUser.ProfilePicUrl
			}
			if createErr := model.DB.Create(&newUser).Error; createErr != nil {
				// Skip duplicate username errors silently
				continue
			}
		} else {
			// User exists - update display info
			updates := map[string]interface{}{}
			if hsUser.DisplayName != "" && existingUser.DisplayName != hsUser.DisplayName {
				updates["display_name"] = hsUser.DisplayName
			}
			if hsUser.Email != "" && existingUser.Email != hsUser.Email {
				updates["email"] = hsUser.Email
			}
			if hsUser.ProfilePicUrl != "" && existingUser.ProfilePicURL != hsUser.ProfilePicUrl {
				updates["profile_pic_url"] = hsUser.ProfilePicUrl
			}
			if len(updates) > 0 {
				model.DB.Model(&existingUser).Updates(updates)
			}
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
		Tags:            extractNodeTags(node),
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

func extractNodeTags(node *v1.Node) []string {
	if node == nil {
		return nil
	}

	msg := node.ProtoReflect()
	combined := make([]string, 0)

	// Preferred field in newer protobuf schema.
	combined = append(combined, extractRepeatedStringField(msg, "tags")...)

	// Backward-compatibility for older generated models.
	combined = append(combined, extractRepeatedStringField(msg, "forced_tags")...)
	combined = append(combined, extractRepeatedStringField(msg, "valid_tags")...)
	combined = append(combined, extractRepeatedStringField(msg, "invalid_tags")...)

	seen := make(map[string]struct{}, len(combined))
	result := make([]string, 0, len(combined))
	for _, tag := range combined {
		trimmed := strings.TrimSpace(tag)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		result = append(result, trimmed)
	}
	return result
}

func extractRepeatedStringField(msg protoreflect.Message, fieldName protoreflect.Name) []string {
	fd := msg.Descriptor().Fields().ByName(fieldName)
	if fd == nil || !fd.IsList() || fd.Kind() != protoreflect.StringKind {
		return nil
	}
	list := msg.Get(fd).List()
	values := make([]string, 0, list.Len())
	for i := 0; i < list.Len(); i++ {
		values = append(values, list.Get(i).String())
	}
	return values
}

// RegisterNode registers a node using a machine key
func (s *headscaleService) RegisterNodeWithContext(ctx context.Context, actorUserID uint, user string, key string) (*HeadscaleMachine, error) {
	if err := RequirePermission(actorUserID, "headscale:machine:create"); err != nil {
		return nil, err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, err := client.RegisterNode(queryCtx, &v1.RegisterNodeRequest{
		User: user,
		Key:  key,
	})
	if err != nil {
		return nil, serializer.NewError(serializer.CodeThirdPartyServiceError, fmt.Sprintf("注册节点失败: %v", err), err)
	}
	if resp.Node == nil {
		return nil, serializer.NewError(serializer.CodeThirdPartyServiceError, "注册节点失败: Headscale 返回空节点", nil)
	}

	node := resp.Node
	machine := &HeadscaleMachine{
		ID:          node.Id,
		Name:        node.Name,
		GivenName:   node.GivenName,
		IPAddresses: node.IpAddresses,
		Online:      node.Online,
	}
	if node.User != nil {
		machine.User = &HeadscaleUser{
			ID:   node.User.Id,
			Name: node.User.Name,
		}
	}
	return machine, nil
}
