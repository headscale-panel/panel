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

import "testing"

func TestResolveHeadscaleOIDCMode(t *testing.T) {
	tests := []struct {
		name       string
		thirdParty bool
		builtin    bool
		want       string
	}{
		{name: "direct", want: "direct"},
		{name: "builtin", builtin: true, want: "builtin_oidc"},
		{name: "external", thirdParty: true, want: "external_oidc"},
		{name: "hybrid", thirdParty: true, builtin: true, want: "hybrid_oidc"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := resolveHeadscaleOIDCMode(tt.thirdParty, tt.builtin); got != tt.want {
				t.Fatalf("resolveHeadscaleOIDCMode(%v, %v) = %q, want %q", tt.thirdParty, tt.builtin, got, tt.want)
			}
		})
	}
}
