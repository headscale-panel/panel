package unifyerror

import "net/http"

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

// User-facing messages.
const (
	msgParamErr      = "Invalid request parameters"
	msgNotFound      = "Resource not found"
	msgResNotExist   = "The requested resource does not exist"
	msgConflict      = "Resource conflict"
	msgMissingInput  = "Required input is missing"
	msgFileResolve   = "Failed to process the uploaded file"
	msgInvalidQuery  = "Invalid query"
	msgServerErr     = "An internal server error occurred. Please contact the administrator."
	msgDBErr         = "A database error occurred. Please contact the administrator."
	msgGRPCErr       = "Failed to communicate with Headscale service"
	msgUnauth        = "Authentication required"
	msgLoginFailed   = "Invalid username or password"
	msgTokenExpired  = "Your session has expired, please log in again"
	msgInvalidToken  = "Invalid or malformed token"
	msgUserNotActive = "Your account is not active"
	msgUserExists    = "Username already exists"
	msgForbidden     = "Insufficient permissions"
)

// ---- 11xx base ----

// WrongParam returns a 400 Bad Request error with optional field names.
func WrongParam(fields ...string) *UniErr {
	msg := msgParamErr
	if len(fields) > 0 {
		msg = msgParamErr + " [" + joinFields(fields) + "]"
	}
	return newUniErr(ErrTypeUser, http.StatusBadRequest, CodeParamErr, msg)
}

// NotFound returns a 404 Not Found error.
func NotFound() *UniErr {
	return newUniErr(ErrTypeHttp, http.StatusNotFound, CodeNotFound, msgNotFound)
}

// ResNotExist returns a 200 OK with a "resource not exist" code (used for
// business-level not-found responses where HTTP 200 is expected).
func ResNotExist() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusOK, CodeResNotExist, msgResNotExist)
}

// Conflict returns a 409 Conflict error.
func Conflict(msg string) *UniErr {
	if msg == "" {
		msg = msgConflict
	}
	return newUniErr(ErrTypeUser, http.StatusConflict, CodeConflict, msg)
}

// ---- 12xx service ----

// MissingInput returns a user-facing error for missing required input.
func MissingInput() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusOK, CodeMissingInput, msgMissingInput)
}

// FileResolveFailed returns a user-facing error when file processing fails.
func FileResolveFailed(err error, extra ...string) *UniErr {
	msg := msgFileResolve
	if len(extra) > 0 {
		msg = msgFileResolve + " [" + joinFields(extra) + "]"
	}
	return newUniErrWithServer(ErrTypeUser, http.StatusOK, CodeFileResolveFailed, msg, err.Error())
}

// InvalidQuery returns a user-facing error for an invalid query.
func InvalidQuery() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusOK, CodeInvalidQuery, msgInvalidQuery)
}

// ---- 13xx server ----

// ServerError wraps a Go error as a 500 Internal Server Error.
func ServerError(err error) *UniErr {
	return newUniErrWithServer(ErrTypeServer, http.StatusInternalServerError, CodeServerErr, msgServerErr, err.Error())
}

// DbError wraps a database error. If the error is a "record not found" it is
// converted to a ResNotExist instead.
func DbError(err error) *UniErr {
	if err != nil && err.Error() == "record not found" {
		return ResNotExist()
	}
	return newUniErrWithServer(ErrTypeDb, http.StatusInternalServerError, CodeDBErr, msgDBErr, err.Error())
}

// GRPCError wraps a gRPC call error.
func GRPCError(err error) *UniErr {
	return newUniErrWithServer(ErrTypeGRPC, http.StatusBadGateway, CodeGRPCErr, msgGRPCErr, err.Error())
}

// ---- 14xx auth ----

// UnAuth returns a 401 Unauthorized error.
func UnAuth() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusUnauthorized, CodeUnauth, msgUnauth)
}

// Forbidden returns a 403 Forbidden error.
func Forbidden() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusForbidden, CodeForbidden, msgForbidden)
}

// LoginFailed returns a login failure error (200 OK with error code).
func LoginFailed() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusOK, CodeLoginFailed, msgLoginFailed)
}

// TokenExpired returns a 401 with token-expired code.
func TokenExpired() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusUnauthorized, CodeTokenExpired, msgTokenExpired)
}

// InvalidToken returns a 401 with invalid-token code.
func InvalidToken() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusUnauthorized, CodeInvalidToken, msgInvalidToken)
}

// UserNotActive returns a user-not-active error.
func UserNotActive() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusOK, CodeUserNotActive, msgUserNotActive)
}

// UserExists returns a conflict error for duplicate usernames.
func UserExists() *UniErr {
	return newUniErr(ErrTypeUser, http.StatusConflict, CodeUserExists, msgUserExists)
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
