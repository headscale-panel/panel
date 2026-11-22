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
	"strings"
	"time"

	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/utils/password"

	"gorm.io/gorm"
)

// Service owns every write to the account tables.
type Service struct {
	db *gorm.DB
}

// NewService builds a service over an open database.
func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

// CreateInput is the domain-level creation payload.
type CreateInput struct {
	Username    string
	DisplayName string
	Email       string
	Password    string
	RoleID      uint
}

// Create adds an account. The username is unique; a duplicate is reported as
// ErrUsernameTaken rather than as a driver error so callers can react.
func (s *Service) Create(in CreateInput) (*Account, error) {
	username := strings.TrimSpace(in.Username)
	if username == "" {
		return nil, errors.New("username is required")
	}

	var existing int64
	if err := s.db.Model(&Account{}).Where("username = ?", username).Count(&existing).Error; err != nil {
		return nil, err
	}
	if existing > 0 {
		return nil, ErrUsernameTaken
	}

	hash := ""
	if in.Password != "" {
		var err error
		hash, err = password.Encrypt(in.Password)
		if err != nil {
			return nil, err
		}
	}

	acc := &Account{
		Username:     username,
		DisplayName:  strings.TrimSpace(in.DisplayName),
		Email:        strings.TrimSpace(in.Email),
		Status:       StatusActive,
		PasswordHash: hash,
		RoleID:       in.RoleID,
	}
	if err := s.db.Create(acc).Error; err != nil {
		return nil, err
	}
	acc.decorate()
	return acc, nil
}

// UpdateInput carries the mutable fields; nil means "leave unchanged".
type UpdateInput struct {
	DisplayName *string
	Email       *string
	RoleID      *uint
}

// Update applies the provided fields.
func (s *Service) Update(id uint, in UpdateInput) (*Account, error) {
	acc, err := s.Get(id)
	if err != nil {
		return nil, err
	}

	updates := map[string]any{}
	if in.DisplayName != nil {
		updates["display_name"] = strings.TrimSpace(*in.DisplayName)
	}
	if in.Email != nil {
		updates["email"] = strings.TrimSpace(*in.Email)
	}
	if in.RoleID != nil {
		if *in.RoleID != acc.RoleID {
			// Moving the last administrator out of the admin role would leave
			// nobody able to grant it back.
			if err := s.guardLastSystemAdmin(acc); err != nil {
				return nil, err
			}
			updates["role_id"] = *in.RoleID
			updates["session_version"] = gorm.Expr("session_version + 1")
		}
	}

	if len(updates) == 0 {
		return acc, nil
	}
	if err := s.db.Model(&Account{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.Get(id)
}

// Get loads one account with its role and permissions.
func (s *Service) Get(id uint) (*Account, error) {
	var acc Account
	err := s.db.Preload("Role.Permissions").First(&acc, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	acc.decorate()
	return &acc, nil
}

// GetByUsername loads one account by its unique username.
func (s *Service) GetByUsername(username string) (*Account, error) {
	var acc Account
	err := s.db.Preload("Role.Permissions").Where("username = ?", username).First(&acc).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	acc.decorate()
	return &acc, nil
}

// List returns accounts filtered by the provided criteria.
type ListFilter struct {
	Status *Status
	RoleID *uint
	Query  string
}

// List returns matching accounts with their roles.
func (s *Service) List(f ListFilter) ([]Account, error) {
	q := s.db.Preload("Role")
	if f.Status != nil {
		q = q.Where("status = ?", *f.Status)
	}
	if f.RoleID != nil {
		q = q.Where("role_id = ?", *f.RoleID)
	}
	if f.Query != "" {
		like := "%" + strings.TrimSpace(f.Query) + "%"
		q = q.Where("username LIKE ? OR email LIKE ? OR display_name LIKE ?", like, like, like)
	}

	var out []Account
	if err := q.Order("id").Find(&out).Error; err != nil {
		return nil, err
	}
	decorateAll(out)
	return out, nil
}

// SetStatus enables or disables an account. Disabling also rotates the session
// version so already-issued tokens stop working immediately.
func (s *Service) SetStatus(id uint, status Status) (*Account, error) {
	if !status.Valid() {
		return nil, errors.New("unknown account status")
	}
	acc, err := s.Get(id)
	if err != nil {
		return nil, err
	}

	if status == StatusDisabled {
		if err := s.guardLastSystemAdmin(acc); err != nil {
			return nil, err
		}
	}

	updates := map[string]any{"status": status}
	if status == StatusDisabled {
		updates["session_version"] = gorm.Expr("session_version + 1")
	}
	if err := s.db.Model(&Account{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.Get(id)
}

// Delete removes an account. Bindings owned by the network domain are left in
// place on purpose: they become orphans that an operator resolves explicitly,
// rather than disappearing alongside the account.
func (s *Service) Delete(id uint) error {
	acc, err := s.Get(id)
	if err != nil {
		return err
	}
	if err := s.guardLastSystemAdmin(acc); err != nil {
		return err
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("account_id = ?", id).Delete(&Identity{}).Error; err != nil {
			return err
		}
		return tx.Delete(&Account{}, id).Error
	})
}

// SetPassword replaces the password credential and invalidates live sessions.
func (s *Service) SetPassword(id uint, newPassword string) error {
	if strings.TrimSpace(newPassword) == "" {
		return errors.New("password is required")
	}
	hash, err := password.Encrypt(newPassword)
	if err != nil {
		return err
	}
	return s.db.Model(&Account{}).Where("id = ?", id).Updates(map[string]any{
		"password_hash":        hash,
		"must_change_password": false,
		"session_version":      gorm.Expr("session_version + 1"),
	}).Error
}

// ChangePassword verifies the current password before replacing it. It is the
// self-service path; administratively resetting a password uses SetPassword.
func (s *Service) ChangePassword(id uint, current, next string) error {
	acc, err := s.Get(id)
	if err != nil {
		return err
	}
	if !acc.CanSignInWithPassword() {
		return ErrNoPassword
	}
	if !password.Compare(acc.PasswordHash, current) {
		return ErrOldPasswordWrong
	}
	return s.SetPassword(id, next)
}

// VerifyPassword checks a credential against the stored hash.
func (s *Service) VerifyPassword(acc *Account, candidate string) bool {
	return acc != nil && acc.CanSignInWithPassword() && password.Compare(acc.PasswordHash, candidate)
}

// guardLastSystemAdmin refuses an operation that would leave no enabled system
// administrator.
func (s *Service) guardLastSystemAdmin(acc *Account) error {
	if acc == nil || acc.Role.ID == 0 {
		// Role not preloaded; resolve it lazily.
		loaded, err := s.Get(acc.ID)
		if err != nil {
			return err
		}
		acc = loaded
	}
	if !acc.Role.IsSystemAdmin {
		return nil
	}

	var remaining int64
	err := s.db.Model(&Account{}).
		Joins("JOIN roles ON roles.id = accounts.role_id").
		Where("roles.is_system_admin = ? AND accounts.status = ? AND accounts.id <> ?", true, StatusActive, acc.ID).
		Count(&remaining).Error
	if err != nil {
		return err
	}
	if remaining == 0 {
		return ErrLastSystemAdmin
	}
	return nil
}

// BootstrapRoles creates the built-in roles and the permission catalogue,
// keeping existing rows intact. Safe to run on every start.
func (s *Service) BootstrapRoles() error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		perms := make([]Permission, 0, len(constants.DefaultPermissions))
		for _, def := range constants.DefaultPermissions {
			p := Permission{Code: def.Code, Name: def.Name, Type: def.Type}
			if err := tx.Where(Permission{Code: def.Code}).
				Attrs(Permission{Name: def.Name, Type: def.Type}).
				FirstOrCreate(&p).Error; err != nil {
				return err
			}
			perms = append(perms, p)
		}

		admin := Role{Name: constants.SystemAdminRoleName}
		if err := tx.Where(Role{Name: constants.SystemAdminRoleName}).
			Attrs(Role{Description: "Full access to every panel feature", IsSystemAdmin: true}).
			FirstOrCreate(&admin).Error; err != nil {
			return err
		}

		if _, err := newMemberRole(tx); err != nil {
			return err
		}
		return nil
	})
}

// newMemberRole creates the fallback role and grants dashboard access, which is
// the minimum an account needs to land on a usable page after signing in.
func newMemberRole(tx *gorm.DB) (*Role, error) {
	member := Role{Name: constants.MemberRoleName}
	if err := tx.Where(Role{Name: constants.MemberRoleName}).
		Attrs(Role{Description: "Read-only access to the dashboard", IsSystemAdmin: false}).
		FirstOrCreate(&member).Error; err != nil {
		return nil, err
	}

	var perm Permission
	if err := tx.Where(Permission{Code: constants.PermDashboardView}).First(&perm).Error; err != nil {
		return nil, err
	}
	link := RolePermission{RoleID: member.ID, PermissionID: perm.ID}
	if err := tx.Where(link).FirstOrCreate(&link).Error; err != nil {
		return nil, err
	}
	return &member, nil
}

// ListRoles returns every role with its permission set.
func (s *Service) ListRoles() ([]Role, error) {
	var out []Role
	if err := s.db.Preload("Permissions").Order("id").Find(&out).Error; err != nil {
		return nil, err
	}
	return out, nil
}

// GetRole returns one role with its permission set.
func (s *Service) GetRole(id uint) (*Role, error) {
	var role Role
	err := s.db.Preload("Permissions").First(&role, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrRoleNotFound
	}
	if err != nil {
		return nil, err
	}
	return &role, nil
}

// ValidateCatalogue checks that the permissions table matches the compiled
// catalogue in both directions.
//
// A missing row means a route guards on a code nobody can be granted; an extra
// row means a code was deleted from the codebase but is still referenced by
// roles. Both are configuration bugs that should stop the process, not surface
// as mysterious 403s.
func (s *Service) ValidateCatalogue() error {
	var rows []Permission
	if err := s.db.Find(&rows).Error; err != nil {
		return err
	}

	inDB := make(map[string]struct{}, len(rows))
	for _, r := range rows {
		inDB[r.Code] = struct{}{}
	}

	var missing []string
	for code := range constants.PermissionCodes() {
		if _, ok := inDB[code]; !ok {
			missing = append(missing, code)
		}
	}
	if len(missing) > 0 {
		return &CatalogueError{Missing: missing}
	}

	var extra []string
	want := constants.PermissionCodes()
	for _, r := range rows {
		if _, ok := want[r.Code]; !ok {
			extra = append(extra, r.Code)
		}
	}
	if len(extra) > 0 {
		return &CatalogueError{Extra: extra}
	}
	return nil
}

// CatalogueError lists permission codes that exist on only one side.
type CatalogueError struct {
	Missing []string
	Extra   []string
}

func (e *CatalogueError) Error() string {
	if len(e.Missing) > 0 {
		return "permission catalogue is missing codes: " + strings.Join(e.Missing, ", ")
	}
	return "permission table has unregistered codes: " + strings.Join(e.Extra, ", ")
}

// HasPermission reports whether the account may perform code.
//
// A system administrator short-circuits; everyone else is checked against their
// role's permission set. Holding the non-:self form of a code implies the :self
// form, so a role that can manage every device can also manage its own.
func (s *Service) HasPermission(acc *Account, code string) bool {
	if acc == nil {
		return false
	}
	if acc.Role.IsSystemAdmin {
		return true
	}
	if !acc.IsActive() {
		return false
	}

	granted := make(map[string]struct{}, len(acc.Role.Permissions))
	for _, p := range acc.Role.Permissions {
		granted[p.Code] = struct{}{}
	}
	if _, ok := granted[code]; ok {
		return true
	}
	if base, ok := strings.CutSuffix(code, ":self"); ok {
		_, hasBase := granted[base]
		return hasBase
	}
	return false
}

// PermissionCodes returns the account's effective permission set, with the
// wildcard expanded so the frontend does not need to special-case admins.
func (s *Service) PermissionCodes(acc *Account) []string {
	if acc == nil {
		return nil
	}
	if acc.Role.IsSystemAdmin {
		return []string{constants.PermWildcard}
	}

	codes := make([]string, 0, len(acc.Role.Permissions))
	for _, p := range acc.Role.Permissions {
		codes = append(codes, p.Code)
	}
	return codes
}

// SetGuideTourSeen stamps or clears the onboarding tour marker. A zero time
// clears it, which is how "replay the tour" is expressed.
func (s *Service) SetGuideTourSeen(id uint, at time.Time) error {
	var value any
	if !at.IsZero() {
		value = at
	}
	return s.db.Model(&Account{}).Where("id = ?", id).Update("guide_tour_seen_at", value).Error
}

// SetTOTPSecret stores a pending or confirmed authenticator secret.
func (s *Service) SetTOTPSecret(id uint, secret string, enabled bool) error {
	return s.db.Model(&Account{}).Where("id = ?", id).Updates(map[string]any{
		"totp_secret":  secret,
		"totp_enabled": enabled,
	}).Error
}

// IncrementSessionVersion invalidates all currently issued JWTs for the account.
func (s *Service) IncrementSessionVersion(id uint) error {
	return s.db.Model(&Account{}).Where("id = ?", id).
		Update("session_version", gorm.Expr("session_version + 1")).Error
}

// AuthorizeAccountCreate verifies that actorID is allowed to create an account
// with targetRoleID. Non-system-admins cannot assign the system administrator
// role or any role containing permissions they do not hold themselves.
func (s *Service) AuthorizeAccountCreate(actorID, targetRoleID uint) error {
	actor, err := s.Get(actorID)
	if err != nil {
		return err
	}
	if actor.Role.IsSystemAdmin {
		return nil
	}
	targetRole, err := s.GetRole(targetRoleID)
	if err != nil {
		return err
	}
	return s.ensureActorDominatesRole(actor, targetRole)
}

// AuthorizeAccountManage verifies that actorID is allowed to mutate targetID
// (e.g. status change, password reset, delete, unlink SSO). Non-system-admins
// cannot mutate system administrator accounts.
func (s *Service) AuthorizeAccountManage(actorID, targetID uint) error {
	actor, err := s.Get(actorID)
	if err != nil {
		return err
	}
	if actor.Role.IsSystemAdmin {
		return nil
	}
	target, err := s.Get(targetID)
	if err != nil {
		return err
	}
	if target.Role.IsSystemAdmin {
		return ErrPrivilegeEscalation
	}
	return nil
}

// AuthorizeAccountUpdate verifies that actorID may update targetID and, if
// newRoleID is non-nil, reassign it to *newRoleID. Non-system-admins cannot
// modify system administrators, change their own role, or assign roles with
// higher privileges than their own.
func (s *Service) AuthorizeAccountUpdate(actorID, targetID uint, newRoleID *uint) error {
	actor, err := s.Get(actorID)
	if err != nil {
		return err
	}
	if actor.Role.IsSystemAdmin {
		return nil
	}
	target, err := s.Get(targetID)
	if err != nil {
		return err
	}
	if target.Role.IsSystemAdmin {
		return ErrPrivilegeEscalation
	}
	if newRoleID != nil && *newRoleID != target.RoleID {
		if actor.ID == target.ID {
			return ErrPrivilegeEscalation
		}
		targetRole, roleErr := s.GetRole(*newRoleID)
		if roleErr != nil {
			return roleErr
		}
		if err := s.ensureActorDominatesRole(actor, targetRole); err != nil {
			return err
		}
	}
	return nil
}

// AuthorizeRoleMutation verifies that actorID may create, update, or delete a
// role with the requested permissionIDs. Non-system-admins cannot modify their
// own role, modify/delete a role holding permissions they lack, or grant
// permissions they do not hold themselves.
func (s *Service) AuthorizeRoleMutation(actorID, targetRoleID uint, permissionIDs []uint) error {
	actor, err := s.Get(actorID)
	if err != nil {
		return err
	}
	if actor.Role.IsSystemAdmin {
		return nil
	}
	if targetRoleID != 0 {
		if actor.RoleID == targetRoleID {
			return ErrPrivilegeEscalation
		}
		existing, roleErr := s.GetRole(targetRoleID)
		if roleErr != nil {
			return roleErr
		}
		if err := s.ensureActorDominatesRole(actor, existing); err != nil {
			return err
		}
	}
	if len(permissionIDs) > 0 {
		perms, permErr := s.permissionsByID(permissionIDs)
		if permErr != nil {
			return permErr
		}
		for _, p := range perms {
			if !s.HasPermission(actor, p.Code) {
				return ErrPrivilegeEscalation
			}
		}
	}
	return nil
}

func (s *Service) ensureActorDominatesRole(actor *Account, role *Role) error {
	if role.IsSystemAdmin {
		return ErrPrivilegeEscalation
	}
	for _, p := range role.Permissions {
		if !s.HasPermission(actor, p.Code) {
			return ErrPrivilegeEscalation
		}
	}
	return nil
}
