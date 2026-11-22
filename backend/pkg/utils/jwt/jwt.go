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

package jwt

import (
	"crypto/rsa"
	"errors"
	"headscale-panel/pkg/conf"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims is the panel's access token payload.
//
// SessionVersion is the revocation handle: the account row carries a counter
// that is bumped on password change, disable and logout-everywhere. A token
// whose version no longer matches is rejected even though its signature is
// still valid, which is the only way to revoke a stateless token.
type Claims struct {
	AccountID      uint   `json:"account_id"`
	Username       string `json:"username"`
	RoleID         uint   `json:"role_id"`
	SessionVersion uint64 `json:"session_version"`
	jwt.RegisteredClaims
}

// GenerateToken mints an access token for an account.
func GenerateToken(accountID uint, username string, roleID uint, sessionVersion uint64) (string, error) {
	key, err := privateKey()
	if err != nil {
		return "", err
	}

	now := time.Now()
	claims := Claims{
		AccountID:      accountID,
		Username:       username,
		RoleID:         roleID,
		SessionVersion: sessionVersion,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Duration(conf.Conf.JWT.Expire) * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			Issuer:    "headscale-panel",
		},
	}

	return signWithKey(claims, key, cachedKeyID)
}

// ParseToken validates the signature and expiry and returns the claims.
func ParseToken(token string) (*Claims, error) {
	key, err := privateKey()
	if err != nil {
		return nil, err
	}
	return parseTokenWithKey(token, key)
}

func signWithKey(claims Claims, key *rsa.PrivateKey, keyID string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	if keyID != "" {
		token.Header["kid"] = keyID
	}
	return token.SignedString(key)
}

// parseTokenWithKey verifies a token against one key.
//
// The accepted algorithm is pinned to RS256. Without that restriction, a token
// whose header says "alg: none" or "alg: HS256" would be verified against the
// public key as if it were an HMAC secret, which is the classic algorithm
// confusion attack.
func parseTokenWithKey(token string, key *rsa.PrivateKey) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(token, &Claims{}, func(*jwt.Token) (any, error) {
		return &key.PublicKey, nil
	},
		jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}),
		jwt.WithIssuer("headscale-panel"),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return nil, err
	}

	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

// publicKeyPEMForKey renders a key's public half for tests and the JWKS endpoint.
func publicKeyPEMForKey(key *rsa.PrivateKey) ([]byte, error) {
	return publicKeyPEM(&key.PublicKey)
}
