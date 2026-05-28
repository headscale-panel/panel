// Copyright (C) 2026
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

package services

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/headscale"
	"headscale-panel/pkg/unifyerror"
	"net/http"
	"strings"
	"sync"
	"time"

	v1 "github.com/juanfont/headscale/gen/go/headscale/v1"

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
func CheckHeadscaleConnectivityWithConfig(ctx context.Context, addr, apiKey string, allowInsecure, tlsSkipVerify bool, caCert string) (bool, string) {
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
		tlsCfg := &tls.Config{
			MinVersion:         tls.VersionTLS12,
			InsecureSkipVerify: tlsSkipVerify, //nolint:gosec // user-opt-in for self-signed certs
		}
		if caCert != "" && !tlsSkipVerify {
			pool := x509.NewCertPool()
			if !pool.AppendCertsFromPEM([]byte(caCert)) {
				return false, "failed to parse CA certificate PEM"
			}
			tlsCfg.RootCAs = pool
		}
		transport = credentials.NewTLS(tlsCfg)
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
		conf.Conf.Headscale.TLSSkipVerify,
		conf.Conf.Headscale.TLSCACert,
	)
	if !ok {
		return unifyerror.New(http.StatusOK, unifyerror.CodeGRPCErr, detail)
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
		return unifyerror.New(http.StatusOK, unifyerror.CodeGRPCErr, "failed to initialize headscale client")
	}

	if err := ACLService.InitPolicyWithContext(ctx); err != nil {
		return unifyerror.New(http.StatusOK, unifyerror.CodeGRPCErr, "failed to initialize ACL policy")
	}

	return nil
}

// SaveConnectionAndInitialize persists Headscale connection settings, then initializes runtime clients.
// If persistence or initialization fails, runtime config is rolled back to the previous values.
func SaveConnectionAndInitialize(ctx context.Context, grpcAddr, apiKey string, insecure, tlsSkipVerify bool, caCert string) error {
	grpcAddr = strings.TrimSpace(grpcAddr)
	if grpcAddr == "" {
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "headscale grpc address is required")
	}

	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "headscale api key is required")
	}

	old := conf.Conf.Headscale
	conf.Conf.Headscale.GRPCAddr = grpcAddr
	conf.Conf.Headscale.APIKey = apiKey
	conf.Conf.Headscale.Insecure = insecure
	conf.Conf.Headscale.TLSSkipVerify = tlsSkipVerify
	conf.Conf.Headscale.TLSCACert = caCert

	if err := PersistHeadscaleConnection(grpcAddr, apiKey, insecure, tlsSkipVerify, caCert); err != nil {
		conf.Conf.Headscale = old
		return unifyerror.New(http.StatusInternalServerError, unifyerror.CodeDBErr, "failed to persist Headscale connection settings to DB")
	}

	if err := HeadscaleInitService.InitializeFromCurrentConfig(ctx); err != nil {
		conf.Conf.Headscale = old
		headscale.Close()
		_ = headscale.Init()
		return err
	}

	return nil
}
