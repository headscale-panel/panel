package services

import (
	"crypto/rand"
	"encoding/hex"
	"headscale-panel/model"
	"headscale-panel/pkg/utils/serializer"
	"strings"
	"time"
)

type oauthClientService struct{}

var OauthClientService = &oauthClientService{}

type OauthClientView struct {
	ID           uint      `json:"id"`
	ClientID     string    `json:"client_id"`
	RedirectURIs string    `json:"redirect_uris"`
	Name         string    `json:"name"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type OauthClientCreated struct {
	Client       OauthClientView `json:"client"`
	ClientSecret string          `json:"client_secret"`
}

func (s *oauthClientService) List(actorUserID uint, page, pageSize int) ([]OauthClientView, int64, error) {
	if err := RequirePermission(actorUserID, "system:oauth_client:list"); err != nil {
		return nil, 0, err
	}

	var clients []model.OauthClient
	var total int64

	db := model.DB.Model(&model.OauthClient{})
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, serializer.ErrDatabase.WithError(err)
	}

	if err := db.Offset((page - 1) * pageSize).Limit(pageSize).Find(&clients).Error; err != nil {
		return nil, 0, serializer.ErrDatabase.WithError(err)
	}

	result := make([]OauthClientView, 0, len(clients))
	for _, client := range clients {
		result = append(result, toOauthClientView(client))
	}

	return result, total, nil
}

func (s *oauthClientService) Create(actorUserID uint, name, redirectURIs string) (*OauthClientCreated, error) {
	if err := RequirePermission(actorUserID, "system:oauth_client:create"); err != nil {
		return nil, err
	}

	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return nil, serializer.NewError(serializer.CodeParamErr, "name is required", nil)
	}
	normalizedRedirectURIs, err := normalizeRedirectURIs(redirectURIs)
	if err != nil {
		return nil, serializer.NewError(serializer.CodeParamErr, "redirect_uris is invalid", err)
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
		return nil, serializer.ErrDatabase.WithError(err)
	}

	return &OauthClientCreated{
		Client:       toOauthClientView(*client),
		ClientSecret: clientSecret,
	}, nil
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
		return serializer.NewError(serializer.CodeParamErr, "redirect_uris is invalid", err)
	}

	var client model.OauthClient
	if err := model.DB.First(&client, id).Error; err != nil {
		return serializer.NewError(serializer.CodeNotFound, "oauth client not found", err)
	}

	client.Name = trimmedName
	client.RedirectURIs = normalizedRedirectURIs
	if err := model.DB.Save(&client).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	return nil
}

func (s *oauthClientService) Delete(actorUserID uint, id uint) error {
	if err := RequirePermission(actorUserID, "system:oauth_client:delete"); err != nil {
		return err
	}

	if err := model.DB.Delete(&model.OauthClient{}, id).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	return nil
}

func (s *oauthClientService) RegenerateSecret(actorUserID uint, id uint) (string, error) {
	if err := RequirePermission(actorUserID, "system:oauth_client:secret"); err != nil {
		return "", err
	}

	var client model.OauthClient
	if err := model.DB.First(&client, id).Error; err != nil {
		return "", serializer.NewError(serializer.CodeNotFound, "oauth client not found", err)
	}

	newSecret, err := generateRandomString(32)
	if err != nil {
		return "", err
	}

	client.ClientSecret = newSecret
	if err := model.DB.Save(&client).Error; err != nil {
		return "", serializer.ErrDatabase.WithError(err)
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

func toOauthClientView(client model.OauthClient) OauthClientView {
	return OauthClientView{
		ID:           client.ID,
		ClientID:     client.ClientID,
		RedirectURIs: client.RedirectURIs,
		Name:         client.Name,
		CreatedAt:    client.CreatedAt,
		UpdatedAt:    client.UpdatedAt,
	}
}
