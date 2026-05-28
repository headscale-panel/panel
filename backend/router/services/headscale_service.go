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
	"errors"
	"fmt"
	"headscale-panel/model"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/unifyerror"
	"net/http"
	"strings"
	"time"

	v1 "github.com/juanfont/headscale/gen/go/headscale/v1"

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
	ID         uint64     `json:"id"`
	Key        string     `json:"key"`
	User       string     `json:"user"`
	Reusable   bool       `json:"reusable"`
	Ephemeral  bool       `json:"ephemeral"`
	Used       bool       `json:"used"`
	Expired    bool       `json:"expired"`
	Expiration *time.Time `json:"expiration,omitempty"`
	CreatedAt  *time.Time `json:"created_at,omitempty"`
	AclTags    []string   `json:"acl_tags,omitempty"`
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

// ListHeadscaleUsers fetches users directly from Headscale via gRPC.
// Returns pure headscale data only — no panel DB overrides.
func (s *headscaleService) ListHeadscaleUsers(actorUserID uint) ([]HeadscaleUser, error) {
	return s.ListHeadscaleUsersWithContext(context.Background(), actorUserID)
}

// ListHeadscaleUsersWithContext returns users from headscale gRPC only.
// This function does NOT read from or write to the panel database.
func (s *headscaleService) ListHeadscaleUsersWithContext(ctx context.Context, actorUserID uint) ([]HeadscaleUser, error) {
	if err := RequirePermission(actorUserID, "headscale:user:list"); err != nil {
		return nil, err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, grpcErr := client.ListUsers(queryCtx, &v1.ListUsersRequest{})
	if grpcErr != nil {
		return nil, unifyerror.GRPCError(grpcErr)
	}

	users := make([]HeadscaleUser, 0, len(resp.Users))
	for _, u := range resp.Users {
		if !actorCanAccessHeadscaleUser(scope, u.Name) {
			continue
		}
		user := headscaleUserFromProto(u)
		users = append(users, *user)
	}
	return users, nil
}

// ListMergedUsersWithContext fetches users from headscale gRPC.
// Previously this merged panel OIDC data, but bindings now only store IDs.
// Use this for OIDC callback validation (checking if a headscale user exists).
func (s *headscaleService) ListMergedUsersWithContext(ctx context.Context, actorUserID uint) ([]HeadscaleUser, error) {
	return s.ListHeadscaleUsersWithContext(ctx, actorUserID)
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

	resp, grpcErr := client.ListNodes(queryCtx, &v1.ListNodesRequest{})
	if grpcErr != nil {
		return nil, 0, unifyerror.GRPCError(grpcErr)
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

	// Paginate (pageSize < 0 means return all)
	if pageSize < 0 {
		return allMachines, total, nil
	}
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

	resp, grpcErr := client.GetNode(queryCtx, &v1.GetNodeRequest{
		NodeId: nodeID,
	})
	if grpcErr != nil {
		return nil, unifyerror.GRPCError(grpcErr)
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
	nodes, scope, err := listAccessibleNodes(ctx, actorUserID)
	if err != nil {
		return nil, err
	}

	if canAccessAll && scope.isAdmin {
		machines := make([]HeadscaleMachine, 0, len(nodes))
		for _, node := range nodes {
			machines = append(machines, s.nodeToMachine(node))
		}
		return machines, nil
	}

	targetNames := resolvePanelUserHeadscaleNames(userID)
	if len(targetNames) == 0 {
		return nil, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "target user has no Headscale identity")
	}

	nameSet := make(map[string]struct{}, len(targetNames))
	for _, n := range targetNames {
		nameSet[strings.ToLower(strings.TrimSpace(n))] = struct{}{}
	}

	for _, name := range targetNames {
		if err := ensureActorCanAccessHeadscaleUserName(actorUserID, name); err == nil {
			goto allowed
		}
	}
	return nil, unifyerror.Forbidden()
allowed:

	machines := make([]HeadscaleMachine, 0, len(nodes))
	for _, node := range nodes {
		machine := s.nodeToMachine(node)
		if machine.User != nil {
			if _, ok := nameSet[strings.ToLower(strings.TrimSpace(machine.User.Name))]; ok {
				machines = append(machines, machine)
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

	nodeResp, grpcErr := client.GetNode(queryCtx, &v1.GetNodeRequest{
		NodeId: nodeID,
	})
	if grpcErr != nil {
		return nil, unifyerror.GRPCError(grpcErr)
	}
	if err := ensureActorCanAccessNode(actorUserID, nodeResp.Node); err != nil {
		return nil, err
	}

	resp, grpcErr := client.RenameNode(queryCtx, &v1.RenameNodeRequest{
		NodeId:  nodeID,
		NewName: newName,
	})
	if grpcErr != nil {
		return nil, unifyerror.GRPCError(grpcErr)
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
	nodeResp, grpcErr := client.GetNode(queryCtx, &v1.GetNodeRequest{
		NodeId: nodeID,
	})
	if grpcErr != nil {
		return unifyerror.GRPCError(grpcErr)
	}
	if err := ensureActorCanAccessNode(actorUserID, nodeResp.Node); err != nil {
		return err
	}
	_, grpcErr = client.DeleteNode(queryCtx, &v1.DeleteNodeRequest{
		NodeId: nodeID,
	})
	if grpcErr != nil {
		return unifyerror.GRPCError(grpcErr)
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

	nodeResp, grpcErr := client.GetNode(queryCtx, &v1.GetNodeRequest{
		NodeId: nodeID,
	})
	if grpcErr != nil {
		return nil, unifyerror.GRPCError(grpcErr)
	}
	if err := ensureActorCanAccessNode(actorUserID, nodeResp.Node); err != nil {
		return nil, err
	}

	resp, grpcErr := client.ExpireNode(queryCtx, &v1.ExpireNodeRequest{
		NodeId: nodeID,
	})
	if grpcErr != nil {
		return nil, unifyerror.GRPCError(grpcErr)
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

	nodeResp, grpcErr := client.GetNode(queryCtx, &v1.GetNodeRequest{
		NodeId: nodeID,
	})
	if grpcErr != nil {
		return nil, unifyerror.GRPCError(grpcErr)
	}
	if err := ensureActorCanAccessNode(actorUserID, nodeResp.Node); err != nil {
		return nil, err
	}

	resp, grpcErr := client.SetTags(queryCtx, &v1.SetTagsRequest{
		NodeId: nodeID,
		Tags:   tags,
	})
	if grpcErr != nil {
		return nil, unifyerror.GRPCError(grpcErr)
	}
	machine := s.nodeToMachine(resp.Node)
	return &machine, nil
}

func headscaleUserFromProto(user *v1.User) *HeadscaleUser {
	if user == nil {
		return nil
	}

	normalized := &HeadscaleUser{
		ID:            user.Id,
		Name:          user.Name,
		DisplayName:   user.DisplayName,
		Email:         user.Email,
		Provider:      normalizeHeadscaleProvider(user.Provider),
		ProviderID:    user.ProviderId,
		ProfilePicURL: user.ProfilePicUrl,
	}
	if user.CreatedAt != nil {
		normalized.CreatedAt = user.CreatedAt.AsTime().Format(time.RFC3339)
	}

	return normalized
}

func (s *headscaleService) findAccessibleUserByNameWithContext(ctx context.Context, actorUserID uint, name string) (*v1.User, error) {
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return nil, unifyerror.WrongParam("name")
	}

	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, grpcErr := client.ListUsers(queryCtx, &v1.ListUsersRequest{})
	if grpcErr != nil {
		return nil, unifyerror.GRPCError(grpcErr)
	}

	for _, user := range resp.Users {
		if !strings.EqualFold(strings.TrimSpace(user.Name), trimmedName) {
			continue
		}
		if !actorCanAccessHeadscaleUser(scope, user.Name) {
			break
		}
		return user, nil
	}

	return nil, unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound, "headscale user not found")
}

func (s *headscaleService) GetUserByNameWithContext(ctx context.Context, actorUserID uint, name string) (*HeadscaleUser, error) {
	if err := RequirePermission(actorUserID, "headscale:user:list"); err != nil {
		return nil, err
	}

	user, err := s.findAccessibleUserByNameWithContext(ctx, actorUserID, name)
	if err != nil {
		return nil, err
	}

	return headscaleUserFromProto(user), nil
}

// CreateUser creates a user in Headscale
func (s *headscaleService) CreateUser(actorUserID uint, name, displayName, email, pictureURL string) (*HeadscaleUser, error) {
	return s.CreateUserWithContext(context.Background(), actorUserID, name, displayName, email, pictureURL)
}

func (s *headscaleService) CreateUserWithContext(ctx context.Context, actorUserID uint, name, displayName, email, pictureURL string) (*HeadscaleUser, error) {
	if err := RequirePermission(actorUserID, "headscale:user:create"); err != nil {
		return nil, err
	}
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return nil, unifyerror.WrongParam("name")
	}

	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	listResp, grpcErr := client.ListUsers(queryCtx, &v1.ListUsersRequest{})
	if grpcErr != nil {
		return nil, unifyerror.GRPCError(grpcErr)
	}
	for _, existingUser := range listResp.Users {
		if strings.EqualFold(strings.TrimSpace(existingUser.Name), trimmedName) {
			return nil, unifyerror.Conflict("user already exists")
		}
	}

	resp, grpcErr := client.CreateUser(queryCtx, &v1.CreateUserRequest{
		Name:        trimmedName,
		DisplayName: displayName,
		Email:       email,
		PictureUrl:  pictureURL,
	})
	if grpcErr != nil {
		return nil, unifyerror.GRPCError(grpcErr)
	}

	return headscaleUserFromProto(resp.User), nil
}

// RenameUser renames a user in Headscale.
// Returns the raw headscale gRPC response — no panel data patching.
func (s *headscaleService) RenameUser(actorUserID uint, oldID uint64, newName string) (*HeadscaleUser, error) {
	return s.RenameUserWithContext(context.Background(), actorUserID, oldID, newName)
}

func (s *headscaleService) RenameUserWithContext(ctx context.Context, actorUserID uint, oldID uint64, newName string) (*HeadscaleUser, error) {
	if err := RequirePermission(actorUserID, "headscale:user:update"); err != nil {
		return nil, err
	}
	trimmedNewName := strings.TrimSpace(newName)
	if trimmedNewName == "" {
		return nil, unifyerror.WrongParam("new_name")
	}

	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, grpcErr := client.RenameUser(queryCtx, &v1.RenameUserRequest{
		OldId:   oldID,
		NewName: trimmedNewName,
	})
	if grpcErr != nil {
		return nil, unifyerror.GRPCError(grpcErr)
	}
	user := headscaleUserFromProto(resp.User)
	if user == nil {
		return nil, unifyerror.GRPCError(fmt.Errorf("failed to rename user: empty response"))
	}
	return user, nil
}

func (s *headscaleService) RenameUserByNameWithContext(ctx context.Context, actorUserID uint, oldName, newName string) (*HeadscaleUser, error) {
	if err := RequirePermission(actorUserID, "headscale:user:update"); err != nil {
		return nil, err
	}

	targetUser, err := s.findAccessibleUserByNameWithContext(ctx, actorUserID, oldName)
	if err != nil {
		return nil, err
	}

	trimmedOldName := strings.TrimSpace(oldName)
	trimmedNewName := strings.TrimSpace(newName)
	if trimmedNewName == "" {
		return nil, unifyerror.WrongParam("new_name")
	}

	if !strings.EqualFold(trimmedOldName, trimmedNewName) {
		if _, err := s.findAccessibleUserByNameWithContext(ctx, actorUserID, trimmedNewName); err == nil {
			return nil, unifyerror.Conflict("user already exists")
		} else {
			var uniErr *unifyerror.UniErr
			if !errors.As(err, &uniErr) || uniErr.Code != unifyerror.CodeNotFound {
				return nil, err
			}
		}
	}

	return s.RenameUserWithContext(ctx, actorUserID, targetUser.Id, trimmedNewName)
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

	_, grpcErr := client.DeleteUser(queryCtx, &v1.DeleteUserRequest{
		Id: id,
	})
	if grpcErr != nil {
		return unifyerror.GRPCError(grpcErr)
	}
	return nil
}

func (s *headscaleService) DeleteUserByNameWithContext(ctx context.Context, actorUserID uint, name string) error {
	if err := RequirePermission(actorUserID, "headscale:user:delete"); err != nil {
		return err
	}

	targetUser, err := s.findAccessibleUserByNameWithContext(ctx, actorUserID, name)
	if err != nil {
		return err
	}

	return s.DeleteUserWithContext(ctx, actorUserID, targetUser.Id)
}

func (s *headscaleService) CountUserMachinesWithContext(ctx context.Context, userName string) (int, error) {
	client, err := headscaleServiceClient()
	if err != nil {
		return 0, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, grpcErr := client.ListNodes(queryCtx, &v1.ListNodesRequest{})
	if grpcErr != nil {
		return 0, unifyerror.GRPCError(grpcErr)
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

	resp, grpcErr := client.ListUsers(queryCtx, &v1.ListUsersRequest{})
	if grpcErr != nil {
		return 0, unifyerror.GRPCError(grpcErr)
	}

	for _, user := range resp.Users {
		if strings.EqualFold(strings.TrimSpace(user.Name), strings.TrimSpace(userName)) {
			return user.Id, nil
		}
	}

	return 0, unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound, "headscale user not found")
}

// GetPreAuthKeys gets pre-auth keys for a user
// mapPreAuthKey converts a proto PreAuthKey to HeadscaleAuthKey, computing
// the Expired flag on the server side to avoid client-clock skew issues.
func mapPreAuthKey(k *v1.PreAuthKey) HeadscaleAuthKey {
	now := time.Now()
	result := HeadscaleAuthKey{
		ID:        k.GetId(),
		Key:       k.GetKey(),
		Reusable:  k.GetReusable(),
		Ephemeral: k.GetEphemeral(),
		Used:      k.GetUsed(),
		AclTags:   k.GetAclTags(),
	}
	if k.GetUser() != nil {
		result.User = k.GetUser().GetName()
	}
	if k.GetExpiration() != nil {
		t := k.GetExpiration().AsTime()
		if !t.IsZero() {
			result.Expiration = &t
			result.Expired = t.Before(now)
		}
	}
	if k.GetCreatedAt() != nil {
		t := k.GetCreatedAt().AsTime()
		if !t.IsZero() {
			result.CreatedAt = &t
		}
	}
	return result
}

func (s *headscaleService) GetPreAuthKeys(actorUserID uint, userID uint64) ([]HeadscaleAuthKey, error) {
	return s.GetPreAuthKeysWithContext(context.Background(), actorUserID, userID)
}

func (s *headscaleService) GetPreAuthKeysWithContext(ctx context.Context, actorUserID uint, userID uint64) ([]HeadscaleAuthKey, error) {
	if err := RequirePermission(actorUserID, "headscale:preauthkey:list"); err != nil {
		return nil, err
	}
	if err := ensureActorCanAccessHeadscaleUserID(ctx, actorUserID, userID); err != nil {
		return nil, err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, grpcErr := client.ListPreAuthKeys(queryCtx, &v1.ListPreAuthKeysRequest{})
	if grpcErr != nil {
		return nil, unifyerror.GRPCError(grpcErr)
	}

	var result []HeadscaleAuthKey
	for _, k := range resp.PreAuthKeys {
		if k.GetUser() != nil && k.GetUser().GetId() == userID {
			result = append(result, mapPreAuthKey(k))
		}
	}
	return result, nil
}

// CreatePreAuthKey creates a pre-auth key for a user
func (s *headscaleService) CreatePreAuthKey(actorUserID uint, userID uint64, reusable, ephemeral bool, expiration string) (interface{}, error) {
	return s.CreatePreAuthKeyWithContext(context.Background(), actorUserID, userID, reusable, ephemeral, expiration)
}

func (s *headscaleService) CreatePreAuthKeyWithContext(ctx context.Context, actorUserID uint, userID uint64, reusable, ephemeral bool, expiration string) (interface{}, error) {
	if err := RequirePermission(actorUserID, "headscale:preauthkey:create"); err != nil {
		return nil, err
	}
	if err := ensureActorCanAccessHeadscaleUserID(ctx, actorUserID, userID); err != nil {
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
	resp, grpcErr := client.CreatePreAuthKey(queryCtx, req)
	if grpcErr != nil {
		return nil, unifyerror.GRPCError(grpcErr)
	}

	return resp.PreAuthKey, nil
}

// ExpirePreAuthKeyByIDWithContext expires a pre-auth key by its ID.
func (s *headscaleService) ExpirePreAuthKeyByIDWithContext(ctx context.Context, actorUserID uint, userID uint64, id uint64) error {
	if err := RequirePermission(actorUserID, "headscale:preauthkey:expire"); err != nil {
		return err
	}
	if err := ensureActorCanAccessHeadscaleUserID(ctx, actorUserID, userID); err != nil {
		return err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return err
	}

	expireCtx, expireCancel := withServiceTimeout(ctx)
	defer expireCancel()
	_, grpcErr := client.ExpirePreAuthKey(expireCtx, &v1.ExpirePreAuthKeyRequest{
		Id: id,
	})
	if grpcErr != nil {
		return unifyerror.GRPCError(grpcErr)
	}
	return nil
}

// SyncACL fetches the ACL from Headscale and syncs groups and hosts to local DB.
// This function only touches ACL-related data (groups, hosts/resources).
// User sync is handled separately by SyncUsersFromHeadscale.
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
	resp, grpcErr := client.GetPolicy(queryCtx, &v1.GetPolicyRequest{})
	if grpcErr != nil {
		return unifyerror.GRPCError(grpcErr)
	}

	// Parse HuJSON
	ast, parseErr := hujson.Parse([]byte(resp.Policy))
	if parseErr != nil {
		return unifyerror.ServerError(parseErr)
	}
	ast.Standardize()
	data := ast.Pack()

	var policy model.ACLPolicyStructure
	if err := json.Unmarshal(data, &policy); err != nil {
		return unifyerror.ServerError(err)
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
				return unifyerror.DbError(err)
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
				return unifyerror.DbError(err)
			}
		} else {
			resource.IPAddress = ip
			if err := model.DB.Save(&resource).Error; err != nil {
				return unifyerror.DbError(err)
			}
		}
	}

	return nil
}

// SyncUsersFromHeadscale fetches all users from headscale gRPC and ensures
// each has a panel user + binding. Only stores the ID mapping; headscale
// user details are fetched on demand.
func (s *headscaleService) SyncUsersFromHeadscale(ctx context.Context) {
	client, err := headscaleServiceClient()
	if err != nil {
		return
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, grpcErr := client.ListUsers(queryCtx, &v1.ListUsersRequest{})
	if grpcErr != nil {
		return
	}

	for _, hsUser := range resp.Users {
		if hsUser.Name == "" || hsUser.Id == 0 {
			continue
		}

		// Check if binding already exists for this headscale ID
		existingBinding := model.GetBindingByHeadscaleID(hsUser.Id)
		if existingBinding != nil {
			continue
		}

		// Find or create panel user by headscale name
		var panelUser model.User
		if err := model.DB.Where("username = ?", hsUser.Name).First(&panelUser).Error; err != nil {
			panelUser = model.User{
				Username: hsUser.Name,
				Provider: "headscale",
			}
			if createErr := model.DB.Create(&panelUser).Error; createErr != nil {
				continue
			}
		} else if panelUser.Provider == "" {
			// Existing user with empty provider — mark as headscale-synced
			model.DB.Model(&panelUser).Update("provider", "headscale")
		}

		// Create binding (ID mapping only)
		model.DB.Create(&model.UserIdentityBinding{
			UserID:      panelUser.ID,
			HeadscaleID: hsUser.Id,
		})
	}
}

// nodeToMachine converts a protobuf Node to our HeadscaleMachine struct
func (s *headscaleService) nodeToMachine(node *v1.Node) HeadscaleMachine {
	machine := HeadscaleMachine{
		ID:              node.Id,
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
	if err := ensureActorCanAccessHeadscaleUserName(actorUserID, user); err != nil {
		return nil, err
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, grpcErr := client.RegisterNode(queryCtx, &v1.RegisterNodeRequest{
		User: user,
		Key:  key,
	})
	if grpcErr != nil {
		return nil, unifyerror.New(http.StatusOK, unifyerror.CodeGRPCErr, fmt.Sprintf(constants.MsgRegisterNodeFailed, grpcErr))
	}
	if resp.Node == nil {
		return nil, unifyerror.New(http.StatusOK, unifyerror.CodeGRPCErr, constants.MsgHeadscaleReturnedNil)
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
