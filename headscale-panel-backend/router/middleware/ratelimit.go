package middleware

import (
	"headscale-panel/pkg/utils/serializer"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type ipRecord struct {
	count     int
	windowEnd time.Time
}

// RateLimiter implements a simple fixed-window rate limiter per client IP.
type RateLimiter struct {
	mu      sync.Mutex
	records map[string]*ipRecord
	limit   int
	window  time.Duration
}

// NewRateLimiter creates a rate limiter that allows limit requests per window duration per IP.
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		records: make(map[string]*ipRecord),
		limit:   limit,
		window:  window,
	}
}

func (rl *RateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()

	// Lazy cleanup when map grows too large
	if len(rl.records) > 10000 {
		for k, v := range rl.records {
			if now.After(v.windowEnd) {
				delete(rl.records, k)
			}
		}
	}

	rec, exists := rl.records[ip]
	if !exists || now.After(rec.windowEnd) {
		rl.records[ip] = &ipRecord{
			count:     1,
			windowEnd: now.Add(rl.window),
		}
		return true
	}

	rec.count++
	return rec.count <= rl.limit
}

// RateLimitMiddleware returns a Gin middleware that rate-limits requests by client IP.
func RateLimitMiddleware(limiter *RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !limiter.allow(c.ClientIP()) {
			c.JSON(http.StatusTooManyRequests, serializer.Response{
				Code: http.StatusTooManyRequests,
				Msg:  "too many requests, please try again later",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}
