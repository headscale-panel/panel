package model

import "gorm.io/gorm"

type ACLPolicy struct {
	gorm.Model
	Version   int    `json:"version"`
	Content   string `json:"content" gorm:"type:text"` // JSON content
	CreatedBy uint   `json:"created_by"`
}
