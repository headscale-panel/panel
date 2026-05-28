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
	"headscale-panel/model"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/headscale"
	v1 "github.com/juanfont/headscale/gen/go/headscale/v1"
	"headscale-panel/pkg/unifyerror"
	"net/http"
	"strings"
)

type actorScope struct {
	isAdmin        bool
	headscaleNames map[string]struct{} // all bound headscale identities (lowercase)
}

func (s *actorScope) matchesHeadscaleName(name string) bool {
	if s.isAdmin {
		return true
	}
	_, ok := s.headscaleNames[strings.ToLower(strings.TrimSpace(name))]
	return ok
}

func headscaleServiceClient() (v1.HeadscaleServiceClient, error) {
	client, err := headscale.GetOrRefreshClient()
	if err != nil {
		return nil, unifyerror.GRPCError(err)
	}
	if client == nil || client.Service == nil {
		return nil, unifyerror.New(http.StatusOK, unifyerror.CodeGRPCErr, "headscale service is unavailable")
	}
	return client.Service, nil
}

func normalizePagination(page, pageSize int) (int, int) {
	if pageSize < 0 {
		return 1, -1 // all mode
	}
	if page < 1 {
		page = constants.DefaultPage
	}
	if pageSize < 1 {
		pageSize = constants.DefaultPageSize
	}
	if pageSize > constants.MaxPageSize {
		pageSize = constants.MaxPageSize
	}
	return page, pageSize
}

// listHeadscaleUsersByIDs queries headscale for users matching the given IDs.
// Returns a map of headscale user ID → user object.
func listHeadscaleUsersByIDs(ids []uint64) map[uint64]*v1.User {
	result := make(map[uint64]*v1.User, len(ids))
	if len(ids) == 0 {
		return result
	}
	client, err := headscaleServiceClient()
	if err != nil {
		return result
	}
	ctx, cancel := withServiceTimeout(context.Background())
	defer cancel()
	resp, grpcErr := client.ListUsers(ctx, &v1.ListUsersRequest{})
	if grpcErr != nil {
		return result
	}
	idSet := make(map[uint64]struct{}, len(ids))
	for _, id := range ids {
		idSet[id] = struct{}{}
	}
	for _, u := range resp.Users {
		if _, ok := idSet[u.Id]; ok {
			result[u.Id] = u
		}
	}
	return result
}

// resolveHeadscaleNamesForUser resolves all headscale names bound to a panel user.
// Queries headscale gRPC by bound IDs, falls back to panel username if no bindings.
func resolveHeadscaleNamesForUser(userID uint) map[string]struct{} {
	names := make(map[string]struct{})
	ids := model.GetHeadscaleIDs(userID)

	if len(ids) > 0 {
		client, err := headscaleServiceClient()
		if err == nil {
			ctx, cancel := withServiceTimeout(context.Background())
			defer cancel()
			resp, grpcErr := client.ListUsers(ctx, &v1.ListUsersRequest{})
			if grpcErr == nil {
				idSet := make(map[uint64]struct{}, len(ids))
				for _, id := range ids {
					idSet[id] = struct{}{}
				}
				for _, u := range resp.Users {
					if _, ok := idSet[u.Id]; ok {
						if name := strings.ToLower(strings.TrimSpace(u.Name)); name != "" {
							names[name] = struct{}{}
						}
					}
				}
			}
		}
	}

	// Fallback to panel username if no bindings resolved
	if len(names) == 0 {
		var user model.User
		if err := model.DB.First(&user, userID).Error; err == nil {
			if name := strings.ToLower(strings.TrimSpace(user.Username)); name != "" {
				names[name] = struct{}{}
			}
		}
	}
	return names
}

func loadActorScope(actorUserID uint) (*actorScope, error) {
	var user model.User
	if err := model.DB.First(&user, actorUserID).Error; err != nil {
		return nil, unifyerror.Forbidden()
	}

	names := resolveHeadscaleNamesForUser(actorUserID)

	return &actorScope{
		isAdmin:        user.IsAdmin,
		headscaleNames: names,
	}, nil
}

func actorCanAccessNode(scope *actorScope, node *v1.Node) bool {
	if scope == nil || node == nil {
		return false
	}
	if scope.isAdmin {
		return true
	}
	if node.User == nil {
		return false
	}
	return scope.matchesHeadscaleName(node.User.Name)
}

func ensureActorCanAccessNode(actorUserID uint, node *v1.Node) error {
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return err
	}
	if !actorCanAccessNode(scope, node) {
		return unifyerror.Forbidden()
	}
	return nil
}

func actorCanAccessHeadscaleUser(scope *actorScope, headscaleName string) bool {
	if scope == nil {
		return false
	}
	if scope.isAdmin {
		return true
	}
	return scope.matchesHeadscaleName(headscaleName)
}

func ensureActorCanAccessHeadscaleUserName(actorUserID uint, headscaleName string) error {
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return err
	}
	if !actorCanAccessHeadscaleUser(scope, headscaleName) {
		return unifyerror.Forbidden()
	}
	return nil
}

func resolveHeadscaleUserNameByID(ctx context.Context, userID uint64) (string, error) {
	client, err := headscaleServiceClient()
	if err != nil {
		return "", err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, grpcErr := client.ListUsers(queryCtx, &v1.ListUsersRequest{})
	if grpcErr != nil {
		return "", unifyerror.New(http.StatusOK, unifyerror.CodeGRPCErr, "failed to list headscale users")
	}

	for _, user := range resp.Users {
		if user.Id == userID {
			return strings.TrimSpace(user.Name), nil
		}
	}

	return "", unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound, "headscale user not found")
}

func ensureActorCanAccessHeadscaleUserID(ctx context.Context, actorUserID uint, userID uint64) error {
	headscaleName, err := resolveHeadscaleUserNameByID(ctx, userID)
	if err != nil {
		return err
	}
	return ensureActorCanAccessHeadscaleUserName(actorUserID, headscaleName)
}

// resolvePanelUserHeadscaleNames returns all headscale names bound to a panel user.
func resolvePanelUserHeadscaleNames(userID uint) []string {
	names := resolveHeadscaleNamesForUser(userID)
	result := make([]string, 0, len(names))
	for name := range names {
		result = append(result, name)
	}
	return result
}

func ensureActorCanAccessPanelUser(actorUserID uint, targetUserID uint) error {
	names := resolvePanelUserHeadscaleNames(targetUserID)
	if len(names) == 0 {
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "target user has no Headscale identity")
	}
	for _, name := range names {
		if err := ensureActorCanAccessHeadscaleUserName(actorUserID, name); err == nil {
			return nil
		}
	}
	return unifyerror.Forbidden()
}

func listAccessibleNodes(ctx context.Context, actorUserID uint) ([]*v1.Node, *actorScope, error) {
	client, err := headscaleServiceClient()
	if err != nil {
		return nil, nil, err
	}
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, grpcErr := client.ListNodes(queryCtx, &v1.ListNodesRequest{})
	if grpcErr != nil {
		return nil, nil, unifyerror.New(http.StatusOK, unifyerror.CodeGRPCErr, "failed to list nodes from Headscale")
	}

	nodes := make([]*v1.Node, 0, len(resp.Nodes))
	for _, node := range resp.Nodes {
		if actorCanAccessNode(scope, node) {
			nodes = append(nodes, node)
		}
	}

	return nodes, scope, nil
}
