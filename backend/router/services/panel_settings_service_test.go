package services

import (
	"headscale-panel/pkg/conf"
	"reflect"
	"testing"
)

func TestPanelSecretRoundTrip(t *testing.T) {
	previous := conf.Conf.JWT.Secret
	conf.Conf.JWT.Secret = "1234567890abcdef1234567890abcdef"
	defer func() {
		conf.Conf.JWT.Secret = previous
	}()

	encrypted, err := encryptPanelSecret("super-secret")
	if err != nil {
		t.Fatalf("encryptPanelSecret() error = %v", err)
	}
	if encrypted == "" {
		t.Fatal("expected encrypted secret to be non-empty")
	}

	decrypted, err := decryptPanelSecret(encrypted, "")
	if err != nil {
		t.Fatalf("decryptPanelSecret() error = %v", err)
	}
	if decrypted != "super-secret" {
		t.Fatalf("decryptPanelSecret() = %q, want %q", decrypted, "super-secret")
	}
}

func TestLoadOIDCSettingsPayloadLegacyPlainSecret(t *testing.T) {
	previous := conf.Conf.JWT.Secret
	conf.Conf.JWT.Secret = "1234567890abcdef1234567890abcdef"
	defer func() {
		conf.Conf.JWT.Secret = previous
	}()

	payload, err := loadOIDCSettingsPayload(`{"enabled":true,"client_id":"abc","client_secret":"plain-secret"}`)
	if err != nil {
		t.Fatalf("loadOIDCSettingsPayload() error = %v", err)
	}
	if payload.ClientSecret != "plain-secret" {
		t.Fatalf("ClientSecret = %q, want %q", payload.ClientSecret, "plain-secret")
	}
}

func TestMergeOIDCSettingsIntoHeadscaleConfigEnabled(t *testing.T) {
	current := &HeadscaleConfigFile{
		OIDC: OIDCConfig{
			ClientSecret: "existing-secret",
		},
	}
	payload := &OIDCSettingsPayload{
		Enabled:                    true,
		OnlyStartIfOIDCIsAvailable: true,
		Issuer:                     " https://issuer.example.com ",
		ClientID:                   " panel-client ",
		ClientSecret:               "",
		ClientSecretPath:           " /etc/headscale/oidc_secret ",
		Scope:                      []string{"openid", " profile ", ""},
		EmailVerifiedRequired:      true,
		AllowedDomains:             []string{" example.com ", ""},
		AllowedUsers:               []string{" user@example.com ", ""},
		AllowedGroups:              []string{" admins ", ""},
		StripEmailDomain:           true,
		Expiry:                     " 12h ",
		UseExpiryFromToken:         true,
		PKCEEnabled:                true,
		PKCEMethod:                 " S256 ",
	}

	got := mergeOIDCSettingsIntoHeadscaleConfig(current, payload)
	if got == nil {
		t.Fatal("expected merged config to be non-nil")
	}
	if got.OIDC.Issuer != "https://issuer.example.com" {
		t.Fatalf("Issuer = %q, want %q", got.OIDC.Issuer, "https://issuer.example.com")
	}
	if got.OIDC.ClientID != "panel-client" {
		t.Fatalf("ClientID = %q, want %q", got.OIDC.ClientID, "panel-client")
	}
	if got.OIDC.ClientSecret != "existing-secret" {
		t.Fatalf("ClientSecret = %q, want existing secret", got.OIDC.ClientSecret)
	}
	if got.OIDC.ClientSecretPath != "/etc/headscale/oidc_secret" {
		t.Fatalf("ClientSecretPath = %q, want %q", got.OIDC.ClientSecretPath, "/etc/headscale/oidc_secret")
	}
	if len(got.OIDC.Scope) != 2 || got.OIDC.Scope[0] != "openid" || got.OIDC.Scope[1] != "profile" {
		t.Fatalf("Scope = %#v, want [openid profile]", got.OIDC.Scope)
	}
	if len(got.OIDC.AllowedDomains) != 1 || got.OIDC.AllowedDomains[0] != "example.com" {
		t.Fatalf("AllowedDomains = %#v, want [example.com]", got.OIDC.AllowedDomains)
	}
	if len(got.OIDC.AllowedUsers) != 1 || got.OIDC.AllowedUsers[0] != "user@example.com" {
		t.Fatalf("AllowedUsers = %#v, want [user@example.com]", got.OIDC.AllowedUsers)
	}
	if len(got.OIDC.AllowedGroups) != 1 || got.OIDC.AllowedGroups[0] != "admins" {
		t.Fatalf("AllowedGroups = %#v, want [admins]", got.OIDC.AllowedGroups)
	}
	if got.OIDC.Expiry != "12h" {
		t.Fatalf("Expiry = %q, want %q", got.OIDC.Expiry, "12h")
	}
	if !got.OIDC.PKCE.Enabled || got.OIDC.PKCE.Method != "S256" {
		t.Fatalf("PKCE = %#v, want enabled S256", got.OIDC.PKCE)
	}
}

func TestMergeOIDCSettingsIntoHeadscaleConfigDisabledClearsOIDC(t *testing.T) {
	current := &HeadscaleConfigFile{
		OIDC: OIDCConfig{
			Issuer:       "https://issuer.example.com",
			ClientID:     "panel-client",
			ClientSecret: "secret",
		},
	}

	got := mergeOIDCSettingsIntoHeadscaleConfig(current, &OIDCSettingsPayload{Enabled: false})
	if got == nil {
		t.Fatal("expected merged config to be non-nil")
	}
	if !reflect.DeepEqual(got.OIDC, OIDCConfig{}) {
		t.Fatalf("OIDC = %#v, want zero value", got.OIDC)
	}
}
