// Copyright (C) 2026 
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

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
