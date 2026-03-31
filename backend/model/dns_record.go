package model

import "time"

type DNSRecord struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"not null" json:"name"`           // 域名，如 git.example.net
	Type      string    `gorm:"not null;default:A" json:"type"` // A 或 AAAA
	Value     string    `gorm:"not null" json:"value"`          // IP 地址
	Comment   string    `json:"comment"`                        // 备注
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
