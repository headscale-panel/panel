package middleware

import (
	"headscale-panel/pkg/unifyerror"
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
	rl := &RateLimiter{
		records: make(map[string]*ipRecord),
		limit:   limit,
		window:  window,
	}
	go rl.periodicCleanup()
	return rl
}

// periodicCleanup removes expired entries every minute to prevent unbounded memory growth.
func (rl *RateLimiter) periodicCleanup() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		rl.mu.Lock()
		now := time.Now()
		for k, v := range rl.records {
			if now.After(v.windowEnd) {
				delete(rl.records, k)
			}
		}
		rl.mu.Unlock()
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
			c.JSON(http.StatusTooManyRequests, unifyerror.Response{
				Code: http.StatusTooManyRequests,
				Msg:  "too many requests, please try again later",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}
