// Copyright (C) 2026
// SPDX-License-Identifier: AGPL-3.0-or-later

package services

import "testing"

func TestBuiltinOIDCRedirectURI(t *testing.T) {
	if got, want := builtinOIDCRedirectURI("https://hs.example.com/panel"), "https://hs.example.com/oidc/callback"; got != want {
		t.Fatalf("builtinOIDCRedirectURI() = %q, want %q", got, want)
	}
}
