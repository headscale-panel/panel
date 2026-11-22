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

package model

import "time"

// PanelSSOSettings is the single-row config for "panel signs users in through
// an external IdP".
//
// This is the panel acting as an OIDC *client*, which is a different thing from
// the panel acting as an IdP for headscale. Keeping them in separate tables is
// deliberate: they are opposite roles, and merging them is what produced the
// "hybrid_oidc" concept that headscale can never actually represent.
type PanelSSOSettings struct {
	ID        uint      `gorm:"primarykey" json:"-"`
	UpdatedAt time.Time `json:"updated_at"`

	Enabled  bool   `gorm:"not null;default:false" json:"enabled"`
	Issuer   string `gorm:"size:255" json:"issuer"`
	ClientID string `gorm:"size:255" json:"client_id"`
	// ClientSecretEnc is sealed with the same key as every other panel secret.
	ClientSecretEnc string `gorm:"size:1024" json:"-"`

	Scopes                string `gorm:"size:255" json:"scopes"`
	EmailVerifiedRequired bool   `gorm:"not null;default:true" json:"email_verified_required"`

	// Provisioning controls what happens the first time an unknown subject signs
	// in. There is no code-level default: an operator must choose, because
	// "auto create an account" and "reject unknown users" are both defensible
	// and the wrong one is a security incident.
	Provisioning string `gorm:"size:32" json:"provisioning"`

	DefaultRoleID uint `gorm:"not null;default:0" json:"default_role_id"`
}

func (PanelSSOSettings) TableName() string { return "panel_sso_settings" }

// PanelSSOProvisioning values.
const (
	// PanelSSOProvisioningDisabled rejects sign-ins from unknown subjects.
	PanelSSOProvisioningDisabled = "disabled"
	// PanelSSOProvisioningJIT creates an account on first successful sign-in.
	PanelSSOProvisioningJIT = "jit"
)

// ValidPanelSSOProvisioning reports whether a provisioning mode is known.
func ValidPanelSSOProvisioning(mode string) bool {
	return mode == PanelSSOProvisioningDisabled || mode == PanelSSOProvisioningJIT
}
