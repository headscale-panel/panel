package services

import (
	"crypto/rand"
	"encoding/hex"
	"headscale-panel/model"
	"headscale-panel/pkg/utils/serializer"
)

type oauthClientService struct{}

var OauthClientService = &oauthClientService{}

func (s *oauthClientService) List(page, pageSize int) ([]model.OauthClient, int64, error) {
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

func (s *oauthClientService) Create(name, redirectURIs string) (*model.OauthClient, error) {
	clientID, err := generateRandomString(16)
	if err != nil {
		return nil, err
	}
	clientSecret, err := generateRandomString(32)
	if err != nil {
		return nil, err
	}

	client := &model.OauthClient{
		Name:         name,
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURIs: redirectURIs,
	}

	if err := model.DB.Create(client).Error; err != nil {
		return nil, err
	}

	return client, nil
}

func (s *oauthClientService) Update(id uint, name, redirectURIs string) error {
	var client model.OauthClient
	if err := model.DB.First(&client, id).Error; err != nil {
		return serializer.ErrUserNotFound // Reuse or create ErrClientNotFound
	}

	client.Name = name
	client.RedirectURIs = redirectURIs
	return model.DB.Save(&client).Error
}

func (s *oauthClientService) Delete(id uint) error {
	return model.DB.Delete(&model.OauthClient{}, id).Error
}

func (s *oauthClientService) RegenerateSecret(id uint) (string, error) {
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
