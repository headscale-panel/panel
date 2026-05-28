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

package services

import (
	"errors"
	"headscale-panel/model"
	"headscale-panel/pkg/unifyerror"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

func hashOAuthClientSecret(secret string) (string, error) {
	normalized := strings.TrimSpace(secret)
	if normalized == "" {
		return "", unifyerror.WrongParam("client_secret")
	}

	hashedSecret, err := bcrypt.GenerateFromPassword([]byte(normalized), bcrypt.DefaultCost)
	if err != nil {
		return "", unifyerror.ServerError(err)
	}

	return string(hashedSecret), nil
}

func migrateLegacyOAuthClientSecret(client *model.OauthClient) error {
	if client == nil {
		return unifyerror.ServerError(errors.New("oauth client is nil"))
	}

	if strings.TrimSpace(client.ClientSecretHash) != "" {
		return nil
	}

	legacySecret := strings.TrimSpace(client.ClientSecret)
	if legacySecret == "" {
		return nil
	}

	if isInsecureOIDCClientSecret(legacySecret) {
		return unifyerror.ServerError(errors.New("legacy oauth client secret is insecure"))
	}

	hashedSecret, err := hashOAuthClientSecret(legacySecret)
	if err != nil {
		return err
	}

	if err := model.DB.Model(&model.OauthClient{}).
		Where("id = ?", client.ID).
		Updates(map[string]interface{}{
			"client_secret_hash": hashedSecret,
			"client_secret":      "",
		}).Error; err != nil {
		return unifyerror.DbError(err)
	}

	client.ClientSecretHash = hashedSecret
	client.ClientSecret = ""
	return nil
}

func verifyOAuthClientSecret(client *model.OauthClient, providedSecret string) (bool, error) {
	if client == nil {
		return false, unifyerror.ServerError(errors.New("oauth client is nil"))
	}

	if strings.TrimSpace(providedSecret) == "" {
		return false, nil
	}

	if err := migrateLegacyOAuthClientSecret(client); err != nil {
		return false, err
	}

	hashedSecret := strings.TrimSpace(client.ClientSecretHash)
	if hashedSecret == "" {
		// No hash available and migration did not produce one — reject
		return false, nil
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hashedSecret), []byte(providedSecret)); err != nil {
		if errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) {
			return false, nil
		}
		return false, unifyerror.ServerError(err)
	}

	return true, nil
}
