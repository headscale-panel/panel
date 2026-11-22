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
	"encoding/json"
	"headscale-panel/internal/network"
	"headscale-panel/model"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/headscale"
	"headscale-panel/pkg/hsapi"
	"headscale-panel/pkg/log"
	"headscale-panel/pkg/unifyerror"
	"net/http"
	"strings"

	"go.uber.org/zap"
)

const connectionSettingKey = "headscale_connection"

// ConnectionSettings is the Headscale connection config as the UI sees it.
//
// The API key is never returned: the response only says whether one exists.
type ConnectionSettings struct {
	APIAddr       string `json:"api_addr"`
	Insecure      bool   `json:"insecure"`
	TLSSkipVerify bool   `json:"tls_skip_verify"`
	TLSCACert     string `json:"tls_ca_cert,omitempty"`
	HasAPIKey     bool   `json:"has_api_key"`
	IsConfigured  bool   `json:"is_configured"`
}

// ConnectionState is the live reachability result.
type ConnectionState struct {
	State       string `json:"state"`
	Detail      string `json:"detail"`
	Commit      string `json:"commit,omitempty"`
	InBaseline  bool   `json:"in_baseline"`
	BaselineTip string `json:"baseline_commit,omitempty"`
}

// connectionPayload is the stored representation.
type connectionPayload struct {
	APIAddr         string `json:"api_addr"`
	APIKeyEncrypted string `json:"api_key_enc,omitempty"`
	Insecure        bool   `json:"insecure"`
	TLSSkipVerify   bool   `json:"tls_skip_verify"`
	TLSCACert       string `json:"tls_ca_cert,omitempty"`

	// LegacyGRPCAddr holds a pre-0.30 gRPC endpoint from an old settings row.
	//
	// A gRPC port cannot be converted into an HTTP API address, so this is read
	// only. Its presence is what lets the panel tell the operator to re-enter
	// the address instead of silently failing to connect.
	LegacyGRPCAddr string `json:"grpc_addr,omitempty"`
}

type connectionServiceSettings struct{}

// ConnectionSettingsService manages the Headscale connection config.
var ConnectionSettingsService = new(connectionServiceSettings)

// Get returns the current connection settings.
func (s *connectionServiceSettings) Get(actorUserID uint) (*ConnectionSettings, error) {
	if err := RequirePermission(actorUserID, constants.PermSystemConfigRead); err != nil {
		return nil, err
	}

	return &ConnectionSettings{
		APIAddr:       conf.Conf.Headscale.APIAddr,
		Insecure:      conf.Conf.Headscale.Insecure,
		TLSSkipVerify: conf.Conf.Headscale.TLSSkipVerify,
		TLSCACert:     conf.Conf.Headscale.TLSCACert,
		HasAPIKey:     strings.TrimSpace(conf.Conf.Headscale.APIKey) != "",
		IsConfigured:  headscale.Connected(),
	}, nil
}

// SaveInput is the connection update payload.
type SaveInput struct {
	APIAddr       string
	APIKey        string
	Insecure      bool
	TLSSkipVerify bool
	TLSCACert     string
}

// Save validates, persists and reconnects.
func (s *connectionServiceSettings) Save(ctx context.Context, actorUserID uint, in SaveInput) error {
	if err := RequirePermission(actorUserID, constants.PermSystemConfigUpdate); err != nil {
		return err
	}

	apiAddr := strings.TrimSpace(in.APIAddr)
	if apiAddr == "" {
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, constants.MsgAPIAddrEmpty)
	}

	apiKey := strings.TrimSpace(in.APIKey)
	if apiKey == "" {
		// Only reuse the stored API key when the target address is unchanged.
		// Otherwise an operator could point api_addr at an external listener
		// and exfiltrate the redacted credential.
		if sameAPIAddr(apiAddr, conf.Conf.Headscale.APIAddr) {
			apiKey = conf.Conf.Headscale.APIKey
		} else {
			return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr,
				"API key is required when changing the Headscale API address")
		}
	}
	if apiKey == "" {
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, constants.MsgAPIKeyEmpty)
	}

	return SaveConnectionAndInitialize(ctx, apiAddr, apiKey, in.Insecure, in.TLSSkipVerify, in.TLSCACert)
}

// Test probes a candidate configuration without persisting it.
func (s *connectionServiceSettings) Test(ctx context.Context, actorUserID uint, in SaveInput) (*ConnectionState, error) {
	if err := RequirePermission(actorUserID, constants.PermSystemConfigUpdate); err != nil {
		return nil, err
	}

	apiAddr := strings.TrimSpace(in.APIAddr)
	if apiAddr == "" {
		apiAddr = conf.Conf.Headscale.APIAddr
	}
	apiKey := strings.TrimSpace(in.APIKey)
	if apiKey == "" {
		if sameAPIAddr(apiAddr, conf.Conf.Headscale.APIAddr) {
			apiKey = conf.Conf.Headscale.APIKey
		} else {
			return nil, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr,
				"API key is required when testing a different Headscale API address")
		}
	}

	result := probeConnection(ctx, apiAddr, apiKey, in.Insecure, in.TLSSkipVerify, in.TLSCACert)
	return &ConnectionState{
		State:       string(result.State),
		Detail:      result.Detail,
		Commit:      result.Commit,
		InBaseline:  result.Baseline == hsapi.BaselineMatch,
		BaselineTip: hsapi.AdaptedHeadscaleCommit,
	}, nil
}

func sameAPIAddr(a, b string) bool {
	na := strings.TrimRight(strings.TrimSpace(a), "/")
	nb := strings.TrimRight(strings.TrimSpace(b), "/")
	if na == "" || nb == "" {
		return false
	}
	return strings.EqualFold(na, nb)
}

// probeConnection validates the inputs, then asks the server what it supports.
func probeConnection(ctx context.Context, apiAddr, apiKey string, insecure, tlsSkipVerify bool, tlsCACert string) hsapi.ProbeResult {
	if strings.TrimSpace(apiAddr) == "" {
		return hsapi.ProbeResult{State: hsapi.StateUnreachable, Detail: "no API address configured"}
	}
	if strings.TrimSpace(apiKey) == "" {
		return hsapi.ProbeResult{State: hsapi.StateUnauthorized, Detail: "no API key configured"}
	}

	client, err := hsapi.New(hsapi.Config{
		BaseURL:       apiAddr,
		APIKey:        apiKey,
		Insecure:      insecure,
		TLSSkipVerify: tlsSkipVerify,
		TLSCACert:     tlsCACert,
	})
	if err != nil {
		return hsapi.ProbeResult{State: hsapi.StateUnreachable, Detail: err.Error()}
	}

	return client.Probe(ctx)
}

// Persist writes the connection settings to the database.
func Persist(apiAddr, apiKey string, insecure, tlsSkipVerify bool, tlsCACert string) error {
	sealed, err := Secrets.Encrypt(apiKey)
	if err != nil {
		return unifyerror.ServerError(err)
	}

	payload := connectionPayload{
		APIAddr:         apiAddr,
		APIKeyEncrypted: sealed,
		Insecure:        insecure,
		TLSSkipVerify:   tlsSkipVerify,
		TLSCACert:       tlsCACert,
	}
	raw, marshalErr := json.Marshal(payload)
	if marshalErr != nil {
		return unifyerror.ServerError(marshalErr)
	}

	var setting model.PanelSetting
	err = model.DB.Where("key = ?", connectionSettingKey).First(&setting).Error
	if err != nil {
		setting = model.PanelSetting{Key: connectionSettingKey, Value: string(raw)}
		if createErr := model.DB.Create(&setting).Error; createErr != nil {
			return unifyerror.DbError(createErr)
		}
		return nil
	}

	setting.Value = string(raw)
	if saveErr := model.DB.Save(&setting).Error; saveErr != nil {
		return unifyerror.DbError(saveErr)
	}
	return nil
}

// LoadConnectionFromDB restores the persisted connection settings into the
// runtime config. Returns true when settings were found and applied.
func LoadConnectionFromDB() bool {
	var setting model.PanelSetting
	if err := model.DB.Where("key = ?", connectionSettingKey).First(&setting).Error; err != nil {
		log.L.Debug("no persisted headscale connection", zap.Error(err))
		return false
	}

	var payload connectionPayload
	if err := json.Unmarshal([]byte(setting.Value), &payload); err != nil {
		log.L.Warn("persisted connection settings are unreadable", zap.Error(err))
		return false
	}

	if strings.TrimSpace(payload.APIAddr) == "" {
		if payload.LegacyGRPCAddr != "" {
			log.L.Warn("persisted headscale settings use the removed gRPC endpoint; the API address must be re-entered",
				zap.String("legacy_grpc_addr", payload.LegacyGRPCAddr))
			return false
		}
		log.L.Warn("persisted headscale settings are missing api_addr")
		return false
	}

	apiKey, err := Secrets.Decrypt(payload.APIKeyEncrypted)
	if err != nil {
		log.L.Warn("cannot decrypt the persisted headscale API key; JWT_SECRET must stay stable across restarts",
			zap.Error(err))
		return false
	}

	conf.Conf.Headscale.APIAddr = payload.APIAddr
	conf.Conf.Headscale.APIKey = apiKey
	conf.Conf.Headscale.Insecure = payload.Insecure
	conf.Conf.Headscale.TLSSkipVerify = payload.TLSSkipVerify
	conf.Conf.Headscale.TLSCACert = payload.TLSCACert
	return true
}

// SyncFromHeadscale pulls ACL hosts and reconciles bindings.
func (s *connectionServiceSettings) SyncFromHeadscale(ctx context.Context, actorUserID uint) (*network.ReconcileResult, error) {
	if err := RequirePermission(actorUserID, constants.PermSystemConfigUpdate); err != nil {
		return nil, err
	}

	if err := ACLService.SyncResourcesFromPolicy(ctx, actorUserID); err != nil {
		return nil, err
	}
	return NetworkIdentityService.ReconcileBindings(ctx, actorUserID)
}
