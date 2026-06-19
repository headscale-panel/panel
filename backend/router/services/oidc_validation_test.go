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
	"crypto/sha256"
	"encoding/base64"
	"headscale-panel/model"
	"testing"
)

func TestPKCES256(t *testing.T) {
	verifier := "0123456789abcdefghijklmnopqrstuvwxyzABCDEFG"
	digest := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(digest[:])

	if err := ValidatePKCEChallenge(challenge, "S256"); err != nil {
		t.Fatalf("valid challenge rejected: %v", err)
	}
	if !verifyPKCE(challenge, "S256", verifier) {
		t.Fatal("valid verifier rejected")
	}
	if verifyPKCE(challenge, "S256", verifier+"wrong") {
		t.Fatal("wrong verifier accepted")
	}
	if err := ValidatePKCEChallenge(challenge, "plain"); err == nil {
		t.Fatal("plain PKCE must be rejected")
	}
}

func TestTokenAudienceContains(t *testing.T) {
	if !tokenAudienceContains("headscale-builtin", "headscale-builtin") {
		t.Fatal("string audience should match")
	}
	if !tokenAudienceContains([]any{"other", "headscale-builtin"}, "headscale-builtin") {
		t.Fatal("array audience should match")
	}
	if tokenAudienceContains("other", "headscale-builtin") {
		t.Fatal("wrong audience accepted")
	}
}

func TestOIDCUserGroups(t *testing.T) {
	groups := oidcUserGroups(model.User{Group: model.Group{Name: "operators"}})
	if len(groups) != 1 || groups[0] != "operators" {
		t.Fatalf("groups = %#v, want [operators]", groups)
	}
}

func TestNormalizeRedirectURIs(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{
			name:    "valid and deduplicated",
			input:   "https://b.example.com/cb, https://a.example.com/cb,https://a.example.com/cb",
			want:    "https://a.example.com/cb,https://b.example.com/cb",
			wantErr: false,
		},
		{
			name:    "wildcard rejected",
			input:   "*",
			wantErr: true,
		},
		{
			name:    "empty rejected",
			input:   "",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeRedirectURIs(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}

			if err != nil {
				t.Fatalf("expected nil error, got %v", err)
			}
			if got != tt.want {
				t.Fatalf("unexpected normalized redirect uris: got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestValidateRedirectURI(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{name: "valid https", input: "https://example.com/callback", wantErr: false},
		{name: "valid custom scheme", input: "myapp://callback", wantErr: false},
		{name: "reject wildcard", input: "https://*.example.com/callback", wantErr: true},
		{name: "reject relative", input: "/callback", wantErr: true},
		{name: "reject fragment", input: "https://example.com/callback#frag", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := validateRedirectURI(tt.input)
			if tt.wantErr && err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("expected nil error, got %v", err)
			}
		})
	}
}

func TestIsSafeOIDCClient(t *testing.T) {
	tests := []struct {
		name   string
		client model.OauthClient
		want   bool
	}{
		{
			name: "hash secret with valid redirect",
			client: model.OauthClient{
				ClientSecretHash: "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
				RedirectURIs:     "https://example.com/callback",
			},
			want: true,
		},
		{
			name: "legacy insecure secret rejected",
			client: model.OauthClient{
				ClientSecret: "headscale-secret",
				RedirectURIs: "https://example.com/callback",
			},
			want: false,
		},
		{
			name: "missing secret rejected",
			client: model.OauthClient{
				RedirectURIs: "https://example.com/callback",
			},
			want: false,
		},
		{
			name: "invalid redirect rejected",
			client: model.OauthClient{
				ClientSecretHash: "hashed",
				RedirectURIs:     "https://*.example.com/callback",
			},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isSafeOIDCClient(tt.client)
			if got != tt.want {
				t.Fatalf("unexpected safe result: got %v, want %v", got, tt.want)
			}
		})
	}
}
