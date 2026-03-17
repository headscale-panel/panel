package model

import (
	"headscale-panel/pkg/utils/password"
	"strings"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	Username string `json:"username" gorm:"uniqueIndex;not null"`
	Password string `json:"-"` // JSON 中不返回密码
	Email    string `json:"email"`
	GroupID  uint   `json:"group_id"`
	Group    Group  `json:"group"`

	// Headscale fields
	HeadscaleName string `json:"headscale_name" gorm:"index"` // Maps to Headscale User Name
	DisplayName   string `json:"display_name"`
	Provider      string `json:"provider"` // "local", "github", etc.
	ProviderID    string `json:"provider_id"`
	ProfilePicURL string `json:"profile_pic_url"`

	// TOTP
	TOTPSecret  string `json:"-"`
	TOTPEnabled bool   `json:"totp_enabled"`
}

// BeforeSave encrypts the password before saving to the database
func (u *User) BeforeSave(tx *gorm.DB) (err error) {
	if u.Password != "" && !isBcryptHash(u.Password) {
		encrypted, err := password.Encrypt(u.Password)
		if err != nil {
			return err
		}
		u.Password = encrypted
	}
	return
}

func (u *User) CheckPassword(pwd string) bool {
	return password.Compare(u.Password, pwd)
}

func isBcryptHash(value string) bool {
	if !strings.HasPrefix(value, "$2") {
		return false
	}
	_, err := bcrypt.Cost([]byte(value))
	return err == nil
}
