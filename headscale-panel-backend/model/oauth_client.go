package model

import "gorm.io/gorm"

type OauthClient struct {
	gorm.Model
	ClientID     string `json:"client_id" gorm:"uniqueIndex"`
	ClientSecret string `json:"client_secret"`
	RedirectURIs string `json:"redirect_uris"` // Comma separated
	Name         string `json:"name"`
}
