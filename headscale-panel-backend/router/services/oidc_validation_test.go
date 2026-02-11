package services

import "testing"

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
