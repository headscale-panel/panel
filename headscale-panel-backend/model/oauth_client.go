package model

import "gorm.io/gorm"

type OauthClient struct {
	gorm.Model
	ClientID         string `json:"client_id" gorm:"uniqueIndex"`
	ClientSecret     string `json:"-" gorm:"column:client_secret"` // Deprecated: legacy plaintext, kept only for migration.
	ClientSecretHash string `json:"-" gorm:"column:client_secret_hash"`
	RedirectURIs     string `json:"redirect_uris"` // Comma separated
	Name             string `json:"name"`
}
