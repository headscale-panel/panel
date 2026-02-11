package model

import "gorm.io/gorm"

type OauthClient struct {
	gorm.Model
	ClientID     string `json:"client_id" gorm:"uniqueIndex"`
	ClientSecret string `json:"-"`
	RedirectURIs string `json:"redirect_uris"` // Comma separated
	Name         string `json:"name"`
}
