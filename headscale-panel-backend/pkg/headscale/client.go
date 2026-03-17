package headscale

import (
	"context"
	"crypto/tls"
	"fmt"
	"headscale-panel/pkg/conf"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"time"

	"github.com/sirupsen/logrus"
	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
)

type Client struct {
	Conn    *grpc.ClientConn
	Service v1.HeadscaleServiceClient
}

var GlobalClient *Client

func Init() error {
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

	// Wait for the gRPC connection to be ready before serving requests.
	if err := waitForReady(conn, 30*time.Second); err != nil {
		conn.Close()
		return fmt.Errorf("headscale gRPC not reachable at %s: %w", addr, err)
	}

	client := v1.NewHeadscaleServiceClient(conn)

	GlobalClient = &Client{
		Conn:    conn,
		Service: client,
	}
	return nil
}

// waitForReady blocks until the gRPC connection reaches READY state or the timeout expires.
func waitForReady(conn *grpc.ClientConn, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	// Trigger the lazy connection by requesting a state change from IDLE.
	conn.Connect()

	for {
		state := conn.GetState()
		if state == connectivity.Ready {
			logrus.Info("Headscale gRPC connection is ready")
			return nil
		}
		if state == connectivity.Shutdown {
			return fmt.Errorf("connection shut down")
		}
		logrus.Infof("Waiting for Headscale gRPC connection (state: %s)...", state)
		if !conn.WaitForStateChange(ctx, state) {
			return fmt.Errorf("timeout waiting for gRPC connection (last state: %s)", state)
		}
	}
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
	if GlobalClient != nil && GlobalClient.Conn != nil {
		GlobalClient.Conn.Close()
	}
}
