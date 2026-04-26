package headscale

import (
	"context"
	"crypto/tls"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/constants"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
)

type Client struct {
	Conn      *grpc.ClientConn
	Service   v1.HeadscaleServiceClient
	createdAt time.Time
}

var (
	GlobalClient *Client
	clientMu     sync.Mutex
)

// GetOrRefreshClient returns the current global gRPC client, reinitialising it
// if the connection has exceeded GRPCConnectionTTL or has not been created yet.
// Safe for concurrent use.
func GetOrRefreshClient() (*Client, error) {
	clientMu.Lock()
	defer clientMu.Unlock()

	if GlobalClient != nil && time.Since(GlobalClient.createdAt) < constants.GRPCConnectionTTL {
		return GlobalClient, nil
	}

	// Close stale connection before creating a new one.
	if GlobalClient != nil && GlobalClient.Conn != nil {
		_ = GlobalClient.Conn.Close()
		GlobalClient = nil
	}

	if err := initLocked(); err != nil {
		return nil, err
	}
	return GlobalClient, nil
}

func Init() error {
	clientMu.Lock()
	defer clientMu.Unlock()
	return initLocked()
}

// initLocked creates a new gRPC connection. Must be called with clientMu held.
func initLocked() error {
	addr := conf.Conf.Headscale.GRPCAddr
	apiKey := conf.Conf.Headscale.APIKey

	perRPC := &apiKeyAuth{
		apiKey:                 apiKey,
		allowInsecureTransport: conf.Conf.Headscale.Insecure,
	}

	var creds credentials.TransportCredentials
	if conf.Conf.Headscale.Insecure {
		creds = insecure.NewCredentials()
	} else {
		creds = credentials.NewTLS(&tls.Config{
			MinVersion: tls.VersionTLS12,
		})
	}

	opts := []grpc.DialOption{
		grpc.WithTransportCredentials(creds),
		grpc.WithPerRPCCredentials(perRPC),
	}

	conn, err := grpc.NewClient(addr, opts...)
	if err != nil {
		return err
	}

	GlobalClient = &Client{
		Conn:      conn,
		Service:   v1.NewHeadscaleServiceClient(conn),
		createdAt: time.Now(),
	}
	return nil
}

type apiKeyAuth struct {
	apiKey                 string
	allowInsecureTransport bool
}

func (a *apiKeyAuth) GetRequestMetadata(ctx context.Context, uri ...string) (map[string]string, error) {
	return map[string]string{
		"authorization": "Bearer " + a.apiKey,
	}, nil
}

func (a *apiKeyAuth) RequireTransportSecurity() bool {
	return !a.allowInsecureTransport
}

func Close() {
	clientMu.Lock()
	defer clientMu.Unlock()
	if GlobalClient != nil && GlobalClient.Conn != nil {
		_ = GlobalClient.Conn.Close()
		GlobalClient = nil
	}
}
