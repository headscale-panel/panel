package services

import (
	"crypto/rand"
	"encoding/hex"
	"headscale-panel/model"
	"headscale-panel/pkg/utils/serializer"
	"strings"
)

type oauthClientService struct{}

var OauthClientService = &oauthClientService{}

func (s *oauthClientService) List(actorUserID uint, page, pageSize int) ([]model.OauthClient, int64, error) {
	if err := RequirePermission(actorUserID, "system:oauth_client:list"); err != nil {
		return nil, 0, err
	}

	var clients []model.OauthClient
	var total int64

	db := model.DB.Model(&model.OauthClient{})
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := db.Offset((page - 1) * pageSize).Limit(pageSize).Find(&clients).Error; err != nil {
		return nil, 0, err
	}

	return clients, total, nil
}

func (s *oauthClientService) Create(actorUserID uint, name, redirectURIs string) (*model.OauthClient, error) {
	if err := RequirePermission(actorUserID, "system:oauth_client:create"); err != nil {
		return nil, err
	}

	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return nil, serializer.NewError(serializer.CodeParamErr, "name is required", nil)
	}
	normalizedRedirectURIs, err := normalizeRedirectURIs(redirectURIs)
	if err != nil {
		return nil, serializer.NewError(serializer.CodeParamErr, err.Error(), nil)
	}

	clientID, err := generateRandomString(16)
	if err != nil {
		return nil, err
	}
	clientSecret, err := generateRandomString(32)
	if err != nil {
		return nil, err
	}

	client := &model.OauthClient{
		Name:         trimmedName,
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURIs: normalizedRedirectURIs,
	}

	if err := model.DB.Create(client).Error; err != nil {
		return nil, err
	}

	return client, nil
}

func (s *oauthClientService) Update(actorUserID uint, id uint, name, redirectURIs string) error {
	if err := RequirePermission(actorUserID, "system:oauth_client:update"); err != nil {
		return err
	}

	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return serializer.NewError(serializer.CodeParamErr, "name is required", nil)
	}
	normalizedRedirectURIs, err := normalizeRedirectURIs(redirectURIs)
	if err != nil {
		return serializer.NewError(serializer.CodeParamErr, err.Error(), nil)
	}

	var client model.OauthClient
	if err := model.DB.First(&client, id).Error; err != nil {
		return serializer.ErrUserNotFound // Reuse or create ErrClientNotFound
	}

	client.Name = trimmedName
	client.RedirectURIs = normalizedRedirectURIs
	return model.DB.Save(&client).Error
}

func (s *oauthClientService) Delete(actorUserID uint, id uint) error {
	if err := RequirePermission(actorUserID, "system:oauth_client:delete"); err != nil {
		return err
	}

	return model.DB.Delete(&model.OauthClient{}, id).Error
}

func (s *oauthClientService) RegenerateSecret(actorUserID uint, id uint) (string, error) {
	if err := RequirePermission(actorUserID, "system:oauth_client:secret"); err != nil {
		return "", err
	}

	var client model.OauthClient
	if err := model.DB.First(&client, id).Error; err != nil {
		return "", serializer.ErrUserNotFound
	}

	newSecret, err := generateRandomString(32)
	if err != nil {
		return "", err
	}

	client.ClientSecret = newSecret
	if err := model.DB.Save(&client).Error; err != nil {
		return "", err
	}

	return newSecret, nil
}

func generateRandomString(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
