// Copyright (C) 2026
// SPDX-License-Identifier: AGPL-3.0-or-later

package controllers

import "testing"

func TestOIDCLoginURL(t *testing.T) {
	tests := []struct {
		name       string
		baseURL    string
		requestURI string
		want       string
	}{
		{
			name:       "panel base path",
			baseURL:    "https://hs.example.com/panel",
			requestURI: "/panel/api/v1/oidc/authorize?client_id=headscale-builtin",
			want:       "https://hs.example.com/panel/login?return_url=https%3A%2F%2Fhs.example.com%2Fpanel%2Fapi%2Fv1%2Foidc%2Fauthorize%3Fclient_id%3Dheadscale-builtin",
		},
		{
			name:       "trailing slash",
			baseURL:    "https://hs.example.com/panel/",
			requestURI: "/panel/api/v1/oidc/authorize",
			want:       "https://hs.example.com/panel/login?return_url=https%3A%2F%2Fhs.example.com%2Fpanel%2Fapi%2Fv1%2Foidc%2Fauthorize",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := oidcLoginURL(tt.baseURL, tt.requestURI); got != tt.want {
				t.Fatalf("oidcLoginURL() = %q, want %q", got, tt.want)
			}
		})
	}
}
