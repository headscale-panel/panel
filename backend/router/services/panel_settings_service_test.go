package services

import (
	"headscale-panel/pkg/conf"
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
