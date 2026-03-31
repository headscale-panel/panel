package constants

import "time"

const (
	DefaultPage     = 1
	DefaultPageSize = 20
	MaxPageSize     = 200

	SetupWindow = 30 * time.Minute

	AuthRateLimitCount  = 20
	AuthRateLimitWindow = 1 * time.Minute

	ServiceRequestTimeout = 30 * time.Second

	OIDCAuthCodeTTL     = 10 * time.Minute
	OIDCTokenTTL        = 1 * time.Hour
	OIDCRefreshTokenTTL = 30 * 24 * time.Hour
)
