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
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/pkg/utils/jwt"
	"net/http"
	"strings"
)

// LoginRequest is the password sign-in payload.
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	TOTPCode string `json:"totp_code"`
}

// LoginResult is what a successful sign-in returns.
type LoginResult struct {
	Token          string           `json:"token"`
	Account        *account.Account `json:"account"`
	Permissions    []string         `json:"permissions"`
	NeedsTOTPSetup bool             `json:"needs_totp_setup"`
}

// LoginOptions carries deployment-level switches that affect sign-in.
type LoginOptions struct {
	// PasswordLoginEnabled is false when the panel is configured for SSO only.
	PasswordLoginEnabled bool
}

// LoginWithPassword authenticates an account.
func LoginWithPassword(ctx context.Context, req LoginRequest) (*LoginResult, error) {
	acc, err := Accounts.GetByUsername(strings.TrimSpace(req.Username))
	if err != nil {
		// A missing account and a wrong password must be indistinguishable, or
		// the endpoint becomes a username oracle.
		return nil, unifyerror.LoginFailed()
	}
	if !acc.IsActive() || !acc.CanSignInWithPassword() {
		// Return the same generic error as a wrong password so unauthenticated
		// callers cannot enumerate disabled or SSO-only usernames.
		return nil, unifyerror.LoginFailed()
	}
	if !Accounts.VerifyPassword(acc, req.Password) {
		return nil, unifyerror.LoginFailed()
	}

	if acc.TOTPEnabled {
		if req.TOTPCode == "" {
			return nil, unifyerror.New(http.StatusUnauthorized, unifyerror.CodeInvalidToken, "TOTP code required")
		}
		secret, decErr := decryptTOTPSecret(acc.TOTPSecret)
		if decErr != nil || !validateTOTPWithReplayGuard(acc.ID, req.TOTPCode, secret) {
			return nil, unifyerror.New(http.StatusUnauthorized, unifyerror.CodeInvalidToken, "invalid TOTP code")
		}
	}

	token, err := jwt.GenerateToken(acc.ID, acc.Username, acc.RoleID, acc.SessionVersion)
	if err != nil {
		return nil, unifyerror.ServerError(err)
	}

	return &LoginResult{
		Token:       token,
		Account:     acc,
		Permissions: Accounts.PermissionCodes(acc),
	}, nil
}

// Session is the authenticated principal attached to a request.
type Session struct {
	Account     *account.Account
	Permissions []string
}

// IsSystemAdmin reports whether the account holds the built-in administrator
// role, which grants every permission.
func (s *Session) IsSystemAdmin() bool {
	return s != nil && s.Account != nil && s.Account.Role.IsSystemAdmin
}

// Can reports whether the session holds a permission code.
func (s *Session) Can(code string) bool {
	if s == nil || s.Account == nil {
		return false
	}
	return Accounts.HasPermission(s.Account, code)
}

// ResolveSession validates a parsed token against live account state.
//
// A token is only as trustworthy as the account it names: the signature proves
// it was minted by this panel, not that the account is still enabled or that its
// password has not been rotated since. Both are re-checked here.
func ResolveSession(claims *jwt.Claims) (*Session, error) {
	if claims == nil || claims.AccountID == 0 {
		return nil, unifyerror.InvalidToken()
	}

	acc, err := Accounts.Get(claims.AccountID)
	if err != nil {
		if errors.Is(err, account.ErrNotFound) {
			return nil, unifyerror.InvalidToken()
		}
		return nil, unifyerror.DbError(err)
	}

	if !acc.IsActive() {
		return nil, unifyerror.InvalidToken()
	}
	if acc.SessionVersion != claims.SessionVersion {
		return nil, unifyerror.InvalidToken()
	}

	return &Session{Account: acc, Permissions: Accounts.PermissionCodes(acc)}, nil
}

// RequirePermission is the service-level half of the authorization double check.
//
// Routes are already guarded by PermissionMiddleware; this catches a handler that
// is reachable through another route or called directly.
func RequirePermission(accountID uint, code string) error {
	if Accounts == nil {
		return unifyerror.ServerError(errors.New("account domain not initialised"))
	}

	acc, err := Accounts.Get(accountID)
	if err != nil {
		if errors.Is(err, account.ErrNotFound) {
			return unifyerror.InvalidToken()
		}
		return unifyerror.DbError(err)
	}
	if !acc.IsActive() {
		return unifyerror.UserNotActive()
	}
	if !Accounts.HasPermission(acc, code) {
		return unifyerror.Forbidden()
	}
	return nil
}

// RequireAnyPermission succeeds when the account holds at least one code.
func RequireAnyPermission(accountID uint, codes ...string) error {
	if len(codes) == 0 {
		return nil
	}
	if Accounts == nil {
		return unifyerror.ServerError(errors.New("account domain not initialised"))
	}

	acc, err := Accounts.Get(accountID)
	if err != nil {
		if errors.Is(err, account.ErrNotFound) {
			return unifyerror.InvalidToken()
		}
		return unifyerror.DbError(err)
	}
	if !acc.IsActive() {
		return unifyerror.UserNotActive()
	}
	for _, code := range codes {
		if Accounts.HasPermission(acc, code) {
			return nil
		}
	}
	return unifyerror.Forbidden()
}

// RequireSystemAdmin guards operations that must not be delegated through a
// custom role, such as editing the system administrator role itself.
func RequireSystemAdmin(accountID uint) (*account.Account, error) {
	acc, err := Accounts.Get(accountID)
	if err != nil {
		if errors.Is(err, account.ErrNotFound) {
			return nil, unifyerror.InvalidToken()
		}
		return nil, unifyerror.DbError(err)
	}
	if !acc.IsActive() {
		return nil, unifyerror.UserNotActive()
	}
	if !acc.Role.IsSystemAdmin {
		return nil, unifyerror.Forbidden()
	}
	return acc, nil
}

// RequireAdmin checks system-administrator rights.
//
// Kept as a named helper because "administrator" reads better than "system
// admin" at most call sites, and the distinction only matters inside the role
// management endpoints.
func RequireAdmin(accountID uint) error {
	_, err := RequireSystemAdmin(accountID)
	return err
}

// MeView is the profile payload returned by GET /me.
type MeView struct {
	ID            uint     `json:"id"`
	Username      string   `json:"username"`
	DisplayName   string   `json:"display_name"`
	Email         string   `json:"email"`
	Status        string   `json:"status"`
	RoleID        uint     `json:"role_id"`
	RoleName      string   `json:"role_name"`
	IsSystemAdmin bool     `json:"is_system_admin"`
	Permissions   []string `json:"permissions"`
	ProfilePicURL string   `json:"profile_pic_url"`
	TOTPEnabled   bool     `json:"totp_enabled"`
	HasPassword   bool     `json:"has_password"`
	GuideTourSeen bool     `json:"guide_tour_seen"`
}

// BuildMeView projects the signed-in account.
func BuildMeView(s *Session) *MeView {
	if s == nil || s.Account == nil {
		return nil
	}
	acc := s.Account

	return &MeView{
		ID:            acc.ID,
		Username:      acc.Username,
		DisplayName:   acc.DisplayName,
		Email:         acc.Email,
		Status:        string(acc.Status),
		RoleID:        acc.RoleID,
		RoleName:      acc.Role.Name,
		IsSystemAdmin: acc.Role.IsSystemAdmin,
		Permissions:   s.Permissions,
		ProfilePicURL: acc.ProfilePicURL,
		TOTPEnabled:   acc.TOTPEnabled,
		HasPassword:   acc.CanSignInWithPassword(),
		GuideTourSeen: acc.GuideTourSeenAt != nil,
	}
}

// WildcardPermission is re-exported so middleware and controllers agree on the
// single wildcard token.
const WildcardPermission = constants.PermWildcard

// AccountCreateInput mirrors the domain creation payload so controllers do not
// import the domain package directly.
type AccountCreateInput = account.CreateInput

// MapAccountError exposes the domain-to-HTTP error mapping to controllers.
func MapAccountError(err error) error { return mapAccountError(err) }

// BuildMeViewFromAccount projects an account that is not attached to a session.
func BuildMeViewFromAccount(acc *account.Account, permissions []string) *MeView {
	if acc == nil {
		return nil
	}
	return BuildMeView(&Session{Account: acc, Permissions: permissions})
}

// DefaultRoleID returns the role new self-registered accounts receive.
func DefaultRoleID() (uint, error) {
	role, err := Accounts.RoleByName(constants.MemberRoleName)
	if err != nil {
		return 0, unifyerror.ServerError(err)
	}
	return role.ID, nil
}

// SSOClaims is what the external IdP asserted about the person signing in.
type SSOClaims struct {
	Issuer            string
	Subject           string
	Email             string
	EmailVerified     bool
	Name              string
	PreferredUsername string
	Picture           string
}

// SignInWithSSO resolves an SSO sign-in to a panel account and mints a token.
//
// The identity key is (issuer, subject), never the email address. Matching on
// email is how an account gets taken over: an IdP that lets a user set an
// arbitrary address would let them claim someone else's panel account.
func SignInWithSSO(claims SSOClaims) (*LoginResult, error) {
	policy, policyErr := ssoLinkPolicy()
	if policyErr != nil {
		return nil, policyErr
	}

	acc, err := Accounts.FindOrLinkIdentity(account.IdentityClaims{
		Provider:          "oidc",
		Issuer:            claims.Issuer,
		Subject:           claims.Subject,
		EmailAtLink:       claims.Email,
		DisplayName:       firstNonEmpty(claims.Name, claims.PreferredUsername),
		PreferredUsername: claims.PreferredUsername,
		PictureURL:        claims.Picture,
	}, policy)
	if err != nil {
		return nil, mapAccountError(err)
	}
	if !acc.IsActive() {
		return nil, unifyerror.UserNotActive()
	}

	if err := Accounts.RecordIdentityLogin("oidc", claims.Issuer, claims.Subject); err != nil {
		return nil, unifyerror.DbError(err)
	}

	token, tokenErr := jwt.GenerateToken(acc.ID, acc.Username, acc.RoleID, acc.SessionVersion)
	if tokenErr != nil {
		return nil, unifyerror.ServerError(tokenErr)
	}

	return &LoginResult{
		Token:       token,
		Account:     acc,
		Permissions: Accounts.PermissionCodes(acc),
	}, nil
}

// ssoLinkPolicy reads the deployment's provisioning choice.
func ssoLinkPolicy() (account.LinkPolicy, error) {
	cfg, err := PanelSSOService.settingsRow()
	if err != nil {
		return account.LinkPolicy{}, unifyerror.DbError(err)
	}
	return account.LinkPolicy{
		Provisioning:  account.ProvisioningMode(cfg.Provisioning),
		DefaultRoleID: cfg.DefaultRoleID,
	}, nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
