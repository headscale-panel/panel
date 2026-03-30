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
