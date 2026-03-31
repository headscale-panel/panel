package services

import (
	"context"
	"headscale-panel/pkg/constants"
)

func withServiceTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	if ctx == nil {
		ctx = context.Background()
	}
	if _, hasDeadline := ctx.Deadline(); hasDeadline {
		return context.WithCancel(ctx)
	}
	return context.WithTimeout(ctx, constants.ServiceRequestTimeout)
}
