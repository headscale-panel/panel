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

package network

import (
	"context"
	"errors"
	"time"

	"headscale-panel/pkg/hsapi"

	"gorm.io/gorm"
)

// Domain errors.
var (
	ErrBindingNotFound  = errors.New("binding not found")
	ErrAlreadyBound     = errors.New("network identity is already bound to an account")
	ErrIdentityNotFound = errors.New("network identity not found in headscale")
	ErrAccountMissing   = errors.New("target account does not exist")
)

// Upstream is the slice of the headscale API this domain needs.
type Upstream interface {
	ListUsers(ctx context.Context) ([]hsapi.User, error)
	ListNodes(ctx context.Context, userName string) ([]hsapi.Node, error)
}

// Service owns bindings and the read-only projection of upstream identities.
type Service struct {
	db *gorm.DB
	up Upstream
}

// NewService wires the domain to a database and an upstream reader.
func NewService(db *gorm.DB, up Upstream) *Service {
	return &Service{db: db, up: up}
}

// SetUpstream swaps the upstream reader. It exists so the panel can rebuild the
// client after the connection settings change without recreating the service.
func (s *Service) SetUpstream(up Upstream) {
	s.up = up
}

// Snapshot reads upstream state and local bindings and projects them.
func (s *Service) Snapshot(ctx context.Context, panelIssuer string) (*Snapshot, error) {
	if s.up == nil {
		return nil, ErrIdentityNotFound
	}

	users, err := s.up.ListUsers(ctx)
	if err != nil {
		return nil, err
	}
	nodes, err := s.up.ListNodes(ctx, "")
	if err != nil {
		return nil, err
	}
	bindings, err := s.AllBindings()
	if err != nil {
		return nil, err
	}

	return BuildSnapshot(users, nodes, bindings, panelIssuer), nil
}

// AllBindings returns every binding.
func (s *Service) AllBindings() ([]Binding, error) {
	var out []Binding
	if err := s.db.Order("id").Find(&out).Error; err != nil {
		return nil, err
	}
	return out, nil
}

// BindingsOf returns the bindings belonging to one account.
func (s *Service) BindingsOf(accountID uint) ([]Binding, error) {
	var out []Binding
	if err := s.db.Where("account_id = ?", accountID).Order("id").Find(&out).Error; err != nil {
		return nil, err
	}
	return out, nil
}

// GetByHSUser returns the binding for a headscale user, or ErrBindingNotFound.
func (s *Service) GetByHSUser(hsUserID uint64) (*Binding, error) {
	var b Binding
	err := s.db.Where("hs_user_id = ?", hsUserID).First(&b).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrBindingNotFound
	}
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// Bind links an identity to an account.
//
// A network identity belongs to at most one account (enforced by a unique index
// on hs_user_id) and an account has at most one primary identity.
func (s *Service) Bind(ctx context.Context, accountID uint, hsUserID uint64, primary bool) (*Binding, error) {
	if err := s.fillCache(ctx, hsUserID); err != nil {
		return nil, err
	}

	b := &Binding{AccountID: accountID, HSUserID: hsUserID, IsPrimary: primary}
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&Binding{}).Where("hs_user_id = ?", hsUserID).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return ErrAlreadyBound
		}

		if primary {
			if err := clearPrimary(tx, accountID, 0); err != nil {
				return err
			}
		}
		return tx.Create(b).Error
	})
	if err != nil {
		return nil, err
	}
	return s.GetByHSUser(hsUserID)
}

// Unbind removes the binding. The headscale user is untouched.
func (s *Service) Unbind(hsUserID uint64) error {
	res := s.db.Where("hs_user_id = ?", hsUserID).Delete(&Binding{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrBindingNotFound
	}
	return nil
}

// Transfer moves a binding from one account to another without deleting and
// recreating it, so its audit trail and primary flag stay attached.
func (s *Service) Transfer(ctx context.Context, toAccountID uint, hsUserID uint64) (*Binding, error) {
	b, err := s.GetByHSUser(hsUserID)
	if err != nil {
		return nil, err
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		updates := map[string]any{"account_id": toAccountID}
		if b.IsPrimary {
			if err := clearPrimary(tx, toAccountID, b.ID); err != nil {
				return err
			}
		}
		return tx.Model(&Binding{}).Where("id = ?", b.ID).Updates(updates).Error
	})
	if err != nil {
		return nil, err
	}
	return s.GetByHSUser(hsUserID)
}

// SetPrimary marks one binding as the account's primary identity, clearing any
// previous one.
func (s *Service) SetPrimary(accountID uint, hsUserID uint64) error {
	b, err := s.GetByHSUser(hsUserID)
	if err != nil {
		return err
	}
	if b.AccountID != accountID {
		return ErrBindingNotFound
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := clearPrimary(tx, accountID, b.ID); err != nil {
			return err
		}
		return tx.Model(&Binding{}).Where("id = ?", b.ID).Update("is_primary", true).Error
	})
}

// clearPrimary unsets is_primary for every binding of an account except keepID.
func clearPrimary(tx *gorm.DB, accountID, keepID uint) error {
	q := tx.Model(&Binding{}).Where("account_id = ? AND is_primary = ?", accountID, true)
	if keepID != 0 {
		q = q.Where("id <> ?", keepID)
	}
	return q.Update("is_primary", false).Error
}

// Orphan is a binding whose headscale user no longer exists upstream.
type Orphan struct {
	Binding
	Reason string `json:"reason"`
}

// Orphans returns bindings that point at identities headscale no longer has.
//
// Deleting a headscale user leaves the binding behind on purpose: dropping it
// automatically would erase the record of who the device belonged to, and the
// account may need to be repointed at a new identity.
func (s *Service) Orphans(ctx context.Context) ([]Orphan, error) {
	if s.up == nil {
		return nil, ErrIdentityNotFound
	}

	users, err := s.up.ListUsers(ctx)
	if err != nil {
		return nil, err
	}
	live := make(map[uint64]struct{}, len(users))
	for i := range users {
		live[parseUserID(users[i].Id)] = struct{}{}
	}

	bindings, err := s.AllBindings()
	if err != nil {
		return nil, err
	}

	var out []Orphan
	for _, b := range bindings {
		if _, ok := live[b.HSUserID]; ok {
			continue
		}
		out = append(out, Orphan{Binding: b, Reason: "headscale user no longer exists"})
	}
	return out, nil
}

// PurgeOrphans deletes orphan bindings. It only touches local rows; the
// headscale side is already gone.
func (s *Service) PurgeOrphans(ctx context.Context) (int, error) {
	orphans, err := s.Orphans(ctx)
	if err != nil {
		return 0, err
	}
	if len(orphans) == 0 {
		return 0, nil
	}

	ids := make([]uint, 0, len(orphans))
	for _, o := range orphans {
		ids = append(ids, o.ID)
	}
	res := s.db.Where("id IN ?", ids).Delete(&Binding{})
	return int(res.RowsAffected), res.Error
}

// Reconcile creates missing bindings for identities the panel IdP minted.
//
// Only panel-minted identities are eligible: for any other origin the panel
// cannot prove which account the identity belongs to, and guessing from an email
// address is how an account gets taken over.
//
// knownAccounts is supplied by the caller because this package must not import
// the account domain. An identity whose account is absent is reported as failed
// rather than bound to a row that no longer exists.
func (s *Service) Reconcile(ctx context.Context, panelIssuer string, knownAccounts map[uint64]struct{}) (ReconcileResult, error) {
	var result ReconcileResult
	if s.up == nil {
		return result, ErrIdentityNotFound
	}

	users, err := s.up.ListUsers(ctx)
	if err != nil {
		return result, err
	}
	existing, err := s.AllBindings()
	if err != nil {
		return result, err
	}

	bound := make(map[uint64]struct{}, len(existing))
	hasPrimaryFor := make(map[uint64]int, len(existing))
	for _, b := range existing {
		bound[b.HSUserID] = struct{}{}
		if b.IsPrimary {
			hasPrimaryFor[uint64(b.AccountID)]++
		}
	}

	for i := range users {
		u := &users[i]
		id := parseUserID(u.Id)
		if id == 0 {
			continue
		}
		result.Scanned++

		if _, ok := bound[id]; ok {
			result.Skipped = append(result.Skipped, id)
			continue
		}

		origin, _ := u.Classify(panelIssuer)
		if origin != hsapi.OriginPanelIDP {
			result.Skipped = append(result.Skipped, id)
			continue
		}

		accountID, ok := u.SubjectFromPanelIssuer(panelIssuer)
		if !ok {
			result.Failed = append(result.Failed, id)
			continue
		}
		if _, ok := knownAccounts[accountID]; !ok {
			// The account was deleted while its identity lived on upstream.
			result.Failed = append(result.Failed, id)
			continue
		}

		primary := hasPrimaryFor[accountID] == 0
		if err := s.insertReconciled(id, accountID, primary); err != nil {
			result.Failed = append(result.Failed, id)
			continue
		}
		if primary {
			hasPrimaryFor[accountID]++
		}
		bound[id] = struct{}{}
		result.Bound = append(result.Bound, id)
	}

	return result, nil
}

func (s *Service) insertReconciled(hsUserID, accountID uint64, primary bool) error {
	b := &Binding{AccountID: uint(accountID), HSUserID: hsUserID, IsPrimary: primary}
	err := s.db.Create(b).Error
	if err == nil {
		return nil
	}
	// A concurrent pass may have inserted the same row; that is success.
	var again int64
	if countErr := s.db.Model(&Binding{}).Where("hs_user_id = ?", hsUserID).Count(&again).Error; countErr == nil && again > 0 {
		return nil
	}
	return err
}

// fillCache refreshes the cached upstream fields for a binding.
func (s *Service) fillCache(ctx context.Context, hsUserID uint64) error {
	if s.up == nil {
		return nil
	}
	users, err := s.up.ListUsers(ctx)
	if err != nil {
		return err
	}
	for i := range users {
		if parseUserID(users[i].Id) != hsUserID {
			continue
		}
		now := time.Now().UTC()
		return s.db.Model(&Binding{}).
			Where("hs_user_id = ?", hsUserID).
			Updates(map[string]any{
				"hs_cached_name":  users[i].Name,
				"hs_cached_email": users[i].Email,
				"hs_cached_at":    now,
			}).Error
	}
	return ErrIdentityNotFound
}
