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
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/headscale"
	"headscale-panel/pkg/hsapi"
	"headscale-panel/pkg/unifyerror"
	"net/http"
)

// actorScope is the set of headscale identities an account may act on.
//
// Scope answers "which resources can this person see", which is a different
// question from "which operations may they perform" (that is permissions). The
// two are kept apart on purpose: conflating them is how a read permission
// silently becomes a write grant.
type actorScope struct {
	isAdmin   bool
	accountID uint

	// hsUserIDs holds the headscale user ids bound to the account. Matching by
	// id rather than by name matters: names can be renamed and, historically, a
	// missing binding silently fell back to the panel username, which let an
	// account act on any headscale user whose name happened to collide with it.
	hsUserIDs map[uint64]struct{}
}

// AllowsHeadscaleUser reports whether the scope covers a headscale user id.
func (s *actorScope) AllowsHeadscaleUser(hsUserID uint64) bool {
	if s == nil {
		return false
	}
	if s.isAdmin {
		return true
	}
	_, ok := s.hsUserIDs[hsUserID]
	return ok
}

// policyUsernames resolves the ACL aliases this scope owns.
//
// headscale resolves a policy alias through User.Username(), which is the email
// first, then the name, then the provider identifier. Using the plain name here
// would silently match nothing for any OIDC user, whose alias is their email
// address, so the resolution is delegated to the same function headscale uses.
func (s *actorScope) policyUsernames(ctx context.Context) (map[string]struct{}, error) {
	if s == nil || len(s.hsUserIDs) == 0 {
		return map[string]struct{}{}, nil
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return nil, err
	}
	users, getErr := client.ListUsers(ctx)
	if getErr != nil {
		return nil, unifyerror.HeadscaleAPIError(getErr)
	}

	out := make(map[string]struct{}, len(s.hsUserIDs))
	for i := range users {
		u := &users[i]
		if _, ok := s.hsUserIDs[parseHSUserID(u.Id)]; !ok {
			continue
		}
		if alias := u.PolicyUsername(); alias != "" {
			out[alias] = struct{}{}
		}
	}
	return out, nil
}

// headscaleRESTClient returns the REST transport.
//
// Callers must handle hsapi.ErrNoPolicy explicitly: a missing ACL policy is a
// normal state, and collapsing it into "empty document" hides real read failures.
func headscaleRESTClient() (*hsapi.Client, error) {
	client, err := headscale.GetOrRefreshClient()
	if err != nil {
		return nil, unifyerror.HeadscaleAPIError(err)
	}
	if client == nil || client.REST == nil {
		return nil, unifyerror.New(http.StatusOK, unifyerror.CodeHeadscaleAPIErr, "headscale service is unavailable")
	}
	return client.REST, nil
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

// loadActorScope builds the scope for an account.
func loadActorScope(accountID uint) (*actorScope, error) {
	acc, err := Accounts.Get(accountID)
	if err != nil {
		return nil, unifyerror.Forbidden()
	}

	scope := &actorScope{
		isAdmin:   acc.Role.IsSystemAdmin,
		accountID: acc.ID,
		hsUserIDs: map[uint64]struct{}{},
	}
	if scope.isAdmin {
		return scope, nil
	}

	bindings, err := Network.BindingsOf(accountID)
	if err != nil {
		return nil, unifyerror.DbError(err)
	}
	for _, b := range bindings {
		scope.hsUserIDs[b.HSUserID] = struct{}{}
	}
	return scope, nil
}

// actorCanAccessNode reports whether the scope covers the node's owner.
func actorCanAccessNode(scope *actorScope, node *hsapi.Node) bool {
	if scope == nil || node == nil {
		return false
	}
	if scope.isAdmin {
		return true
	}
	return scope.AllowsHeadscaleUser(parseHSUserID(node.User.Id))
}

func ensureActorCanAccessNode(actorUserID uint, node *hsapi.Node) error {
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return err
	}
	if !actorCanAccessNode(scope, node) {
		return unifyerror.Forbidden()
	}
	return nil
}

// ensureActorCanAccessHeadscaleUser guards operations addressed by headscale
// user id.
func ensureActorCanAccessHeadscaleUser(actorUserID uint, hsUserID uint64) error {
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return err
	}
	if !scope.AllowsHeadscaleUser(hsUserID) {
		return unifyerror.Forbidden()
	}
	return nil
}

// VisibleHSUserIDs returns the headscale user ids the actor may see, or nil when
// the actor is unrestricted.
func visibleHSUserIDs(actorUserID uint) (map[uint64]struct{}, bool, error) {
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, false, err
	}
	if scope.isAdmin {
		return nil, true, nil
	}
	return scope.hsUserIDs, false, nil
}

// listAccessibleNodes returns the nodes the actor may see.
func listAccessibleNodes(ctx context.Context, actorUserID uint) ([]hsapi.Node, *actorScope, error) {
	client, err := headscaleRESTClient()
	if err != nil {
		return nil, nil, err
	}
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	nodes, getErr := client.ListNodes(queryCtx, "")
	if getErr != nil {
		return nil, nil, unifyerror.HeadscaleAPIError(getErr)
	}

	if scope.isAdmin {
		return nodes, scope, nil
	}

	visible := make([]hsapi.Node, 0, len(nodes))
	for i := range nodes {
		if actorCanAccessNode(scope, &nodes[i]) {
			visible = append(visible, nodes[i])
		}
	}
	return visible, scope, nil
}

// parseHSUserID converts headscale's decimal id string.
func parseHSUserID(raw string) uint64 {
	var id uint64
	for _, r := range raw {
		if r < '0' || r > '9' {
			return 0
		}
		id = id*10 + uint64(r-'0')
	}
	return id
}

// actorCanAccessHeadscaleUserScope is the pure scope check, split out so it can
// be tested without a database or an upstream client.
func actorCanAccessHeadscaleUserScope(scope *actorScope, hsUserID uint64) bool {
	return scope.AllowsHeadscaleUser(hsUserID)
}
