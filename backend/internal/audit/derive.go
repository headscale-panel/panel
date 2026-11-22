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

package audit

import (
	"strings"
)

// Action values. Anything not matched by DeriveAction falls back to the HTTP
// method lowercased, which keeps the column useful without inventing a
// taxonomy nobody consults.
const (
	ActionCreate  = "create"
	ActionUpdate  = "update"
	ActionDelete  = "delete"
	ActionVerify  = "verify"
	ActionApply   = "apply"
	ActionEnable  = "enable"
	ActionDisable = "disable"
	ActionSync    = "sync"
	ActionLogin   = "login"
	ActionLogout  = "logout"
)

// DeriveAction infers the semantic action from the request.
//
// Path shape wins over the method because the panel expresses verbs in the path
// (/expire, /apply, /sync) and uses a single method for several meanings.
func DeriveAction(method, path string) string {
	segments := strings.Split(strings.Trim(strings.ToLower(path), "/"), "/")
	last := ""
	if len(segments) > 0 {
		last = segments[len(segments)-1]
	}

	switch last {
	case "verify", "check":
		return ActionVerify
	case "apply":
		return ActionApply
	case "enable", "start", "approve":
		return ActionEnable
	case "disable", "expire", "stop", "reject":
		return ActionDisable
	case "sync", "import", "reconcile":
		return ActionSync
	case "login":
		return ActionLogin
	case "logout":
		return ActionLogout
	}

	switch strings.ToUpper(method) {
	case "POST":
		return ActionCreate
	case "PUT", "PATCH":
		return ActionUpdate
	case "DELETE":
		return ActionDelete
	}
	return strings.ToLower(method)
}

// DeriveResource flattens a path into "domain.action" form so the audit log can
// be filtered by area without storing yet another enumeration.
//
// The API prefix is stripped, then the first three non-variable segments are
// joined. Segments that look like identifiers are dropped so
// /accounts/42/bind becomes accounts.bind rather than accounts.42.bind.
func DeriveResource(path string) string {
	trimmed := strings.Trim(path, "/")
	trimmed = strings.TrimPrefix(trimmed, "panel/api/v1/")
	trimmed = strings.TrimPrefix(trimmed, "api/v1/")

	var kept []string
	for _, seg := range strings.Split(trimmed, "/") {
		if seg == "" || isIdentifierSegment(seg) {
			continue
		}
		kept = append(kept, strings.ToLower(seg))
		if len(kept) == 3 {
			break
		}
	}
	return strings.Join(kept, ".")
}

// isIdentifierSegment reports whether a path segment is a value rather than a
// resource name.
func isIdentifierSegment(seg string) bool {
	if seg == "" {
		return false
	}
	if seg[0] >= '0' && seg[0] <= '9' {
		return true
	}
	// Gin variables never appear in the recorded path, but a caller may pass the
	// raw route pattern; treat brace/colon prefixes as variables.
	return seg[0] == ':' || seg[0] == '{'
}
