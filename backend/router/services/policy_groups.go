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
	"context"
	"headscale-panel/internal/account"
	"strings"
)

// policyGroupsFromRoles renders panel roles as headscale ACL groups.
//
// The mapping is role name → policy usernames of the accounts holding it. Two
// details matter:
//
//   - The member expression is the identity's ACL alias (email first, see
//     hsapi.User.PolicyUsername), not its display name. headscale resolves a
//     group member through the same function, so a plain name for an OIDC user
//     matches nothing.
//   - The trailing "@" makes headscale treat the entry as a username rather than
//     a tag, which is required because these accounts are human identities.
//
// Accounts with no bound identity are skipped: they have no name in the tailnet
// to refer to.
func policyGroupsFromRoles(ctx context.Context) (map[string][]string, error) {
	if Accounts == nil || Network == nil {
		return nil, nil
	}

	roles, err := Accounts.ListRoles()
	if err != nil {
		return nil, err
	}

	accounts, err := Accounts.List(account.ListFilter{})
	if err != nil {
		return nil, err
	}

	snap, snapErr := identitySnapshot(ctx)
	if snapErr != nil {
		return nil, snapErr
	}

	// Index bound identities by account so one pass over accounts is enough.
	aliasesByAccount := make(map[uint64][]string)
	for i := range snap.Identities {
		ident := &snap.Identities[i]
		if ident.Binding == nil {
			continue
		}
		alias := strings.TrimSpace(ident.PolicyUsername)
		if alias == "" {
			continue
		}
		aliasesByAccount[uint64(ident.Binding.AccountID)] = append(
			aliasesByAccount[uint64(ident.Binding.AccountID)], alias+"@")
	}

	membersByRole := make(map[uint][]string)
	for _, acc := range accounts {
		if !acc.IsActive() {
			continue
		}
		aliases := aliasesByAccount[uint64(acc.ID)]
		if len(aliases) == 0 {
			continue
		}
		membersByRole[acc.RoleID] = append(membersByRole[acc.RoleID], aliases...)
	}

	out := make(map[string][]string, len(roles))
	for _, role := range roles {
		members := membersByRole[role.ID]
		if len(members) == 0 {
			continue
		}
		name := strings.ToLower(strings.TrimSpace(role.Name))
		if name == "" {
			continue
		}
		out["group:"+name] = dedupeStrings(members)
	}
	return out, nil
}

func dedupeStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, v := range values {
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}
