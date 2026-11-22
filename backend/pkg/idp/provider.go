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
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"errors"
	"fmt"
	"math/big"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// AuthCodeTTL is how long an issued authorization code stays redeemable.
//
// Headscale redeems immediately after the browser redirect, so a short window is
// enough, and a short window is what limits the damage of a leaked code.
const AuthCodeTTL = 5 * time.Minute

// TokenTTL is the lifetime of an id_token and access_token.
const TokenTTL = time.Hour

// Errors returned by the provider. The HTTP layer maps these onto OAuth error
// codes; the provider itself stays transport-agnostic.
var (
	ErrInvalidClient      = errors.New("invalid client")
	ErrInvalidRedirectURI = errors.New("invalid redirect_uri")
	ErrInvalidScope       = errors.New("invalid scope")
	ErrInvalidCode        = errors.New("invalid authorization code")
	ErrCodeExpired        = errors.New("authorization code expired")
	ErrInvalidPKCE        = errors.New("PKCE verification failed")
	ErrInvalidToken       = errors.New("invalid token")
	ErrNotEnrolled        = errors.New("account is not permitted to enroll devices")
	ErrDisabled           = errors.New("provider is disabled")
)

// Claims is the payload carried by every token this provider issues.
//
// The panel's own session tokens use a different structure; keeping them apart
// matters because these are consumed by headscale, not by the panel.
type Claims struct {
	Issuer            string   `json:"iss"`
	Subject           string   `json:"sub"`
	Audience          string   `json:"aud"`
	ExpiresAt         int64    `json:"exp"`
	IssuedAt          int64    `json:"iat"`
	Name              string   `json:"name,omitempty"`
	PreferredUsername string   `json:"preferred_username,omitempty"`
	Email             string   `json:"email,omitempty"`
	EmailVerified     bool     `json:"email_verified"`
	Groups            []string `json:"groups,omitempty"`
	Nonce             string   `json:"nonce,omitempty"`
	TokenType         string   `json:"type,omitempty"`
}

// GetExpirationTime implements jwt.Claims.
func (c Claims) GetExpirationTime() (*jwt.NumericDate, error) {
	return jwt.NewNumericDate(time.Unix(c.ExpiresAt, 0)), nil
}

// GetIssuedAt implements jwt.Claims.
func (c Claims) GetIssuedAt() (*jwt.NumericDate, error) {
	return jwt.NewNumericDate(time.Unix(c.IssuedAt, 0)), nil
}

// GetNotBefore implements jwt.Claims.
func (c Claims) GetNotBefore() (*jwt.NumericDate, error) { return nil, nil }

// GetIssuer implements jwt.Claims.
func (c Claims) GetIssuer() (string, error) { return c.Issuer, nil }

// GetSubject implements jwt.Claims.
func (c Claims) GetSubject() (string, error) { return c.Subject, nil }

// GetAudience implements jwt.Claims.
func (c Claims) GetAudience() (jwt.ClaimStrings, error) {
	return jwt.ClaimStrings{c.Audience}, nil
}

// User is the account an authorization request is being made for.
type User struct {
	AccountID   uint
	Username    string
	DisplayName string
	Email       string
	PictureURL  string
	Groups      []string
}

// Name returns the display name, falling back to the username.
func (u User) Name() string {
	if u.DisplayName != "" {
		return u.DisplayName
	}
	return u.Username
}

// AuthorizationRequest is a validated /authorize call.
type AuthorizationRequest struct {
	RedirectURI string
	State       string
	Nonce       string
	Scope       string
	Challenge   string
	Method      string
}

type authCode struct {
	accountID   uint
	redirectURI string
	nonce       string
	scope       string
	challenge   string
	method      string
	expiresAt   time.Time
}

// Provider issues and validates tokens for headscale.
type Provider struct {
	key    *rsa.PrivateKey
	issuer string

	mu    sync.Mutex
	codes map[string]authCode
	now   func() time.Time
}

// New builds a provider.
//
// The expected redirect is not a construction argument: it is derived from
// headscale's own server_url, which may not be known yet when the panel boots.
// Requiring it here would make a fresh install fail to start, which is exactly
// the situation the setup wizard exists to handle.
func New(key *rsa.PrivateKey, issuer string) (*Provider, error) {
	if key == nil {
		return nil, errors.New("signing key is required")
	}
	if !IsAbsoluteHTTPURL(issuer) {
		return nil, fmt.Errorf("issuer %q must be an absolute http(s) URL", issuer)
	}

	return &Provider{
		key:    key,
		issuer: Issuer(issuer),
		codes:  make(map[string]authCode),
		now:    time.Now,
	}, nil
}

// Issuer returns the issuer identifier this provider advertises.
func (p *Provider) Issuer() string { return p.issuer }

// ValidateAuthorization checks the client, the redirect, the scope and any PKCE
// parameters. It performs no side effects, so the HTTP layer can report a
// specific error before rendering a consent page.
func (p *Provider) ValidateAuthorization(clientID, redirectURI, expectedRedirect, responseType, scope, challenge, method string) (*AuthorizationRequest, error) {
	if clientID != ClientID {
		return nil, ErrInvalidClient
	}
	if !ValidateRedirectURI(redirectURI, expectedRedirect) {
		return nil, ErrInvalidRedirectURI
	}
	if responseType != "code" {
		return nil, errors.New("only the authorization_code flow is supported")
	}
	if !hasScope(scope, ScopeOpenID) {
		return nil, ErrInvalidScope
	}
	if !PKCEChallengeIsValid(challenge, method) {
		return nil, ErrInvalidPKCE
	}

	return &AuthorizationRequest{
		RedirectURI: redirectURI,
		Scope:       scope,
		Challenge:   challenge,
		Method:      method,
	}, nil
}

// IssueCode records a one-time authorization code for an account.
func (p *Provider) IssueCode(user User, req AuthorizationRequest) (string, error) {
	if user.AccountID == 0 {
		return "", errors.New("user is required")
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	code := base64.RawURLEncoding.EncodeToString(raw)

	p.mu.Lock()
	defer p.mu.Unlock()

	now := p.now()
	p.dropExpiredLocked(now)
	p.codes[code] = authCode{
		accountID:   user.AccountID,
		redirectURI: req.RedirectURI,
		nonce:       req.Nonce,
		scope:       req.Scope,
		challenge:   req.Challenge,
		method:      req.Method,
		expiresAt:   now.Add(AuthCodeTTL),
	}
	return code, nil
}

// Exchange redeems an authorization code.
//
// The code is consumed before any validation so a failed attempt cannot be
// retried with corrected parameters: an attacker who guesses a verifier must not
// get unlimited attempts against the same code.
//
// resolve turns the account id carried by the code into the claims to sign. It is
// a callback rather than a stored lookup so this package stays free of any
// account storage concerns.
func (p *Provider) Exchange(code, clientID, redirectURI, verifier string, resolve func(accountID uint) (User, error)) (string, string, error) {
	if clientID != ClientID {
		return "", "", ErrInvalidClient
	}

	p.mu.Lock()
	record, ok := p.codes[code]
	if ok {
		delete(p.codes, code)
	}
	now := p.now()
	p.mu.Unlock()

	if !ok {
		return "", "", ErrInvalidCode
	}
	if !now.Before(record.expiresAt) {
		return "", "", ErrCodeExpired
	}
	if record.redirectURI != redirectURI {
		return "", "", ErrInvalidRedirectURI
	}
	if !VerifyPKCE(record.challenge, record.method, verifier) {
		return "", "", ErrInvalidPKCE
	}

	user, err := resolve(record.accountID)
	if err != nil {
		return "", "", ErrInvalidCode
	}
	if user.AccountID != record.accountID {
		return "", "", ErrInvalidCode
	}

	accessToken, err := p.sign(Claims{
		Issuer:            p.issuer,
		Subject:           Subject(user.AccountID),
		Audience:          ClientID,
		ExpiresAt:         now.Add(TokenTTL).Unix(),
		IssuedAt:          now.Unix(),
		Name:              user.Name(),
		PreferredUsername: user.Username,
		Email:             user.Email,
		EmailVerified:     true,
		Groups:            user.Groups,
		TokenType:         "access",
	})
	if err != nil {
		return "", "", err
	}

	idToken, err := p.sign(Claims{
		Issuer:            p.issuer,
		Subject:           Subject(user.AccountID),
		Audience:          ClientID,
		ExpiresAt:         now.Add(TokenTTL).Unix(),
		IssuedAt:          now.Unix(),
		Name:              user.Name(),
		PreferredUsername: user.Username,
		Email:             user.Email,
		EmailVerified:     true,
		Groups:            user.Groups,
		Nonce:             record.nonce,
	})
	if err != nil {
		return "", "", err
	}

	return idToken, accessToken, nil
}

// ParseAccessToken validates a token issued by this provider and returns its
// claims. Only access tokens are accepted, so an id_token cannot be replayed
// against /userinfo.
func (p *Provider) ParseAccessToken(raw string) (*Claims, error) {
	claims, err := p.parse(raw)
	if err != nil {
		return nil, err
	}
	if claims.TokenType != "access" {
		return nil, ErrInvalidToken
	}
	return claims, nil
}

func (p *Provider) parse(raw string) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(raw, &Claims{}, func(*jwt.Token) (any, error) {
		return &p.key.PublicKey, nil
	}, jwt.WithValidMethods([]string{"RS256"}))
	if err != nil {
		return nil, ErrInvalidToken
	}

	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return nil, ErrInvalidToken
	}
	if claims.Issuer != p.issuer {
		return nil, ErrInvalidToken
	}
	return claims, nil
}

func (p *Provider) sign(claims Claims) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = keyID
	return token.SignedString(p.key)
}

// JWKS returns the public key set headscale fetches to verify tokens.
func (p *Provider) JWKS() map[string]any {
	pub := p.key.PublicKey
	return map[string]any{
		"keys": []map[string]any{{
			"kty": "RSA",
			"alg": "RS256",
			"use": "sig",
			"kid": keyID,
			"n":   base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
			"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pub.E)).Bytes()),
		}},
	}
}

// Discovery is the OpenID configuration document.
func (p *Provider) Discovery() map[string]any {
	return map[string]any{
		"issuer":                                p.issuer,
		"authorization_endpoint":                p.issuer + "/idp/authorize",
		"token_endpoint":                        p.issuer + "/idp/token",
		"userinfo_endpoint":                     p.issuer + "/idp/userinfo",
		"jwks_uri":                              p.issuer + "/.well-known/jwks.json",
		"response_types_supported":              []string{"code"},
		"grant_types_supported":                 []string{"authorization_code"},
		"subject_types_supported":               []string{"public"},
		"id_token_signing_alg_values_supported": []string{"RS256"},
		"scopes_supported":                      []string{"openid", "profile", "email"},
		"claims_supported": []string{
			"iss", "sub", "aud", "exp", "iat", "nonce",
			"name", "preferred_username", "email", "email_verified", "groups",
		},
		"token_endpoint_auth_methods_supported": []string{"client_secret_basic", "client_secret_post"},
	}
}

func (p *Provider) dropExpiredLocked(now time.Time) {
	for code, record := range p.codes {
		if !now.Before(record.expiresAt) {
			delete(p.codes, code)
		}
	}
}

func hasScope(scope, want string) bool {
	for _, part := range splitFields(scope) {
		if part == want {
			return true
		}
	}
	return false
}

func splitFields(s string) []string {
	var out []string
	start := -1
	for i, r := range s {
		if r == ' ' || r == '\t' {
			if start >= 0 {
				out = append(out, s[start:i])
				start = -1
			}
			continue
		}
		if start < 0 {
			start = i
		}
	}
	if start >= 0 {
		out = append(out, s[start:])
	}
	return out
}

// AuthorizationQuery is a raw /authorize request, before validation.
type AuthorizationQuery struct {
	ClientID            string
	RedirectURI         string
	ResponseType        string
	Scope               string
	State               string
	Nonce               string
	CodeChallenge       string
	CodeChallengeMethod string
}
