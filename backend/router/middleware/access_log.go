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
	"crypto/rand"
	"encoding/hex"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/log"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

const (
	// RequestIDHeader is both read (to honour an upstream id) and written back so
	// a user can quote it from the UI when reporting a problem.
	RequestIDHeader = constants.RequestIDHeader
	// RequestIDKey is the gin context key holding the id for handlers and
	// unifyerror to pick up.
	RequestIDKey = constants.RequestIDKey
)

// RequestIDMiddleware assigns every request a correlation id.
//
// An inbound X-Request-Id is reused when present, so a reverse proxy or ingress
// can own the id, but its length and charset are bounded before it is trusted
// for logging.
func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := sanitizeRequestID(c.GetHeader(RequestIDHeader))
		if id == "" {
			id = newRequestID()
		}

		c.Set(RequestIDKey, id)
		c.Writer.Header().Set(RequestIDHeader, id)
		c.Next()
	}
}

func sanitizeRequestID(raw string) string {
	if raw == "" || len(raw) > 64 {
		return ""
	}
	for _, r := range raw {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
		default:
			return ""
		}
	}
	return raw
}

func newRequestID() string {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		return ""
	}
	return hex.EncodeToString(buf)
}

// AccessLogMiddleware replaces gin's plain-text access logger with a structured
// one. Health probes are skipped so they cannot drown real traffic.
func AccessLogMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if isQuietPath(c.Request.URL.Path) {
			c.Next()
			return
		}

		start := time.Now()
		c.Next()

		status := c.Writer.Status()
		result := log.ResultOK
		if status >= 400 {
			result = log.ResultError
		}

		fields := []zap.Field{
			zap.String(log.FieldRequestID, c.GetString(RequestIDKey)),
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.Int("status", status),
			zap.Float64(log.FieldDurationMS, float64(time.Since(start).Microseconds())/1000.0),
			zap.String(log.FieldResult, result),
		}
		if actorID := c.GetUint("userID"); actorID != 0 {
			fields = append(fields, zap.Uint("actor_id", actorID))
		}

		if result == log.ResultError {
			log.L.Warn("request", fields...)
			return
		}
		log.L.Info("request", fields...)
	}
}

func isQuietPath(path string) bool {
	switch path {
	case "/healthz", "/readyz", "/metrics", "/panel/api/v1/health":
		return true
	}
	return false
}
