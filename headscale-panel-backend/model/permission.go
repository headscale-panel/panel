package model

import "gorm.io/gorm"

type Permission struct {
	gorm.Model
	Name string `json:"name"`                             // 权限名称，如 "创建用户"
	Code string `json:"code" gorm:"uniqueIndex;not null"` // 权限标识，如 "system:user:create"
	Type string `json:"type"`                             // 类型：menu, button, api
}
