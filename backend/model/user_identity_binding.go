package model

import "gorm.io/gorm"

// UserIdentityBinding represents the binding between a Panel Account and a
// Headscale / Tailscale network identity. A single Panel Account may be bound
// to multiple network identities, but exactly one should be marked as primary.
type UserIdentityBinding struct {
	gorm.Model
	UserID        uint   `json:"user_id" gorm:"index;not null"`
	User          User   `json:"-" gorm:"foreignKey:UserID"`
	HeadscaleID   uint64 `json:"headscale_id"`
	HeadscaleName string `json:"headscale_name" gorm:"index;not null"`
	DisplayName   string `json:"display_name"`
	Email         string `json:"email"`
	Provider      string `json:"provider"`
	IsPrimary     bool   `json:"is_primary" gorm:"default:false"`
}
