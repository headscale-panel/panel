package services

import (
	"context"
	"crypto/tls"
	"fmt"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/headscale"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"headscale-panel/pkg/utils/serializer"
	"strings"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

type headscaleInitService struct {
	mu sync.Mutex
}

var HeadscaleInitService = &headscaleInitService{}

// CheckHeadscaleConnectivityWithConfig verifies the provided Headscale config can make API calls.
func CheckHeadscaleConnectivityWithConfig(ctx context.Context, addr, apiKey string, allowInsecure bool) (bool, string) {
	targetAddr := strings.TrimSpace(addr)
	if targetAddr == "" {
		return false, "headscale gRPC address is required"
	}

	token := strings.TrimSpace(apiKey)
	if token == "" {
		return false, "headscale api key is required"
	}

	var transport credentials.TransportCredentials
	if allowInsecure {
		transport = insecure.NewCredentials()
	} else {
		transport = credentials.NewTLS(&tls.Config{MinVersion: tls.VersionTLS12})
	}

	conn, err := grpc.NewClient(targetAddr, grpc.WithTransportCredentials(transport))
	if err != nil {
		return false, fmt.Sprintf("grpc client init failed: %v", err)
	}
	defer conn.Close()

	client := v1.NewHeadscaleServiceClient(conn)
	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	queryCtx = metadata.AppendToOutgoingContext(queryCtx, "authorization", "Bearer "+token)

	if _, err := client.ListUsers(queryCtx, &v1.ListUsersRequest{}); err != nil {
		return false, fmt.Sprintf("headscale api request failed: %v", err)
	}

	return true, "headscale api reachable"
}

// CheckCurrentConfigConnectivity verifies whether current runtime Headscale configuration is reachable.
func (s *headscaleInitService) CheckCurrentConfigConnectivity(ctx context.Context) error {
	ok, detail := CheckHeadscaleConnectivityWithConfig(
		ctx,
		conf.Conf.Headscale.GRPCAddr,
		conf.Conf.Headscale.APIKey,
		conf.Conf.Headscale.Insecure,
	)
	if !ok {
		return serializer.NewError(serializer.CodeThirdPartyServiceError, detail, nil)
	}

	return nil
}

// InitializeFromCurrentConfig runs all startup tasks that require a live Headscale connection.
func (s *headscaleInitService) InitializeFromCurrentConfig(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.CheckCurrentConfigConnectivity(ctx); err != nil {
		return err
	}

	headscale.Close()
	if err := headscale.Init(); err != nil {
		return serializer.NewError(serializer.CodeThirdPartyServiceError, "failed to initialize headscale client", err)
	}

	if err := ACLService.InitPolicyWithContext(ctx); err != nil {
		return serializer.NewError(serializer.CodeThirdPartyServiceError, "failed to initialize ACL policy", err)
	}

	return nil
}

// SaveConnectionAndInitialize persists Headscale connection settings, then initializes runtime clients.
// If persistence or initialization fails, runtime config is rolled back to the previous values.
func SaveConnectionAndInitialize(ctx context.Context, grpcAddr, apiKey string, insecure bool) error {
	grpcAddr = strings.TrimSpace(grpcAddr)
	if grpcAddr == "" {
		return serializer.NewError(serializer.CodeParamErr, "headscale grpc address is required", nil)
	}

	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return serializer.NewError(serializer.CodeParamErr, "headscale api key is required", nil)
	}

	old := conf.Conf.Headscale
	conf.Conf.Headscale.GRPCAddr = grpcAddr
	conf.Conf.Headscale.APIKey = apiKey
	conf.Conf.Headscale.Insecure = insecure

	if err := PersistHeadscaleConnection(grpcAddr, apiKey, insecure); err != nil {
		conf.Conf.Headscale = old
		return serializer.NewError(serializer.CodeDBError, "failed to persist Headscale connection settings to DB", err)
	}

	if err := HeadscaleInitService.InitializeFromCurrentConfig(ctx); err != nil {
		conf.Conf.Headscale = old
		headscale.Close()
		_ = headscale.Init()
		return err
	}

	return nil
}
