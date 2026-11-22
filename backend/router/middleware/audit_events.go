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

package middleware

import (
	"encoding/json"
	"time"

	"headscale-panel/internal/audit"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/log"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// detailsEntry is the structured context attached to an audit row.
//
// It holds route parameters because those identify *which* object was touched —
// the part a human needs when reading the log. It cannot hold request bodies:
// the middleware never reads them, since that is where credentials live.
type detailsEntry struct {
	Params map[string]string `json:"params,omitempty"`
}

// buildDetails renders the route parameters as JSON, or an empty string when there
// are none.
func buildDetails(c *gin.Context) string {
	if len(c.Params) == 0 {
		return ""
	}

	params := make(map[string]string, len(c.Params))
	for _, param := range c.Params {
		params[param.Key] = param.Value
	}

	encoded, err := json.Marshal(detailsEntry{Params: params})
	if err != nil {
		return ""
	}
	return string(encoded)
}

// RecordAuthEvent writes an audit row for an authentication event.
//
// Login, logout and the SSO callbacks sit outside the authenticated group, so the
// write-middleware never sees them. Without this, the audit log could not answer
// "who tried to sign in and did it work", which is the first question asked after
// a break-in.
//
// username is recorded even on failure: an attempt against a guessed account name
// is exactly what an operator needs to see.
func RecordAuthEvent(c *gin.Context, db *gorm.DB, action, username string, actorID uint, success bool, detail string) {
	if db == nil {
		return
	}

	status := 200
	if !success {
		status = 401
	}

	event := &audit.Event{
		ActorID:    actorID,
		ActorName:  username,
		Action:     action,
		Resource:   "auth",
		Method:     c.Request.Method,
		Path:       c.Request.URL.Path,
		StatusCode: status,
		Success:    success,
		ClientIP:   c.ClientIP(),
		UserAgent:  c.Request.UserAgent(),
		RequestID:  c.GetString(constants.RequestIDKey),
		DurationMS: 0,
	}

	if detail != "" {
		// Only a short, already-safe reason string goes in here; callers must not
		// pass anything derived from the submitted credential.
		encoded, err := json.Marshal(detailsEntry{Params: map[string]string{"detail": truncateDetail(detail)}})
		if err == nil {
			event.Details = string(encoded)
		}
	}

	event.CreatedAt = time.Now()

	if err := db.Create(event).Error; err != nil {
		log.L.Error("failed to write auth audit event",
			zap.Error(err),
			zap.String("action", action),
			zap.String("request_id", event.RequestID))
	}
}

// truncateDetail keeps a failure reason to a length the column can hold.
func truncateDetail(text string) string {
	const limit = 200
	if len(text) <= limit {
		return text
	}
	return text[:limit]
}
