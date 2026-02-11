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
