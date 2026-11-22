// Copyright (C) 2026
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

package idp

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"net/url"
	"strings"
)

// Subject turns an account id into the `sub` claim.
//
// The account id, not the username or email, is the subject: those change, and
// headscale treats `sub` as the identity. Changing the subject scheme would make
// every already-enrolled device look like a new user.
func Subject(accountID uint) string {
	return formatUint(accountID)
}

// ParseSubject recovers the account id from a `sub` claim.
func ParseSubject(sub string) (uint, bool) {
	sub = strings.TrimSpace(sub)
	if sub == "" {
		return 0, false
	}

	var id uint
	for _, r := range sub {
		if r < '0' || r > '9' {
			return 0, false
		}
		next := id*10 + uint(r-'0')
		if next < id {
			return 0, false
		}
		id = next
	}
	if id == 0 {
		return 0, false
	}
	return id, true
}

func formatUint(v uint) string {
	if v == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	return string(buf[i:])
}

// RedirectURI is the only callback headscale is allowed to use.
//
// It is derived from headscale's own server_url rather than stored, because
// headscale always builds its callback that way. Accepting an arbitrary
// redirect_uri here would turn the provider into an open redirector over panel
// accounts.
func RedirectURI(headscaleServerURL string) string {
	return strings.TrimRight(strings.TrimSpace(headscaleServerURL), "/") + "/oidc/callback"
}

// ValidateRedirectURI reports whether candidate matches the one legal callback.
func ValidateRedirectURI(candidate, expected string) bool {
	if expected == "" || candidate == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(candidate), []byte(expected)) == 1
}

// PKCEChallengeIsValid checks the shape of a code_challenge.
//
// PKCE is optional for a confidential client, but when it is present only S256
// is accepted: `plain` adds no protection against an attacker who can already
// read the authorization request.
func PKCEChallengeIsValid(challenge, method string) bool {
	challenge = strings.TrimSpace(challenge)
	method = strings.TrimSpace(method)

	if challenge == "" && method == "" {
		return true
	}
	if challenge == "" || method != "S256" || len(challenge) != 43 {
		return false
	}
	_, err := base64.RawURLEncoding.DecodeString(challenge)
	return err == nil
}

// VerifyPKCE checks a code_verifier against the stored challenge. An absent
// challenge means PKCE was not used and verification passes.
func VerifyPKCE(challenge, method, verifier string) bool {
	if challenge == "" && method == "" {
		return true
	}
	if method != "S256" || !isValidVerifier(verifier) {
		return false
	}

	digest := sha256.Sum256([]byte(verifier))
	computed := base64.RawURLEncoding.EncodeToString(digest[:])
	return subtle.ConstantTimeCompare([]byte(challenge), []byte(computed)) == 1
}

func isValidVerifier(verifier string) bool {
	if len(verifier) < 43 || len(verifier) > 128 {
		return false
	}
	for _, r := range verifier {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
		case r == '-', r == '.', r == '_', r == '~':
		default:
			return false
		}
	}
	return true
}

// Issuer normalises the configured base URL into an issuer identifier.
func Issuer(baseURL string) string {
	return strings.TrimRight(strings.TrimSpace(baseURL), "/")
}

// IsAbsoluteHTTPURL reports whether raw is an absolute http(s) URL, which is the
// only shape an issuer is allowed to take.
func IsAbsoluteHTTPURL(raw string) bool {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return false
	}
	return parsed.Host != ""
}
