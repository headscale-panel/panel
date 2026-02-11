package services

import (
	"headscale-panel/model"
	"testing"
)

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
