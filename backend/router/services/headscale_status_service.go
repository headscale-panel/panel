package services

import (
	"context"
	"headscale-panel/pkg/headscale"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"time"
)

type headscaleStatusService struct{}

var HeadscaleStatusService = new(headscaleStatusService)

// HeadscaleServerStatus represents the liveness status of the Headscale gRPC
// service as observed from the panel.
type HeadscaleServerStatus struct {
	Running bool `json:"running"`
}

// GetHeadscaleServerStatus performs a lightweight gRPC probe (ListUsers with
// a 5-second timeout) to determine whether the Headscale server is reachable.
func (s *headscaleStatusService) GetHeadscaleServerStatus() HeadscaleServerStatus {
	client, err := headscale.GetOrRefreshClient()
	if err != nil || client == nil || client.Service == nil {
		return HeadscaleServerStatus{Running: false}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err = client.Service.ListUsers(ctx, &v1.ListUsersRequest{})
	return HeadscaleServerStatus{Running: err == nil}
}
