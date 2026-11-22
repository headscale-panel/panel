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

import "errors"

// Domain errors. The transport layer maps these to HTTP shapes; the domain
// itself has no notion of status codes.
var (
	ErrNotFound               = errors.New("account not found")
	ErrUsernameTaken          = errors.New("username already in use")
	ErrEmailRequired          = errors.New("email is required")
	ErrLastSystemAdmin        = errors.New("at least one system administrator must remain")
	ErrSystemRoleImmutable    = errors.New("system administrator role cannot be modified")
	ErrIdentityLinked         = errors.New("identity already linked to another account")
	ErrNoPassword             = errors.New("account has no password credential")
	ErrOldPasswordWrong       = errors.New("current password is incorrect")
	ErrRoleNotFound           = errors.New("role not found")
	ErrPermissionUnknown      = errors.New("permission code is not registered")
	ErrDisabled               = errors.New("account is disabled")
	ErrIdentityNotProvisioned = errors.New("this identity provider account is not permitted to sign in")
	ErrLastCredential         = errors.New("account would be left with no way to sign in")
	ErrRoleInUse              = errors.New("role is still assigned to accounts")
	ErrPrivilegeEscalation    = errors.New("cannot assign or modify a role or account with higher privileges")
)
