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
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

// ProvisioningMode decides what happens when an unknown subject signs in.
//
// The empty value is not a default: an unconfigured deployment must reject, so
// that creating accounts is always the result of a deliberate choice.
type ProvisioningMode string

const (
	// ProvisioningDisabled rejects sign-ins from unknown subjects.
	ProvisioningDisabled ProvisioningMode = "disabled"
	// ProvisioningJIT creates an account on first successful sign-in.
	ProvisioningJIT ProvisioningMode = "jit"
)

// LinkPolicy is the deployment's answer to "may this person get an account".
type LinkPolicy struct {
	Provisioning  ProvisioningMode
	DefaultRoleID uint
}

// IdentityClaims is what an IdP asserts about the person signing in.
type IdentityClaims struct {
	Provider          string
	Issuer            string
	Subject           string
	EmailAtLink       string
	DisplayName       string
	PreferredUsername string
	PictureURL        string
}

// RoleByName looks a role up by its unique name.
func (s *Service) RoleByName(name string) (*Role, error) {
	var role Role
	err := s.db.Preload("Permissions").Where("name = ?", name).First(&role).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrRoleNotFound
	}
	if err != nil {
		return nil, err
	}
	return &role, nil
}

// FindOrLinkIdentity resolves an SSO sign-in to an account.
//
// Lookup order is deliberate:
//
//  1. an existing identity row for (provider, issuer, subject) — the only
//     trustworthy key, because it is what the IdP guarantees to be stable;
//  2. otherwise, when provisioning is allowed and the email matches exactly one
//     existing account, link it — but only when no other identity has claimed
//     the account, and only after an explicit provisioning mode was configured.
//
// There is no "match by email and silently upgrade" path: that is account
// takeover whenever the IdP lets a user choose their own address.
func (s *Service) FindOrLinkIdentity(claims IdentityClaims, policy LinkPolicy) (*Account, error) {
	if claims.Issuer == "" || claims.Subject == "" {
		return nil, errors.New("issuer and subject are required")
	}

	var existing Identity
	err := s.db.Where("provider = ? AND issuer = ? AND subject = ?",
		claims.Provider, claims.Issuer, claims.Subject).First(&existing).Error
	if err == nil {
		return s.Get(existing.AccountID)
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	switch policy.Provisioning {
	case ProvisioningJIT:
		return s.provisionAccount(claims, policy)
	default:
		// An unset or unknown mode fails closed: creating accounts on an
		// unconfigured deployment is exactly the outcome the explicit setting
		// exists to prevent.
		return nil, ErrIdentityNotProvisioned
	}
}

// provisionAccount creates an account for a first-time SSO sign-in.
func (s *Service) provisionAccount(claims IdentityClaims, policy LinkPolicy) (*Account, error) {
	if policy.DefaultRoleID == 0 {
		return nil, errors.New("provisioning has no default role")
	}

	username := sanitizeUsername(firstNonEmpty(claims.PreferredUsername, claims.EmailAtLink, claims.Subject))
	if username == "" {
		return nil, errors.New("cannot derive a username from the identity provider claims")
	}

	var acc *Account
	err := s.db.Transaction(func(tx *gorm.DB) error {
		unique, uniqueErr := uniqueUsername(tx, username)
		if uniqueErr != nil {
			return uniqueErr
		}

		acc = &Account{
			Username:      unique,
			DisplayName:   claims.DisplayName,
			Email:         strings.TrimSpace(claims.EmailAtLink),
			Status:        StatusActive,
			RoleID:        policy.DefaultRoleID,
			ProfilePicURL: claims.PictureURL,
		}
		if createErr := tx.Create(acc).Error; createErr != nil {
			return createErr
		}

		return tx.Create(&Identity{
			AccountID:   acc.ID,
			Provider:    claims.Provider,
			Issuer:      claims.Issuer,
			Subject:     claims.Subject,
			EmailAtLink: claims.EmailAtLink,
		}).Error
	})
	if err != nil {
		return nil, err
	}
	return s.Get(acc.ID)
}

// RecordIdentityLogin stamps the last successful sign-in on the identity row.
func (s *Service) RecordIdentityLogin(provider, issuer, subject string) error {
	now := time.Now().UTC()
	return s.db.Model(&Identity{}).
		Where("provider = ? AND issuer = ? AND subject = ?", provider, issuer, subject).
		Update("last_login_at", now).Error
}

// IdentitiesOf returns the SSO identities linked to an account.
func (s *Service) IdentitiesOf(accountID uint) ([]Identity, error) {
	var out []Identity
	if err := s.db.Where("account_id = ?", accountID).Order("id").Find(&out).Error; err != nil {
		return nil, err
	}
	return out, nil
}

// LinkIdentity attaches an SSO identity to an account.
func (s *Service) LinkIdentity(accountID uint, claims IdentityClaims) (*Identity, error) {
	identity := &Identity{
		AccountID:   accountID,
		Provider:    claims.Provider,
		Issuer:      claims.Issuer,
		Subject:     claims.Subject,
		EmailAtLink: claims.EmailAtLink,
	}

	err := s.db.Create(identity).Error
	if err == nil {
		return identity, nil
	}

	var clash Identity
	if findErr := s.db.Where("provider = ? AND issuer = ? AND subject = ?",
		claims.Provider, claims.Issuer, claims.Subject).First(&clash).Error; findErr == nil {
		return nil, ErrIdentityLinked
	}
	return nil, err
}

// UnlinkIdentity detaches an SSO identity.
//
// Refused when it is the account's only credential: an account with neither a
// password nor an identity can never sign in again.
func (s *Service) UnlinkIdentity(accountID, identityID uint) error {
	acc, err := s.Get(accountID)
	if err != nil {
		return err
	}

	count, err := s.countIdentities(accountID)
	if err != nil {
		return err
	}
	if count <= 1 && !acc.CanSignInWithPassword() {
		return ErrLastCredential
	}

	res := s.db.Where("id = ? AND account_id = ?", identityID, accountID).Delete(&Identity{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Service) countIdentities(accountID uint) (int64, error) {
	var count int64
	err := s.db.Model(&Identity{}).Where("account_id = ?", accountID).Count(&count).Error
	return count, err
}

func sanitizeUsername(raw string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(raw)) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '.', r == '_', r == '-':
			b.WriteRune(r)
		case r == '@':
			b.WriteRune('.')
		}
	}

	out := strings.Trim(b.String(), ".-_")
	if len(out) > 48 {
		out = out[:48]
	}
	return out
}

func uniqueUsername(tx *gorm.DB, base string) (string, error) {
	candidate := base
	for i := 2; i < 1000; i++ {
		var count int64
		if err := tx.Model(&Account{}).Where("username = ?", candidate).Count(&count).Error; err != nil {
			return "", err
		}
		if count == 0 {
			return candidate, nil
		}
		candidate = fmt.Sprintf("%s-%d", base, i)
	}
	return "", ErrUsernameTaken
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
