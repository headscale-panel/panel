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

package network

import (
	"time"
)

// Binding ties one headscale user to one panel account.
//
// It stores the headscale user id and nothing else that could go stale: name,
// email and provider are re-read from headscale on every render. The cached
// columns exist so the account list can show something recognisable when
// headscale is unreachable, and are refreshed on each successful read.
type Binding struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	AccountID uint   `gorm:"not null;index" json:"account_id"`
	HSUserID  uint64 `gorm:"uniqueIndex;not null" json:"hs_user_id"`

	// IsPrimary marks the identity used when a device must be attributed to
	// exactly one account. At most one binding per account may be primary;
	// the service enforces that inside a transaction because the constraint is
	// partial (WHERE is_primary), which GORM cannot express portably.
	IsPrimary bool `gorm:"not null;default:false;index" json:"is_primary"`

	HSCachedName  string     `gorm:"size:128" json:"hs_cached_name"`
	HSCachedEmail string     `gorm:"size:255" json:"hs_cached_email"`
	HSCachedAt    *time.Time `json:"hs_cached_at"`
}

func (Binding) TableName() string { return "network_bindings" }

// Models returns every model the network domain owns.
func Models() []any {
	return []any{&Binding{}}
}
