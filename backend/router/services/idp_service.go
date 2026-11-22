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
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"headscale-panel/internal/account"
	"headscale-panel/model"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/idp"
	"headscale-panel/pkg/log"
	"headscale-panel/pkg/unifyerror"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"
)

const idpStateKey = "hs_idp_state"

// idpState is the persisted on/off switch and enrolment settings.
//
// It is separate from the config file on purpose: the capability layer has to be
// controlled by something the config file cannot override, otherwise a stale
// `oidc:` block in headscale.yaml would resurrect the provider after it was
// turned off (see the three-layer defence in the design).
type idpState struct {
	Enabled               bool   `json:"enabled"`
	EnrollmentMode        string `json:"enrollment_mode"`
	AutoBind              bool   `json:"auto_bind"`
	EnabledAt             string `json:"enabled_at,omitempty"`
	ClientSecretEncrypted string `json:"client_secret_enc,omitempty"`
}

// idpService is the panel acting as an OIDC provider for headscale.
type idpService struct {
	provider *idp.Provider
}

// IdPService is the panel IdP facade.
var IdPService = new(idpService)

// InitPanelIDP loads the signing key and builds the provider.
func (s *idpService) Init() error {
	issuer := strings.TrimRight(strings.TrimSpace(conf.Conf.System.BaseURL), "/")
	if !idp.IsAbsoluteHTTPURL(issuer) {
		log.L.Warn("panel IdP disabled: SYSTEM_BASE_URL must be an absolute http(s) URL",
			zap.String("base_url", issuer))
		return nil
	}

	keyPath := filepath.Join(constants.DataDir, "idp", "signing-key.pem")
	key, err := idp.LoadOrCreateSigningKey(keyPath)
	if err != nil {
		return err
	}

	provider, buildErr := idp.New(key, issuer)
	if buildErr != nil {
		return buildErr
	}

	s.provider = provider
	return nil
}

// Provider returns the built provider, or nil when the panel is not configured
// as an IdP.
func (s *idpService) Provider() *idp.Provider { return s.provider }

// State returns the persisted on/off switch.
func (s *idpService) State() (*idpState, error) {
	var setting model.PanelSetting
	err := model.DB.Where("key = ?", idpStateKey).First(&setting).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// Enrolment defaults to role_based because the alternative — anyone with
		// a panel account can join the tailnet — is not a safe default.
		return &idpState{EnrollmentMode: "role_based", AutoBind: true}, nil
	}
	if err != nil {
		return nil, unifyerror.DbError(err)
	}

	state := &idpState{}
	if decodeErr := json.Unmarshal([]byte(setting.Value), state); decodeErr != nil {
		return &idpState{EnrollmentMode: "role_based", AutoBind: true}, nil
	}
	if state.EnrollmentMode == "" {
		state.EnrollmentMode = "role_based"
	}
	return state, nil
}

// SetEnabled turns the provider on or off.
func (s *idpService) SetEnabled(actorUserID uint, enabled bool) (*idpState, error) {
	if err := RequirePermission(actorUserID, constants.PermSystemAuthManage); err != nil {
		return nil, err
	}

	state, err := s.State()
	if err != nil {
		return nil, err
	}
	state.Enabled = enabled
	if enabled {
		state.EnabledAt = time.Now().UTC().Format(time.RFC3339)
		if strings.TrimSpace(state.ClientSecretEncrypted) == "" {
			buf := make([]byte, 32)
			if _, randErr := rand.Read(buf); randErr != nil {
				return nil, unifyerror.ServerError(randErr)
			}
			sealed, sealErr := Secrets.Encrypt(base64.RawURLEncoding.EncodeToString(buf))
			if sealErr != nil {
				return nil, unifyerror.ServerError(sealErr)
			}
			state.ClientSecretEncrypted = sealed
		}
	}

	if err := s.save(state); err != nil {
		return nil, err
	}
	return state, nil
}

func (s *idpService) save(state *idpState) error {
	raw, err := json.Marshal(state)
	if err != nil {
		return unifyerror.ServerError(err)
	}

	var setting model.PanelSetting
	findErr := model.DB.Where("key = ?", idpStateKey).First(&setting).Error
	if findErr != nil {
		setting = model.PanelSetting{Key: idpStateKey, Value: string(raw)}
		if createErr := model.DB.Create(&setting).Error; createErr != nil {
			return unifyerror.DbError(createErr)
		}
		return nil
	}

	setting.Value = string(raw)
	if saveErr := model.DB.Save(&setting).Error; saveErr != nil {
		return unifyerror.DbError(saveErr)
	}
	return nil
}

// Authorize subjects the request to the enrolment gate and issues a code.
//
// The gate is what makes this an IdP for a VPN rather than a general identity
// provider: holding a panel account is not enough, the account must also be
// allowed to bring devices onto the tailnet.
func (s *idpService) Authorize(ctx context.Context, actorUserID uint, query idp.AuthorizationQuery) (string, error) {
	if s.provider == nil {
		return "", unifyerror.New(http.StatusServiceUnavailable, unifyerror.CodeHeadscaleAPIErr,
			"the panel is not configured as an identity provider")
	}

	state, err := s.State()
	if err != nil {
		return "", err
	}
	if !state.Enabled {
		return "", unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr,
			"the panel identity provider is turned off")
	}

	req, validateErr := s.provider.ValidateAuthorization(
		query.ClientID, query.RedirectURI, s.redirectURI(),
		query.ResponseType, query.Scope, query.CodeChallenge, query.CodeChallengeMethod)
	if validateErr != nil {
		return "", mapIDPError(validateErr)
	}
	req.Nonce = query.Nonce
	req.State = query.State

	acc, accErr := Accounts.Get(actorUserID)
	if accErr != nil {
		return "", unifyerror.InvalidToken()
	}
	if !acc.IsActive() {
		return "", unifyerror.UserNotActive()
	}
	if !Accounts.HasPermission(acc, constants.PermNetworkDeviceEnrollSelf) {
		return "", unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden,
			"this account is not permitted to enroll devices; an administrator must grant network:device:enroll:self")
	}

	groups, groupErr := s.groupsFor(acc)
	if groupErr != nil {
		return "", groupErr
	}

	return s.provider.IssueCode(idp.User{
		AccountID:   acc.ID,
		Username:    acc.Username,
		DisplayName: acc.DisplayName,
		Email:       acc.Email,
		PictureURL:  acc.ProfilePicURL,
		Groups:      groups,
	}, *req)
}

// Exchange redeems a code for tokens.
func (s *idpService) Exchange(ctx context.Context, code, clientID, clientSecret, redirectURI, verifier string) (string, string, error) {
	if s.provider == nil {
		return "", "", unifyerror.New(http.StatusServiceUnavailable, unifyerror.CodeHeadscaleAPIErr,
			"the panel is not configured as an identity provider")
	}

	state, err := s.State()
	if err != nil {
		return "", "", err
	}
	if !state.Enabled {
		return "", "", unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr,
			"the panel identity provider is turned off")
	}

	if strings.TrimSpace(state.ClientSecretEncrypted) != "" {
		expectedSecret, decErr := Secrets.Decrypt(state.ClientSecretEncrypted)
		if decErr != nil {
			return "", "", unifyerror.ServerError(decErr)
		}
		if clientSecret == "" || subtle.ConstantTimeCompare([]byte(clientSecret), []byte(expectedSecret)) != 1 {
			return "", "", idp.ErrInvalidClient
		}
	}

	return s.provider.Exchange(code, clientID, redirectURI, verifier, s.claimsForAccount)
}

// UserInfo returns claims for a valid access token.
func (s *idpService) UserInfo(rawToken string) (map[string]any, error) {
	if s.provider == nil {
		return nil, unifyerror.New(http.StatusServiceUnavailable, unifyerror.CodeHeadscaleAPIErr,
			"the panel is not configured as an identity provider")
	}

	state, err := s.State()
	if err != nil {
		return nil, err
	}
	if !state.Enabled {
		return nil, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr,
			"the panel identity provider is turned off")
	}

	claims, parseErr := s.provider.ParseAccessToken(rawToken)
	if parseErr != nil {
		return nil, unifyerror.InvalidToken()
	}

	accountID, ok := idp.ParseSubject(claims.Subject)
	if !ok {
		return nil, unifyerror.InvalidToken()
	}

	acc, accErr := Accounts.Get(accountID)
	if accErr != nil || !acc.IsActive() {
		return nil, unifyerror.InvalidToken()
	}

	info := map[string]any{
		"sub":                claims.Subject,
		"name":               firstNonEmpty(acc.DisplayName, acc.Username),
		"preferred_username": acc.Username,
		"email":              acc.Email,
		"email_verified":     true,
	}
	if acc.ProfilePicURL != "" {
		info["picture"] = acc.ProfilePicURL
	}
	if groups, groupErr := s.groupsFor(acc); groupErr == nil && len(groups) > 0 {
		info["groups"] = groups
	}
	return info, nil
}

// Discovery returns the OpenID configuration document.
func (s *idpService) Discovery() (map[string]any, error) {
	if s.provider == nil {
		return nil, unifyerror.New(http.StatusServiceUnavailable, unifyerror.CodeHeadscaleAPIErr,
			"the panel is not configured as an identity provider")
	}
	return s.provider.Discovery(), nil
}

// JWKS returns the public signing keys.
func (s *idpService) JWKS() (map[string]any, error) {
	if s.provider == nil {
		return nil, unifyerror.New(http.StatusServiceUnavailable, unifyerror.CodeHeadscaleAPIErr,
			"the panel is not configured as an identity provider")
	}
	return s.provider.JWKS(), nil
}

// groupsFor renders the account's role as an OIDC group claim.
func (s *idpService) groupsFor(acc *account.Account) ([]string, error) {
	if acc == nil || strings.TrimSpace(acc.Role.Name) == "" {
		return nil, nil
	}
	return []string{acc.Role.Name}, nil
}

// claimsForAccount builds the claim payload for the account a code belongs to.
func (s *idpService) claimsForAccount(accountID uint) (idp.User, error) {
	acc, err := Accounts.Get(accountID)
	if err != nil {
		return idp.User{}, err
	}
	if !acc.IsActive() {
		return idp.User{}, errors.New("account is disabled")
	}
	if !Accounts.HasPermission(acc, constants.PermNetworkDeviceEnrollSelf) {
		return idp.User{}, errors.New("account may no longer enroll devices")
	}

	groups, _ := s.groupsFor(acc)
	return idp.User{
		AccountID:   acc.ID,
		Username:    acc.Username,
		DisplayName: acc.DisplayName,
		Email:       acc.Email,
		PictureURL:  acc.ProfilePicURL,
		Groups:      groups,
	}, nil
}

func (s *idpService) headscaleServerURL() string {
	return HeadscaleConfigService.ServerURL()
}

func (s *idpService) redirectURI() string {
	return idp.RedirectURI(s.headscaleServerURL())
}

func mapIDPError(err error) error {
	switch {
	case errors.Is(err, idp.ErrInvalidClient):
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "unknown client_id")
	case errors.Is(err, idp.ErrInvalidRedirectURI):
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr,
			"redirect_uri does not match the callback headscale is configured with")
	case errors.Is(err, idp.ErrInvalidScope):
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr,
			"the openid scope is required")
	case errors.Is(err, idp.ErrInvalidPKCE):
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "invalid code_challenge")
	case errors.Is(err, idp.ErrCodeExpired):
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "authorization code expired")
	case errors.Is(err, idp.ErrInvalidCode):
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "invalid authorization code")
	}
	return unifyerror.ServerError(err)
}

// IdPStateView is the admin-facing description of the provider.
type IdPStateView struct {
	Enabled        bool   `json:"enabled"`
	Configured     bool   `json:"configured"`
	Issuer         string `json:"issuer,omitempty"`
	ClientID       string `json:"client_id,omitempty"`
	RedirectURI    string `json:"redirect_uri,omitempty"`
	EnrollmentMode string `json:"enrollment_mode"`
	AutoBind       bool   `json:"auto_bind"`
	EnabledAt      string `json:"enabled_at,omitempty"`
}

// DescribeState reports whether the provider is usable and what headscale must
// be configured with.
func (s *idpService) DescribeState(ctx context.Context) (*IdPStateView, error) {
	state, err := s.State()
	if err != nil {
		return nil, err
	}

	view := &IdPStateView{
		Enabled:        state.Enabled,
		Configured:     s.provider != nil,
		EnrollmentMode: state.EnrollmentMode,
		AutoBind:       state.AutoBind,
		EnabledAt:      state.EnabledAt,
	}
	if s.provider != nil {
		view.Issuer = s.provider.Issuer()
		view.ClientID = idp.ClientID
		view.RedirectURI = s.redirectURI()
	}
	return view, nil
}

// GrantEnrollPermission gives a role the right to enrol devices.
func GrantEnrollPermission(actorID, roleID uint) (*account.Role, error) {
	role, err := Accounts.GetRole(roleID)
	if err != nil {
		return nil, mapRoleError(err)
	}

	perm, permErr := Accounts.PermissionByCode(constants.PermNetworkDeviceEnrollSelf)
	if permErr != nil {
		return nil, unifyerror.ServerError(permErr)
	}

	existing := make([]uint, 0, len(role.Permissions)+1)
	for _, p := range role.Permissions {
		existing = append(existing, p.ID)
	}
	existing = append(existing, perm.ID)

	return SetRolePermissions(actorID, roleID, existing)
}
