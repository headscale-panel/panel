package model

import "gorm.io/gorm"

// Resource represents a network host that can be used in ACL policies
type Resource struct {
	gorm.Model
	Name        string `json:"name" gorm:"uniqueIndex;not null"` // Host alias, e.g., "gitlab", "nginx"
	IPAddress   string `json:"ip_address" gorm:"not null"`       // IP address or CIDR, e.g., "192.168.1.100" or "192.168.1.0/24"
	Port        string `json:"port"`                             // Optional port(s), e.g., "80,443" or "22,80,443,3000-9000"
	Description string `json:"description"`
	CreatorID   uint   `json:"creator_id"`
	Creator     User   `json:"-" gorm:"foreignKey:CreatorID"`
}
