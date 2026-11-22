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

// Package idp implements the panel acting as an OpenID Provider for exactly one
// client: headscale.
//
// The contract is deliberately narrow. There is no client registration, no
// refresh tokens, no discovery extensions, and no end-session endpoint. Widening
// it later means new users of the panel's identity store, which is a security
// decision, not a feature: every added grant is another way to obtain tokens
// minted over panel accounts.
package idp

// ClientID is the only OAuth client this provider recognises.
//
// It is a constant rather than a stored value because a second client would be a
// second trust relationship, and headscale does not support that shape either.
const ClientID = "headscale-builtin"

// ScopeOpenID is required on every authorization request.
const ScopeOpenID = "openid"

// keyID labels the signing key in the JWKS document and in token headers. One
// key is enough because the provider has no rotation flow: rotating would
// invalidate every already-enrolled headscale user until it refetched the JWKS.
const keyID = "1"
