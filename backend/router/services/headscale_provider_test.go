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

func TestNormalizeHeadscaleProvider(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want string
	}{
		{name: "empty becomes headscale", raw: "", want: "headscale"},
		{name: "oidc preserved", raw: "oidc", want: "oidc"},
		{name: "local preserved", raw: "local", want: "local"},
		{name: "headscale preserved", raw: "headscale", want: "headscale"},
		{name: "trim and lower", raw: "  OIDC  ", want: "oidc"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizeHeadscaleProvider(tt.raw); got != tt.want {
				t.Fatalf("normalizeHeadscaleProvider(%q) = %q, want %q", tt.raw, got, tt.want)
			}
		})
	}
}
