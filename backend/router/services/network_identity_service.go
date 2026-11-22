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
	"errors"
	"headscale-panel/internal/account"
	"headscale-panel/internal/network"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/hsapi"
	"headscale-panel/pkg/unifyerror"
	"net/http"
	"strings"
)

// networkIdentityService exposes headscale users as "network identities".
//
// Nothing here is stored: every read goes upstream. The panel's own record is the
// binding, which lives in the network domain and holds only the headscale user
// id.
type networkIdentityService struct{}

// NetworkIdentityService is the read/write facade for network identities.
var NetworkIdentityService = new(networkIdentityService)

// IdentityView is a network identity plus its binding, as the UI consumes it.
type IdentityView struct {
	HSUserID       uint64 `json:"hs_user_id"`
	Name           string `json:"name"`
	PolicyUsername string `json:"policy_username"`
	DisplayName    string `json:"display_name"`
	Email          string `json:"email"`
	ProfilePicURL  string `json:"profile_pic_url"`
	Provider       string `json:"provider"`
	ProviderID     string `json:"provider_id"`
	Origin         string `json:"origin"`
	OriginIssuer   string `json:"origin_issuer"`
	OriginAccount  uint64 `json:"origin_account_id,omitempty"`
	DeviceCount    int    `json:"device_count"`
	DeviceOnline   int    `json:"device_online"`
	Tagged         bool   `json:"tagged"`
	AccountID      uint   `json:"account_id"`
	BindingID      uint   `json:"binding_id"`
	IsPrimary      bool   `json:"is_primary"`
}

// IdentityFilter narrows a list request.
type IdentityFilter struct {
	Query    string
	Origin   string
	Orphaned bool
	Bound    *bool
}

// ListIdentities returns the identities the actor may see.
func (s *networkIdentityService) ListIdentities(ctx context.Context, actorUserID uint, filter IdentityFilter) ([]IdentityView, error) {
	if err := RequirePermission(actorUserID, constants.PermNetworkIdentityList); err != nil {
		return nil, err
	}

	snap, err := identitySnapshot(ctx)
	if err != nil {
		return nil, unifyerror.HeadscaleAPIError(err)
	}
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, err
	}

	out := make([]IdentityView, 0, len(snap.Identities))
	for i := range snap.Identities {
		ident := &snap.Identities[i]
		if !scope.AllowsHeadscaleUser(ident.HSUserID) {
			continue
		}
		if !matchesIdentityFilter(ident, filter) {
			continue
		}
		out = append(out, toIdentityView(ident))
	}
	return out, nil
}

// GetIdentity returns one identity.
func (s *networkIdentityService) GetIdentity(ctx context.Context, actorUserID uint, hsUserID uint64) (*IdentityView, error) {
	if err := RequireAnyPermission(actorUserID, constants.PermNetworkIdentityRead, constants.PermNetworkDeviceListSelf); err != nil {
		return nil, err
	}
	if err := ensureActorCanAccessHeadscaleUser(actorUserID, hsUserID); err != nil {
		return nil, err
	}

	snap, err := identitySnapshot(ctx)
	if err != nil {
		return nil, unifyerror.HeadscaleAPIError(err)
	}
	ident := snap.Identity(hsUserID)
	if ident == nil {
		return nil, unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound, "network identity not found in headscale")
	}

	view := toIdentityView(ident)
	return &view, nil
}

// CreateIdentity adds a headscale user.
//
// This only ever creates a headscale user. It never creates a panel account: the
// two must be created deliberately, because a network identity without an owner
// is a normal state (that is what "manual" origin means) while a panel account
// without credentials would be a security smell.
func (s *networkIdentityService) CreateIdentity(ctx context.Context, actorUserID uint, name, displayName, email string) (*IdentityView, error) {
	if err := RequirePermission(actorUserID, constants.PermNetworkIdentityCreate); err != nil {
		return nil, err
	}

	name = strings.TrimSpace(name)
	if name == "" {
		return nil, unifyerror.WrongParam("name")
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	user, createErr := client.CreateUser(queryCtx, name, strings.TrimSpace(displayName), strings.TrimSpace(email), "")
	if createErr != nil {
		return nil, unifyerror.HeadscaleAPIError(createErr)
	}

	return &IdentityView{
		HSUserID:       parseHSUserID(user.Id),
		Name:           user.Name,
		PolicyUsername: user.PolicyUsername(),
		DisplayName:    user.DisplayName,
		Email:          user.Email,
		Provider:       user.Provider,
		ProviderID:     user.ProviderId,
		Origin:         string(hsapi.OriginManual),
	}, nil
}

// RenameIdentity changes a headscale user's name.
func (s *networkIdentityService) RenameIdentity(ctx context.Context, actorUserID uint, hsUserID uint64, newName string) (*IdentityView, error) {
	if err := RequirePermission(actorUserID, constants.PermNetworkIdentityUpdate); err != nil {
		return nil, err
	}
	if err := ensureActorCanAccessHeadscaleUser(actorUserID, hsUserID); err != nil {
		return nil, err
	}

	newName = strings.TrimSpace(newName)
	if newName == "" {
		return nil, unifyerror.WrongParam("name")
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	user, renameErr := client.RenameUser(queryCtx, hsUserID, newName)
	if renameErr != nil {
		return nil, unifyerror.HeadscaleAPIError(renameErr)
	}

	return &IdentityView{
		HSUserID:       parseHSUserID(user.Id),
		Name:           user.Name,
		PolicyUsername: user.PolicyUsername(),
		DisplayName:    user.DisplayName,
		Email:          user.Email,
	}, nil
}

// DeleteIdentity removes a headscale user.
//
// Refused while the user still owns devices: headscale would reject it anyway,
// and doing the check here produces an error that names the actual problem.
func (s *networkIdentityService) DeleteIdentity(ctx context.Context, actorUserID uint, hsUserID uint64) error {
	if err := RequirePermission(actorUserID, constants.PermNetworkIdentityDelete); err != nil {
		return err
	}
	if err := ensureActorCanAccessHeadscaleUser(actorUserID, hsUserID); err != nil {
		return err
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	nodes, listErr := client.ListNodes(queryCtx, "")
	if listErr != nil {
		return unifyerror.HeadscaleAPIError(listErr)
	}
	for i := range nodes {
		if parseHSUserID(nodes[i].User.Id) == hsUserID {
			return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr,
				"this identity still owns devices; delete or reassign them first")
		}
	}

	if delErr := client.DeleteUser(queryCtx, hsUserID); delErr != nil {
		return unifyerror.HeadscaleAPIError(delErr)
	}
	return nil
}

// Bind links an identity to an account.
func (s *networkIdentityService) Bind(ctx context.Context, actorUserID uint, hsUserID uint64, accountID uint, primary bool) error {
	if err := RequirePermission(actorUserID, constants.PermNetworkBindingManage); err != nil {
		return err
	}
	if err := accountExists(accountID); err != nil {
		return err
	}
	if _, err := Network.Bind(ctx, accountID, hsUserID, primary); err != nil {
		return mapNetworkError(err)
	}
	return nil
}

// Unbind removes the binding but leaves the headscale user in place.
func (s *networkIdentityService) Unbind(actorUserID uint, hsUserID uint64) error {
	if err := RequirePermission(actorUserID, constants.PermNetworkBindingManage); err != nil {
		return err
	}
	if err := Network.Unbind(hsUserID); err != nil {
		return mapNetworkError(err)
	}
	return nil
}

// ReconcileBindings creates the bindings the panel IdP can prove ownership of.
func (s *networkIdentityService) ReconcileBindings(ctx context.Context, actorUserID uint) (*network.ReconcileResult, error) {
	if err := RequirePermission(actorUserID, constants.PermNetworkIdentityUpdate); err != nil {
		return nil, err
	}

	known, err := allAccountIDs()
	if err != nil {
		return nil, err
	}

	result, recErr := Network.Reconcile(ctx, currentPanelIssuer(), known)
	if recErr != nil {
		return nil, mapNetworkError(recErr)
	}
	return &result, nil
}

// toIdentityView flattens a domain identity for the API.
func toIdentityView(ident *network.Identity) IdentityView {
	view := IdentityView{
		HSUserID:       ident.HSUserID,
		Name:           ident.Name,
		PolicyUsername: ident.PolicyUsername,
		DisplayName:    ident.DisplayName,
		Email:          ident.Email,
		ProfilePicURL:  ident.PictureURL,
		Provider:       ident.Provider,
		ProviderID:     ident.ProviderIdent,
		Origin:         string(ident.Origin),
		OriginIssuer:   ident.OriginIssuer,
		OriginAccount:  ident.OriginAccountID,
		DeviceCount:    ident.DeviceCount,
		DeviceOnline:   ident.DeviceOnline,
		Tagged:         ident.Tagged,
	}
	if ident.Binding != nil {
		view.AccountID = ident.Binding.AccountID
		view.BindingID = ident.Binding.ID
		view.IsPrimary = ident.Binding.IsPrimary
	}
	return view
}

func matchesIdentityFilter(ident *network.Identity, filter IdentityFilter) bool {
	if filter.Origin != "" && string(ident.Origin) != filter.Origin {
		return false
	}
	if filter.Orphaned && ident.Binding != nil {
		return false
	}
	if filter.Bound != nil && (ident.Binding != nil) != *filter.Bound {
		return false
	}
	if filter.Query == "" {
		return true
	}

	q := strings.ToLower(strings.TrimSpace(filter.Query))
	for _, field := range []string{ident.Name, ident.DisplayName, ident.Email, ident.PolicyUsername} {
		if strings.Contains(strings.ToLower(field), q) {
			return true
		}
	}
	return false
}

// accountExists guards a bind against a stale account reference.
func accountExists(accountID uint) error {
	if _, err := Accounts.Get(accountID); err != nil {
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "target account does not exist")
	}
	return nil
}

// allAccountIDs returns the account ids, used by the reconcile pass to skip
// identities whose account has been deleted.
func allAccountIDs() (map[uint64]struct{}, error) {
	accounts, err := Accounts.List(account.ListFilter{})
	if err != nil {
		return nil, unifyerror.DbError(err)
	}

	out := make(map[uint64]struct{}, len(accounts))
	for _, acc := range accounts {
		out[uint64(acc.ID)] = struct{}{}
	}
	return out, nil
}

// isNetworkErr is errors.Is with a shorter call site.
func isNetworkErr(err, target error) bool {
	return errors.Is(err, target)
}

// mapNetworkError translates a network domain error into the HTTP error type.
func mapNetworkError(err error) error {
	if err == nil {
		return nil
	}
	switch {
	case isNetworkErr(err, network.ErrBindingNotFound), isNetworkErr(err, network.ErrIdentityNotFound):
		return unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound, err.Error())
	case isNetworkErr(err, network.ErrAlreadyBound):
		return unifyerror.New(http.StatusConflict, unifyerror.CodeConflict, err.Error())
	case isNetworkErr(err, network.ErrAccountMissing):
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, err.Error())
	}
	return unifyerror.DbError(err)
}

// MapNetworkError exposes the domain-to-HTTP mapping to controllers.
func MapNetworkError(err error) error { return mapNetworkError(err) }

// CreateAccount records an account and returns it, with the domain error mapped.
func CreateAccount(in account.CreateInput) (*account.Account, error) {
	acc, err := Accounts.Create(in)
	if err != nil {
		return nil, mapAccountError(err)
	}
	return acc, nil
}
