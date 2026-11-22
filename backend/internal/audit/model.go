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

package audit

import (
	"time"
)

// Event is one audited action.
//
// The table is append-only by design: it is the record of what the panel did,
// so there is no update or delete path. Retention is handled by archiving whole
// rows (never by mutating them).
type Event struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `gorm:"index" json:"created_at"`

	ActorID   uint   `gorm:"index" json:"actor_id"`
	ActorName string `gorm:"size:64" json:"actor_name"`

	Action   string `gorm:"size:32;index" json:"action"`
	Resource string `gorm:"size:96;index" json:"resource"`
	Method   string `gorm:"size:8" json:"method"`
	Path     string `gorm:"size:512" json:"path"`

	StatusCode int  `gorm:"index" json:"status_code"`
	Success    bool `gorm:"index" json:"success"`

	ClientIP  string `gorm:"size:64" json:"client_ip"`
	UserAgent string `gorm:"size:512" json:"user_agent"`
	RequestID string `gorm:"size:64;index" json:"request_id"`

	DurationMS int64 `json:"duration_ms"`

	// Details carries action-specific context (which pre-auth key was created,
	// which account a binding moved to). It must never contain credentials:
	// the middleware that fills it deliberately does not read request bodies.
	Details string `gorm:"type:text" json:"details"`
}

func (Event) TableName() string { return "audit_events" }

// Models returns every model the audit domain owns.
func Models() []any {
	return []any{&Event{}}
}
