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

package unifyerror

import (
	"errors"
	"net/http"

	"headscale-panel/pkg/constants"

	"gorm.io/gorm"
)

// Application error codes.
// 11xx – base / generic
// 12xx – service-level (business logic)
// 13xx – server-side (DB, network, internal)
// 14xx – auth / identity
const (
	// ---- 11xx base ----
	CodeParamErr    = 1100
	CodeNotFound    = 1101
	CodeResNotExist = 1102
	CodeConflict    = 1103

	// ---- 12xx service ----
	CodeMissingInput      = 1200
	CodeFileResolveFailed = 1201
	CodeInvalidQuery      = 1202

	// ---- 13xx server ----
	CodeServerErr = 1300
	CodeDBErr     = 1301
	CodeGRPCErr   = 1302

	// ---- 14xx auth ----
	CodeUnauth        = 1400
	CodeLoginFailed   = 1401
	CodeTokenExpired  = 1402
	CodeInvalidToken  = 1403
	CodeUserNotActive = 1404
	CodeUserExists    = 1405
	CodeForbidden     = 1406
)

// ---- 11xx base ----

// WrongParam returns a 400 Bad Request error with optional field names.
func WrongParam(fields ...string) *UniErr {
	msg := constants.MsgParamErr
	if len(fields) > 0 {
		msg = constants.MsgParamErr + " [" + joinFields(fields) + "]"
	}
	return newUniErr(ErrTypeUser, http.StatusBadRequest, CodeParamErr, msg)
}

// NotFound returns a 404 Not Found error.
func NotFound() *UniErr {
	return newUniErr(ErrTypeHttp, http.StatusNotFound, CodeNotFound, constants.MsgNotFound)
}

// ResNotExist returns a 200 OK with a "resource not exist" code (used for
// business-level not-found responses where HTTP 200 is expected).
func ResNotExist() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusOK, CodeResNotExist, constants.MsgResNotExist)
}

// Conflict returns a 409 Conflict error.
func Conflict(msg string) *UniErr {
	if msg == "" {
		msg = constants.MsgConflict
	}
	return newUniErr(ErrTypeUser, http.StatusConflict, CodeConflict, msg)
}

// ---- 12xx service ----

// MissingInput returns a user-facing error for missing required input.
func MissingInput() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusOK, CodeMissingInput, constants.MsgMissingInput)
}

// FileResolveFailed returns a user-facing error when file processing fails.
func FileResolveFailed(err error, extra ...string) *UniErr {
	msg := constants.MsgFileResolve
	if len(extra) > 0 {
		msg = constants.MsgFileResolve + " [" + joinFields(extra) + "]"
	}
	return newUniErrWithServer(ErrTypeUser, http.StatusOK, CodeFileResolveFailed, msg, err.Error())
}

// InvalidQuery returns a user-facing error for an invalid query.
func InvalidQuery() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusOK, CodeInvalidQuery, constants.MsgInvalidQuery)
}

// ---- 13xx server ----

// ServerError wraps a Go error as a 500 Internal Server Error.
func ServerError(err error) *UniErr {
	return newUniErrWithServer(ErrTypeServer, http.StatusInternalServerError, CodeServerErr, constants.MsgServerErr, err.Error())
}

// DbError wraps a database error. If the error is a "record not found" it is
// converted to a ResNotExist instead.
func DbError(err error) *UniErr {
	if err != nil && errors.Is(err, gorm.ErrRecordNotFound) {
		return ResNotExist()
	}
	return newUniErrWithServer(ErrTypeDb, http.StatusInternalServerError, CodeDBErr, constants.MsgDBErr, err.Error())
}

// GRPCError wraps a gRPC call error.
func GRPCError(err error) *UniErr {
	return newUniErrWithServer(ErrTypeGRPC, http.StatusOK, CodeGRPCErr, constants.MsgGRPCErr, err.Error())
}

// ---- 14xx auth ----

// UnAuth returns a 401 Unauthorized error.
func UnAuth() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusUnauthorized, CodeUnauth, constants.MsgUnauth)
}

// Forbidden returns a 403 Forbidden error.
func Forbidden() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusForbidden, CodeForbidden, constants.MsgForbidden)
}

// LoginFailed returns a login failure error (200 OK with error code).
func LoginFailed() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusOK, CodeLoginFailed, constants.MsgLoginFailed)
}

// TokenExpired returns a 401 with token-expired code.
func TokenExpired() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusUnauthorized, CodeTokenExpired, constants.MsgTokenExpired)
}

// InvalidToken returns a 401 with invalid-token code.
func InvalidToken() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusUnauthorized, CodeInvalidToken, constants.MsgInvalidToken)
}

// UserNotActive returns a user-not-active error.
func UserNotActive() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusOK, CodeUserNotActive, constants.MsgUserNotActive)
}

// UserExists returns a conflict error for duplicate usernames.
func UserExists() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusConflict, CodeUserExists, constants.MsgUserExists)
}

// ---- helpers ----

func joinFields(fields []string) string {
	result := ""
	for i, f := range fields {
		if i > 0 {
			result += ", "
		}
		result += f
	}
	return result
}
