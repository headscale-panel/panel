package model

import "gorm.io/gorm"

// PanelSetting is a generic key-value store for panel-level settings.
type PanelSetting struct {
	gorm.Model
	Key   string `gorm:"uniqueIndex;size:128;not null" json:"key"`
	Value string `gorm:"type:text" json:"value"`
}
