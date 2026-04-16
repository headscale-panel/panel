package services

import (
	"errors"
	"fmt"
	"headscale-panel/model"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

func hashOAuthClientSecret(secret string) (string, error) {
	normalized := strings.TrimSpace(secret)
	if normalized == "" {
		return "", errors.New("client secret cannot be empty")
	}

	hashedSecret, err := bcrypt.GenerateFromPassword([]byte(normalized), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("failed to hash client secret: %w", err)
	}

	return string(hashedSecret), nil
}

func migrateLegacyOAuthClientSecret(client *model.OauthClient) error {
	if client == nil {
		return errors.New("oauth client is nil")
	}

	if strings.TrimSpace(client.ClientSecretHash) != "" {
		return nil
	}

	legacySecret := strings.TrimSpace(client.ClientSecret)
	if legacySecret == "" {
		return nil
	}

	if isInsecureOIDCClientSecret(legacySecret) {
		return errors.New("legacy oauth client secret is insecure")
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
		return fmt.Errorf("failed to migrate legacy oauth client secret: %w", err)
	}

	client.ClientSecretHash = hashedSecret
	client.ClientSecret = ""
	return nil
}

func verifyOAuthClientSecret(client *model.OauthClient, providedSecret string) (bool, error) {
	if client == nil {
		return false, errors.New("oauth client is nil")
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
		return false, fmt.Errorf("failed to verify client secret hash: %w", err)
	}

	return true, nil
}
