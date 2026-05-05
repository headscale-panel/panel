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

package conf

import "testing"

func TestValidateSecurityConfig(t *testing.T) {
	tests := []struct {
		name    string
		secret  string
		wantErr bool
	}{
		{name: "empty secret is auto-generated", secret: "", wantErr: false},
		{name: "default insecure secret", secret: "headscale-panel-secret", wantErr: true},
		{name: "placeholder insecure secret", secret: "your-secret-key", wantErr: true},
		{name: "too short secret", secret: "1234567890abcdef", wantErr: true},
		{name: "valid secret", secret: "1234567890abcdef1234567890abcdef", wantErr: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := Config{
				JWT: JWTConfig{
					Secret: tt.secret,
				},
			}
			err := validateSecurityConfig(cfg)
			if tt.wantErr && err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("expected nil error, got %v", err)
			}
		})
	}
}
