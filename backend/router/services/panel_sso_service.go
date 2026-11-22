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
	"errors"
	"headscale-panel/model"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/unifyerror"
	"net/http"
	"strings"

	"gorm.io/gorm"
)

// panelSSOService manages the panel's own OIDC client configuration.
type panelSSOService struct{}

// PanelSSOService is the panel SSO settings facade.
var PanelSSOService = new(panelSSOService)

// PanelSSOView is the settings payload, with the secret masked.
type PanelSSOView struct {
	Enabled               bool     `json:"enabled"`
	Issuer                string   `json:"issuer"`
	ClientID              string   `json:"client_id"`
	HasClientSecret       bool     `json:"has_client_secret"`
	Scopes                []string `json:"scopes"`
	EmailVerifiedRequired bool     `json:"email_verified_required"`
	Provisioning          string   `json:"provisioning"`
	DefaultRoleID         uint     `json:"default_role_id"`
}

// PanelSSOSaveInput is the update payload. An empty secret keeps the stored one.
type PanelSSOSaveInput struct {
	Enabled               bool
	Issuer                string
	ClientID              string
	ClientSecret          string
	Scopes                []string
	EmailVerifiedRequired bool
	Provisioning          string
	DefaultRoleID         uint
}

// PanelSSOConfig is the live configuration used by the callback handler.
type PanelSSOConfig struct {
	Enabled               bool
	Issuer                string
	ClientID              string
	ClientSecret          string
	Scopes                []string
	EmailVerifiedRequired bool
	Provisioning          string
	DefaultRoleID         uint
}

// settingsRow exposes the row to the account composition layer.
func (s *panelSSOService) settingsRow() (*model.PanelSSOSettings, error) {
	return s.load()
}

func (s *panelSSOService) load() (*model.PanelSSOSettings, error) {
	var row model.PanelSSOSettings
	err := model.DB.First(&row, 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &model.PanelSSOSettings{}, nil
	}
	if err != nil {
		return nil, unifyerror.DbError(err)
	}
	return &row, nil
}

// Get returns the settings for the admin UI.
func (s *panelSSOService) Get(actorUserID uint) (*PanelSSOView, error) {
	if err := RequirePermission(actorUserID, constants.PermSystemAuthManage); err != nil {
		return nil, err
	}

	row, err := s.load()
	if err != nil {
		return nil, err
	}

	return &PanelSSOView{
		Enabled:               row.Enabled,
		Issuer:                row.Issuer,
		ClientID:              row.ClientID,
		HasClientSecret:       strings.TrimSpace(row.ClientSecretEnc) != "",
		Scopes:                splitScopes(row.Scopes),
		EmailVerifiedRequired: row.EmailVerifiedRequired,
		Provisioning:          row.Provisioning,
		DefaultRoleID:         row.DefaultRoleID,
	}, nil
}

// Save persists the settings.
func (s *panelSSOService) Save(actorUserID uint, in PanelSSOSaveInput) (*PanelSSOView, error) {
	if err := RequirePermission(actorUserID, constants.PermSystemAuthManage); err != nil {
		return nil, err
	}

	if in.Enabled {
		if strings.TrimSpace(in.Issuer) == "" {
			return nil, unifyerror.WrongParam("issuer")
		}
		if strings.TrimSpace(in.ClientID) == "" {
			return nil, unifyerror.WrongParam("client_id")
		}
		if !model.ValidPanelSSOProvisioning(in.Provisioning) {
			return nil, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr,
				"provisioning must be explicitly set to \"disabled\" or \"jit\"")
		}
		if in.Provisioning == model.PanelSSOProvisioningJIT && in.DefaultRoleID == 0 {
			return nil, unifyerror.WrongParam("default_role_id")
		}
	}

	row, err := s.load()
	if err != nil {
		return nil, err
	}

	secretEnc := row.ClientSecretEnc
	if strings.TrimSpace(in.ClientSecret) != "" {
		sealed, sealErr := Secrets.Encrypt(in.ClientSecret)
		if sealErr != nil {
			return nil, unifyerror.ServerError(sealErr)
		}
		secretEnc = sealed
	}
	if in.Enabled && secretEnc == "" {
		return nil, unifyerror.WrongParam("client_secret")
	}

	row.ID = 1
	row.Enabled = in.Enabled
	row.Issuer = strings.TrimSpace(in.Issuer)
	row.ClientID = strings.TrimSpace(in.ClientID)
	row.ClientSecretEnc = secretEnc
	row.Scopes = strings.Join(in.Scopes, " ")
	row.EmailVerifiedRequired = in.EmailVerifiedRequired
	row.Provisioning = in.Provisioning
	row.DefaultRoleID = in.DefaultRoleID

	if err := model.DB.Save(row).Error; err != nil {
		return nil, unifyerror.DbError(err)
	}
	return s.Get(actorUserID)
}

// Config returns the live configuration, or nil when SSO is off.
func (s *panelSSOService) Config() *PanelSSOConfig {
	row, err := s.load()
	if err != nil || !row.Enabled || row.Issuer == "" || row.ClientID == "" {
		return nil
	}

	secret, decryptErr := Secrets.Decrypt(row.ClientSecretEnc)
	if decryptErr != nil {
		return nil
	}

	scopes := splitScopes(row.Scopes)
	if len(scopes) == 0 {
		scopes = []string{"openid", "profile", "email"}
	}

	return &PanelSSOConfig{
		Enabled:               true,
		Issuer:                row.Issuer,
		ClientID:              row.ClientID,
		ClientSecret:          secret,
		Scopes:                scopes,
		EmailVerifiedRequired: row.EmailVerifiedRequired,
		Provisioning:          row.Provisioning,
		DefaultRoleID:         row.DefaultRoleID,
	}
}

// Enabled reports whether panel SSO is configured and on.
func (s *panelSSOService) Enabled() bool {
	return s.Config() != nil
}

// RedirectURI is the callback the external IdP must be configured with.
func (s *panelSSOService) RedirectURI() string {
	return strings.TrimRight(strings.TrimSpace(conf.Conf.System.BaseURL), "/") +
		"/panel/api/v1/auth/panel-sso/callback"
}

func splitScopes(raw string) []string {
	fields := strings.Fields(raw)
	if len(fields) == 0 {
		return nil
	}
	return fields
}
