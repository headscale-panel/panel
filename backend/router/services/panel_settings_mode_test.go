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
