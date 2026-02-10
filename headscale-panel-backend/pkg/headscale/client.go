package headscale

import (
	"context"
	"crypto/tls"
	"headscale-panel/pkg/conf"
	v1 "headscale-panel/pkg/proto/headscale/v1"

	"google.golang.org/grpc"
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

	perRPC := &apiKeyAuth{apiKey: apiKey}

	var creds credentials.TransportCredentials
	if conf.Conf.Headscale.Insecure {
		creds = insecure.NewCredentials()
	} else {
		creds = credentials.NewTLS(&tls.Config{
			InsecureSkipVerify: true,
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

	client := v1.NewHeadscaleServiceClient(conn)

	GlobalClient = &Client{
		Conn:    conn,
		Service: client,
	}
	return nil
}

type apiKeyAuth struct {
	apiKey string
}

func (a *apiKeyAuth) GetRequestMetadata(ctx context.Context, uri ...string) (map[string]string, error) {
	return map[string]string{
		"authorization": "Bearer " + a.apiKey,
	}, nil
}

func (a *apiKeyAuth) RequireTransportSecurity() bool {
	return false
}

func Close() {
	if GlobalClient != nil && GlobalClient.Conn != nil {
		GlobalClient.Conn.Close()
	}
}
