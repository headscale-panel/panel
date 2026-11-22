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
	"errors"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/headscale"
	"headscale-panel/pkg/hsapi"
	"headscale-panel/pkg/unifyerror"
	"net/http"
	"strings"
	"sync"
	"time"
)

type headscaleInitService struct {
	mu sync.Mutex
}

var HeadscaleInitService = &headscaleInitService{}

// probeConfig builds a throwaway client for the supplied settings and probes it.
//
// The gate is the presence of /api/v1/health, not the version string: dev builds
// report an empty or Go pseudo-version even for a 0.30 commit, so a version
// comparison would reject a perfectly usable server.
func probeConfig(ctx context.Context, addr, apiKey string, insecure, tlsSkipVerify bool, caCert string) (hsapi.ProbeResult, string) {
	target := strings.TrimSpace(addr)
	if target == "" {
		return hsapi.ProbeResult{State: hsapi.StateUnreachable}, "headscale API address is required"
	}
	if strings.TrimSpace(apiKey) == "" {
		return hsapi.ProbeResult{State: hsapi.StateUnauthorized}, "headscale api key is required"
	}

	client, err := hsapi.New(hsapi.Config{
		BaseURL:       target,
		APIKey:        apiKey,
		Insecure:      insecure,
		TLSSkipVerify: tlsSkipVerify,
		TLSCACert:     caCert,
		Timeout:       5 * time.Second,
	})
	if err != nil {
		return hsapi.ProbeResult{State: hsapi.StateUnreachable}, err.Error()
	}

	probeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	res := client.Probe(probeCtx)
	if res.State == hsapi.StateOK {
		return res, "headscale API reachable"
	}

	detail := res.Detail
	if detail == "" {
		detail = string(res.State)
	}
	return res, detail
}

// CheckHeadscaleConnectivityWithConfig verifies that the supplied settings can
// make authenticated API calls to headscale.
func CheckHeadscaleConnectivityWithConfig(ctx context.Context, addr, apiKey string, insecure, tlsSkipVerify bool, caCert string) (bool, string) {
	res, detail := probeConfig(ctx, addr, apiKey, insecure, tlsSkipVerify, caCert)
	return res.State == hsapi.StateOK, detail
}

// CheckCurrentConfigConnectivity verifies whether the current runtime Headscale
// configuration is reachable.
func (s *headscaleInitService) CheckCurrentConfigConnectivity(ctx context.Context) error {
	res, detail := probeConfig(
		ctx,
		conf.Conf.Headscale.APIAddr,
		conf.Conf.Headscale.APIKey,
		conf.Conf.Headscale.Insecure,
		conf.Conf.Headscale.TLSSkipVerify,
		conf.Conf.Headscale.TLSCACert,
	)
	if res.State != hsapi.StateOK {
		return unifyerror.New(http.StatusOK, unifyerror.CodeHeadscaleAPIErr, detail)
	}

	return nil
}

// InitializeFromCurrentConfig runs all startup tasks that require a live
// Headscale connection.
func (s *headscaleInitService) InitializeFromCurrentConfig(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.CheckCurrentConfigConnectivity(ctx); err != nil {
		return err
	}

	headscale.Close()
	if err := headscale.Init(); err != nil {
		return unifyerror.New(http.StatusOK, unifyerror.CodeHeadscaleAPIErr, "failed to initialize headscale client")
	}

	if err := ACLService.InitPolicyWithContext(ctx); err != nil {
		return unifyerror.New(http.StatusOK, unifyerror.CodeHeadscaleAPIErr, "failed to initialize ACL policy")
	}

	return nil
}

// SaveConnectionAndInitialize persists Headscale connection settings, then
// initializes runtime clients. If either step fails, the runtime config is
// rolled back to its previous values.
func SaveConnectionAndInitialize(ctx context.Context, apiAddr, apiKey string, insecure, tlsSkipVerify bool, caCert string) error {
	apiAddr = strings.TrimSpace(apiAddr)
	if apiAddr == "" {
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "headscale API address is required")
	}

	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "headscale api key is required")
	}

	old := conf.Conf.Headscale
	conf.Conf.Headscale.APIAddr = apiAddr
	conf.Conf.Headscale.APIKey = apiKey
	conf.Conf.Headscale.Insecure = insecure
	conf.Conf.Headscale.TLSSkipVerify = tlsSkipVerify
	conf.Conf.Headscale.TLSCACert = caCert

	if err := Persist(apiAddr, apiKey, insecure, tlsSkipVerify, caCert); err != nil {
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

// isNoPolicy reports whether err means the policy has never been stored, as
// opposed to a failed read.
//
// headscale answers HTTP 500 for both cases, so mistaking one for the other is
// how a transient database error turns into a wiped ACL. Only the documented
// sentinel counts.
func isNoPolicy(err error) bool {
	return errors.Is(err, hsapi.ErrNoPolicy)
}
