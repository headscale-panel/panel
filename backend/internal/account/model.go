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

package account

import (
	"time"

	"gorm.io/gorm"
)

// Status is the lifecycle state of an account.
type Status string

const (
	StatusActive   Status = "active"
	StatusDisabled Status = "disabled"
)

// Valid reports whether s is a known status.
func (s Status) Valid() bool {
	return s == StatusActive || s == StatusDisabled
}

// Account is a person who can sign in to the panel.
//
// It is deliberately unrelated to any headscale user: the two are joined only
// through a binding owned by the network domain, so losing one never silently
// destroys the other.
type Account struct {
	ID        uint           `gorm:"primarykey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	Username    string `gorm:"uniqueIndex;size:64;not null" json:"username"`
	DisplayName string `gorm:"size:128" json:"display_name"`
	Email       string `gorm:"size:255;index" json:"email"`

	Status Status `gorm:"size:16;not null;default:active;index" json:"status"`

	// PasswordHash is empty for accounts that only sign in through SSO. It is
	// never serialised; HasPassword carries the only part the UI needs.
	PasswordHash       string `gorm:"size:255" json:"-"`
	MustChangePassword bool   `gorm:"not null;default:false" json:"must_change_password"`

	// HasPassword is derived, not stored. Without it a client cannot tell a
	// password account from an SSO-only one, because the hash must stay private.
	HasPassword bool `gorm:"-" json:"has_password"`

	// SessionVersion invalidates every token issued before a password change,
	// a disable, or an explicit logout-everywhere. Tokens carry the value they
	// were minted with, so bumping this is the only way to revoke them.
	SessionVersion uint64 `gorm:"not null;default:1" json:"-"`

	TOTPSecret  string `gorm:"size:255" json:"-"`
	TOTPEnabled bool   `gorm:"not null;default:false" json:"totp_enabled"`

	ProfilePicURL   string     `gorm:"size:512" json:"profile_pic_url"`
	GuideTourSeenAt *time.Time `json:"guide_tour_seen_at"`

	RoleID uint `gorm:"not null;index" json:"role_id"`
	Role   Role `gorm:"foreignKey:RoleID" json:"role"`
}

// TableName keeps the table name explicit so a future package move cannot
// silently rename it.
func (Account) TableName() string { return "accounts" }

// CanSignInWithPassword reports whether a password credential exists.
func (a *Account) CanSignInWithPassword() bool {
	return a != nil && a.PasswordHash != ""
}

// decorate fills the derived fields before the value leaves the service.
func (a *Account) decorate() {
	if a == nil {
		return
	}
	a.HasPassword = a.PasswordHash != ""
}

// decorateAll applies decorate to a slice in place.
func decorateAll(accounts []Account) {
	for i := range accounts {
		accounts[i].decorate()
	}
}

// IsActive reports whether the account may authenticate.
func (a *Account) IsActive() bool {
	return a != nil && a.Status == StatusActive
}

// Identity links an account to an SSO subject.
//
// The tuple (provider, issuer, subject) is what an IdP guarantees to be stable,
// so it is the uniqueness key rather than the email address, which can change.
type Identity struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	AccountID uint    `gorm:"not null;index" json:"account_id"`
	Account   Account `gorm:"foreignKey:AccountID" json:"-"`

	Provider string `gorm:"size:32;not null" json:"provider"`
	Issuer   string `gorm:"size:255;not null" json:"issuer"`
	Subject  string `gorm:"size:255;not null" json:"subject"`

	// EmailAtLink records the address the IdP asserted when the link was made.
	// It is evidence for auditors, not a lookup key: the live address is
	// re-read on every sign-in.
	EmailAtLink string     `json:"email_at_link"`
	LastLoginAt *time.Time `json:"last_login_at"`
}

func (Identity) TableName() string { return "account_identities" }

// Role groups permissions and is the only thing the authorization layer reads.
type Role struct {
	ID          uint      `gorm:"primarykey" json:"id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	Name        string    `gorm:"uniqueIndex;size:64;not null" json:"name"`
	Description string    `gorm:"size:255" json:"description"`

	// IsSystemAdmin grants everything and can never be deleted or have its
	// permission set edited. Authorization checks this flag, never a role name.
	IsSystemAdmin bool `gorm:"not null;default:false" json:"is_system_admin"`

	Permissions []Permission `gorm:"many2many:role_permissions" json:"permissions,omitempty"`
}

func (Role) TableName() string { return "roles" }

// Permission is a single authorization code.
type Permission struct {
	ID   uint   `gorm:"primarykey" json:"id"`
	Code string `gorm:"uniqueIndex;size:96;not null" json:"code"`
	Name string `gorm:"size:128;not null" json:"name"`
	Type string `gorm:"size:16;not null" json:"type"`
}

func (Permission) TableName() string { return "permissions" }

// RolePermission is the join row. Declared explicitly so the composite key and
// cascade behaviour are visible in the migration.
type RolePermission struct {
	RoleID       uint `gorm:"primaryKey" json:"role_id"`
	PermissionID uint `gorm:"primaryKey" json:"permission_id"`
}

func (RolePermission) TableName() string { return "role_permissions" }

// Models returns every model the account domain owns, in migration order.
func Models() []any {
	return []any{&Role{}, &Permission{}, &RolePermission{}, &Account{}, &Identity{}}
}
