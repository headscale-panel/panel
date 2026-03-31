package services

import (
	"context"
	"time"
)

const serviceRequestTimeout = 30 * time.Second

func withServiceTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	if ctx == nil {
		ctx = context.Background()
	}
	if _, hasDeadline := ctx.Deadline(); hasDeadline {
		return context.WithCancel(ctx)
	}
	return context.WithTimeout(ctx, serviceRequestTimeout)
}
