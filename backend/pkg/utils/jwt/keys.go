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
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// rsaKeyBits is the modulus size. 2048 is the floor that every JWT library and
// browser accepts; 4096 doubles the signing cost for no practical gain on a
// short-lived access token.
const rsaKeyBits = 2048

var (
	keyOnce sync.Once
	keyErr  error

	cachedPrivate *rsa.PrivateKey
	cachedKeyID   string
	keyPath       string
)

var errNoKeyPath = errors.New("jwt: key path not configured")

// ConfigureKeyStore tells the package where the signing key lives.
//
// It must be called once at startup, before any token is minted or parsed. The
// path is a file holding a PKCS#8 private key; the public key is derived from it
// rather than stored separately, so the two can never drift apart.
func ConfigureKeyStore(path string) {
	keyPath = path
}

// KeyID returns the identifier of the active signing key.
//
// It is the first 16 base64url characters of the SHA-256 of the DER-encoded
// public key, which is the RFC 7638 thumbprint truncated to something readable.
// Publishing it in the JWT header is what makes a future rotation possible
// without invalidating tokens that were signed by the previous key.
func KeyID() (string, error) {
	if _, err := privateKey(); err != nil {
		return "", err
	}
	return cachedKeyID, nil
}

// PublicKeyPEM returns the public half of the signing key in PEM form.
//
// Exposed so an operator can verify a token by hand when debugging, and so the
// panel can publish it for anything that needs to check its signatures.
func PublicKeyPEM() ([]byte, error) {
	key, err := privateKey()
	if err != nil {
		return nil, err
	}
	return publicKeyPEM(&key.PublicKey)
}

func publicKeyPEM(pub *rsa.PublicKey) ([]byte, error) {
	der, err := x509.MarshalPKIXPublicKey(pub)
	if err != nil {
		return nil, fmt.Errorf("jwt: marshalling public key: %w", err)
	}
	return pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der}), nil
}

// privateKey loads the signing key once, generating it when absent.
func privateKey() (*rsa.PrivateKey, error) {
	keyOnce.Do(func() {
		cachedPrivate, cachedKeyID, keyErr = loadOrCreateKey(keyPath)
	})
	return cachedPrivate, keyErr
}

func loadOrCreateKey(path string) (*rsa.PrivateKey, string, error) {
	if path == "" {
		return nil, "", errNoKeyPath
	}

	raw, err := os.ReadFile(path)
	if err == nil {
		key, parseErr := parseKeyPEM(raw)
		if parseErr != nil {
			// A corrupt key must not be silently replaced: doing so would invalidate
			// every issued token and hide the fact that something damaged the file.
			return nil, "", fmt.Errorf("jwt: reading signing key %s: %w", path, parseErr)
		}
		return key, thumbprint(&key.PublicKey), nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return nil, "", fmt.Errorf("jwt: reading signing key %s: %w", path, err)
	}

	key, err := rsa.GenerateKey(rand.Reader, rsaKeyBits)
	if err != nil {
		return nil, "", fmt.Errorf("jwt: generating signing key: %w", err)
	}
	if err := persistKey(path, key); err != nil {
		return nil, "", err
	}
	return key, thumbprint(&key.PublicKey), nil
}

func parseKeyPEM(raw []byte) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode(raw)
	if block == nil {
		return nil, errors.New("no PEM block found")
	}

	if key, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		rsaKey, ok := key.(*rsa.PrivateKey)
		if !ok {
			return nil, fmt.Errorf("key is %T, want RSA", key)
		}
		return rsaKey, nil
	}

	// Keys written by older builds are PKCS#1; accepting them means an existing
	// deployment does not have to regenerate.
	return x509.ParsePKCS1PrivateKey(block.Bytes)
}

// persistKey writes the key with 0600 and fsyncs before closing.
//
// The write goes to a temporary file in the same directory and is renamed into
// place, so a crash mid-write cannot leave a truncated key that would then be
// rejected as corrupt on the next start.
func persistKey(path string, key *rsa.PrivateKey) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("jwt: creating key directory: %w", err)
	}

	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return fmt.Errorf("jwt: marshalling signing key: %w", err)
	}
	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})

	tmp, err := os.CreateTemp(dir, ".jwt-key-*")
	if err != nil {
		return fmt.Errorf("jwt: creating key file: %w", err)
	}
	tmpName := tmp.Name()

	cleanup := func() {
		_ = tmp.Close()
		_ = os.Remove(tmpName)
	}

	if err := tmp.Chmod(0o600); err != nil {
		cleanup()
		return fmt.Errorf("jwt: setting key permissions: %w", err)
	}
	if _, err := tmp.Write(pemBytes); err != nil {
		cleanup()
		return fmt.Errorf("jwt: writing signing key: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		cleanup()
		return fmt.Errorf("jwt: syncing signing key: %w", err)
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpName)
		return fmt.Errorf("jwt: closing signing key: %w", err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		_ = os.Remove(tmpName)
		return fmt.Errorf("jwt: installing signing key: %w", err)
	}
	return nil
}

func thumbprint(pub *rsa.PublicKey) string {
	der, err := x509.MarshalPKIXPublicKey(pub)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(der)
	return base64.RawURLEncoding.EncodeToString(sum[:])[:16]
}
