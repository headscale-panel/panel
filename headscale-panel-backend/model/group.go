package model

import "gorm.io/gorm"

type Group struct {
	gorm.Model
	Name        string       `json:"name" gorm:"uniqueIndex;not null"`
	Permissions []Permission `json:"permissions" gorm:"many2many:group_permissions;"`
	Users       []User       `json:"-"`
}
