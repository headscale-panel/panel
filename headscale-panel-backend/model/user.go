package model

import (
	"headscale-panel/pkg/utils/password"

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
	HeadscaleName string `json:"headscale_name" gorm:"uniqueIndex"` // Maps to Headscale User Name
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
	// 只有当密码字段被修改且不是空时才加密
	// 注意：这里简单处理，实际更新密码时需要小心
	// 如果是更新操作且密码未变（通常不会传空密码进来更新），则不处理
	// 这里假设业务层只在需要修改密码时才设置 Password 字段
	if u.Password != "" && len(u.Password) < 60 {
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
