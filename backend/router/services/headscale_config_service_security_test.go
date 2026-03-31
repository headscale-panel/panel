package services

import "testing"

func TestIsOIDCAutoLinkAllowed(t *testing.T) {
	cfg := &HeadscaleConfigFile{
		OIDC: OIDCConfig{
			AllowedUsers:   []string{"alice@example.com"},
			AllowedDomains: []string{"trusted.com"},
		},
	}

	if !HeadscaleConfigService.IsOIDCAutoLinkAllowed(cfg, "alice@example.com") {
		t.Fatalf("expected allowed user email to pass")
	}
	if !HeadscaleConfigService.IsOIDCAutoLinkAllowed(cfg, "bob@trusted.com") {
		t.Fatalf("expected allowed domain email to pass")
	}
	if HeadscaleConfigService.IsOIDCAutoLinkAllowed(cfg, "mallory@evil.com") {
		t.Fatalf("expected non-allowlisted email to be rejected")
	}
}

func TestIsOIDCAutoLinkAllowed_NoAllowlistDefaultsToAllow(t *testing.T) {
	cfg := &HeadscaleConfigFile{}
	if !HeadscaleConfigService.IsOIDCAutoLinkAllowed(cfg, "user@example.com") {
		t.Fatalf("expected allow when allowlist is empty")
	}
}

func TestHasOIDCAllowlist(t *testing.T) {
	cases := []struct {
		name string
		cfg  *HeadscaleConfigFile
		want bool
	}{
		{
			name: "nil config",
			cfg:  nil,
			want: false,
		},
		{
			name: "empty config",
			cfg:  &HeadscaleConfigFile{},
			want: false,
		},
		{
			name: "user allowlist present",
			cfg: &HeadscaleConfigFile{
				OIDC: OIDCConfig{
					AllowedUsers: []string{"alice@example.com"},
				},
			},
			want: true,
		},
		{
			name: "domain allowlist present",
			cfg: &HeadscaleConfigFile{
				OIDC: OIDCConfig{
					AllowedDomains: []string{"example.com"},
				},
			},
			want: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := HeadscaleConfigService.HasOIDCAllowlist(tc.cfg); got != tc.want {
				t.Fatalf("HasOIDCAllowlist() = %v, want %v", got, tc.want)
			}
		})
	}
}
