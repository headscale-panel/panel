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
	"headscale-panel/internal/account"
	"headscale-panel/pkg/unifyerror"
	"net/http"

	"gorm.io/gorm"
)

// Accounts is the account domain, wired once at startup.
var Accounts *account.Service

// InitAccountDomain creates the account service and seeds the role and
// permission catalogue.
func InitAccountDomain(db *gorm.DB) error {
	Accounts = account.NewService(db)

	if err := Accounts.BootstrapRoles(); err != nil {
		return err
	}
	return Accounts.ValidateCatalogue()
}

// mapAccountError translates a domain error into the HTTP-facing error type.
//
// The domain deliberately knows nothing about status codes, so the mapping lives
// here, in one place, where it can be reviewed against the API contract.
func mapAccountError(err error) error {
	if err == nil {
		return nil
	}

	switch {
	case errors.Is(err, account.ErrNotFound), errors.Is(err, account.ErrRoleNotFound):
		return unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound, err.Error())
	case errors.Is(err, account.ErrUsernameTaken):
		return unifyerror.New(http.StatusConflict, unifyerror.CodeUserExists, err.Error())
	case errors.Is(err, account.ErrIdentityLinked):
		return unifyerror.New(http.StatusConflict, unifyerror.CodeConflict, err.Error())
	case errors.Is(err, account.ErrLastSystemAdmin), errors.Is(err, account.ErrSystemRoleImmutable):
		return unifyerror.New(http.StatusConflict, unifyerror.CodeConflict, err.Error())
	case errors.Is(err, account.ErrOldPasswordWrong):
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, err.Error())
	case errors.Is(err, account.ErrNoPassword), errors.Is(err, account.ErrDisabled),
		errors.Is(err, account.ErrPrivilegeEscalation):
		return unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, err.Error())
	case errors.Is(err, account.ErrEmailRequired),
		errors.Is(err, account.ErrPermissionUnknown):
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, err.Error())
	}

	var catErr *account.CatalogueError
	if errors.As(err, &catErr) {
		return unifyerror.ServerError(err)
	}
	return unifyerror.DbError(err)
}
