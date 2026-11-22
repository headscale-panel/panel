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

package secretbox

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"headscale-panel/pkg/conf"
	"strings"
)

// Box encrypts panel-side secrets before they reach storage.
//
// The key is derived from JWT_SECRET, so rotating JWT_SECRET makes stored secrets
// unreadable. That is intentional and documented: the alternative — a second
// secret that operators forget to back up — leaves ciphertext nobody can ever
// open, with no signal that it happened.
//
// It lives in pkg/ rather than a single domain because both the account domain
// (IdP client secrets) and the config domain (snapshot files that contain OIDC
// secrets and database passwords) need it, and two copies of a cipher is two
// places to get key derivation wrong.
type Box struct{}

// Secrets is the shared encrypt/decrypt helper.
var Secrets = Box{}

// Encrypt seals a plaintext secret. An empty input stays empty so callers can
// express "no secret" without a special case.
func (Box) Encrypt(plain string) (string, error) {
	normalized := strings.TrimSpace(plain)
	if normalized == "" {
		return "", nil
	}

	aead, err := newAEAD()
	if err != nil {
		return "", err
	}

	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", fmt.Errorf("generating nonce: %w", err)
	}

	return base64.RawStdEncoding.EncodeToString(aead.Seal(nonce, nonce, []byte(normalized), nil)), nil
}

// Decrypt opens a sealed secret.
func (Box) Decrypt(sealed string) (string, error) {
	if strings.TrimSpace(sealed) == "" {
		return "", nil
	}

	raw, err := base64.RawStdEncoding.DecodeString(sealed)
	if err != nil {
		return "", fmt.Errorf("decoding secret: %w", err)
	}

	aead, err := newAEAD()
	if err != nil {
		return "", err
	}
	if len(raw) < aead.NonceSize() {
		return "", errors.New("sealed secret is truncated")
	}

	nonce, ciphertext := raw[:aead.NonceSize()], raw[aead.NonceSize():]
	plain, openErr := aead.Open(nil, nonce, ciphertext, nil)
	if openErr != nil {
		return "", fmt.Errorf("opening secret: %w", openErr)
	}
	return string(plain), nil
}

func newAEAD() (cipher.AEAD, error) {
	block, err := aes.NewCipher(secretKey())
	if err != nil {
		return nil, fmt.Errorf("building cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("building gcm: %w", err)
	}
	return aead, nil
}

func secretKey() []byte {
	sum := sha256.Sum256([]byte(conf.Conf.JWT.Secret))
	return sum[:]
}
