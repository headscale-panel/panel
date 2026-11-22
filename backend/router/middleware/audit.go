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
	"headscale-panel/internal/audit"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/log"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// AuditMiddleware records every authenticated write.
//
// It deliberately reads only the method, the path, the status and the caller
// identity. Bodies, query strings and the Authorization header are never
// touched: those are exactly where credentials and secrets live, and an audit
// log that leaks them is worse than no audit log.
func AuditMiddleware(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !isAuditableMethod(c.Request.Method) {
			c.Next()
			return
		}

		start := time.Now()
		c.Next()

		status := c.Writer.Status()
		event := &audit.Event{
			ActorID:    c.GetUint("userID"),
			ActorName:  c.GetString("username"),
			Action:     audit.DeriveAction(c.Request.Method, c.Request.URL.Path),
			Resource:   audit.DeriveResource(c.Request.URL.Path),
			Method:     c.Request.Method,
			Path:       c.Request.URL.Path,
			StatusCode: status,
			Success:    status < 400,
			ClientIP:   c.ClientIP(),
			UserAgent:  c.Request.UserAgent(),
			RequestID:  c.GetString(constants.RequestIDKey),
			DurationMS: time.Since(start).Milliseconds(),
			// Route parameters identify which object was touched. They are read from
			// the matched route, never from the body or query, so this cannot leak a
			// credential.
			Details: buildDetails(c),
		}

		if err := db.Create(event).Error; err != nil {
			// Losing an audit row must be visible, but must not fail the request
			// that already succeeded.
			log.L.Error("failed to write audit event",
				zap.Error(err),
				zap.String(log.FieldRequestID, event.RequestID),
				zap.String("path", event.Path))
		}
	}
}

func isAuditableMethod(method string) bool {
	switch method {
	case "POST", "PUT", "PATCH", "DELETE":
		return true
	}
	return false
}
