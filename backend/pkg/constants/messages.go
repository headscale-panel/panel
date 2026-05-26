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

package constants

// ---- Validation & Parameter ----
const (
	MsgParamErr          = "Invalid request parameters"
	MsgParamBindFailed   = "Request parameter binding failed"
	MsgParamValidateFailed = "Parameter validation failed"
	MsgCannotBeEmpty     = "cannot be empty"
	MsgValueTooSmall     = "value too small"
	MsgValueTooLarge     = "value too large"
	MsgInvalidEmail      = "must be a valid email address"
	MsgInvalidURL        = "must be a valid URL"
	MsgInvalidFormat     = "invalid format"
	MsgInvalidID         = "Invalid ID"
	MsgInvalidIndex      = "Invalid index"
	MsgMissingInput      = "Required input is missing"
	MsgInvalidQuery      = "Invalid query"
)

// ---- Resource ----
const (
	MsgNotFound    = "Resource not found"
	MsgResNotExist = "The requested resource does not exist"
	MsgConflict    = "Resource conflict"
)

// ---- Server ----
const (
	MsgServerErr   = "An internal server error occurred. Please contact the administrator."
	MsgDBErr       = "A database error occurred. Please contact the administrator."
	MsgGRPCErr     = "Failed to communicate with Headscale service"
	MsgFileResolve = "Failed to process the uploaded file"
)

// ---- Auth ----
const (
	MsgUnauth        = "Authentication required"
	MsgLoginFailed   = "Invalid username or password"
	MsgTokenExpired  = "Your session has expired, please log in again"
	MsgInvalidToken  = "Invalid or malformed token"
	MsgUserNotActive = "Your account is not active"
	MsgUserExists    = "Username already exists"
	MsgForbidden     = "Insufficient permissions"
)

// ---- ACL ----
const (
	MsgACLPolicyEmpty           = "ACL policy cannot be empty"
	MsgACLPolicyInvalidJSON     = "ACL policy is not valid JSON or HuJSON"
	MsgACLPolicySerializeFailed = "ACL policy serialization failed"
	MsgACLPolicyFormatInvalid   = "ACL policy format is invalid, check that destinations include a port, e.g. group:admin:*"
	MsgACLMustBeArray           = "`acls` must be an array"
	MsgACLRuleFormatInvalid     = "ACL rule #%d format is invalid"
	MsgACLRuleEmptySource       = "ACL rule #%d contains empty source identifier"
	MsgACLRuleSrcMustBeStrArray = "ACL rule #%d `src` must be a string array"
	MsgACLRuleSrcMustBeStrings  = "ACL rule #%d `src` values must all be strings"
	MsgACLRuleDstMustBeStrArray = "ACL rule #%d `dst` must be a string array"
	MsgACLRuleDstMustBeStrings  = "ACL rule #%d `dst` values must all be strings"
	MsgACLRuleDstFormatInvalid  = "ACL rule #%d destination %q format is invalid"
	MsgACLDestinationEmpty      = "Destination cannot be empty"
	MsgACLRuleIndexOutOfRange   = "Rule index out of range"
)

// ---- Config ----
const (
	MsgConfigReadFailed      = "Failed to read config file"
	MsgYAMLParseFailed       = "YAML parsing failed"
	MsgYAMLSerializeFailed   = "YAML serialization failed"
	MsgConfigDirCreateFailed = "Failed to create config directory"
	MsgConfigWriteFailed     = "Failed to write config file"
	MsgGRPCAddrEmpty         = "gRPC address cannot be empty"
	MsgAPIKeyEmpty           = "API Key cannot be empty"
	MsgBaseURLRequired       = "Please configure BASE_URL in environment variables first"
)

// ---- Node & Machine ----
const (
	MsgRegisterNodeFailed   = "Failed to register node: %v"
	MsgHeadscaleReturnedNil = "Failed to register node: Headscale returned empty node"
)

// ---- Group ----
const (
	MsgGroupHasUsers = "Cannot delete group: group has existing users"
)

// ---- Success Messages ----
const (
	MsgConnectionSettingsSaved = "Connection settings saved"
	MsgDataSyncCompleted       = "Data sync completed"
	MsgOIDCSettingsSaved       = "OIDC settings saved"
	MsgConfigSaved             = "Config saved"
	MsgSyncSuccessful          = "Sync successful"
	MsgImportSuccessful        = "Import successful"
)

// ---- Log Messages ----
const (
	LogConfigPathFailed = "Failed to get config file path, using default config"
)
