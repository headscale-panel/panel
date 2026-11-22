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

package headscale

import (
	"fmt"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/hsapi"
	"sync"
	"time"
)

// Client is the panel's handle on the Headscale API.
type Client struct {
	REST      *hsapi.Client
	createdAt time.Time
}

var (
	GlobalClient *Client
	clientMu     sync.Mutex
)

// GetOrRefreshClient returns the current global client, building it from the
// runtime configuration when it has not been created yet. Safe for concurrent
// use.
//
// The REST transport is stateless, so there is no connection to age out; the
// client is only rebuilt after the connection settings change (Close + Init).
func GetOrRefreshClient() (*Client, error) {
	clientMu.Lock()
	defer clientMu.Unlock()

	if GlobalClient != nil {
		return GlobalClient, nil
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

// initLocked builds a REST client. Must be called with clientMu held.
func initLocked() error {
	addr := conf.Conf.Headscale.APIAddr
	apiKey := conf.Conf.Headscale.APIKey
	if addr == "" {
		return fmt.Errorf("headscale API address is empty; persisted connection settings may not have loaded")
	}
	if apiKey == "" {
		return fmt.Errorf("headscale api key is empty; persisted encrypted secret may not decrypt with the current JWT_SECRET")
	}

	rest, err := hsapi.New(hsapi.Config{
		BaseURL:       addr,
		APIKey:        apiKey,
		Insecure:      conf.Conf.Headscale.Insecure,
		TLSSkipVerify: conf.Conf.Headscale.TLSSkipVerify,
		TLSCACert:     conf.Conf.Headscale.TLSCACert,
		CacheTTL:      2 * time.Second,
	})
	if err != nil {
		return err
	}

	GlobalClient = &Client{
		REST:      rest,
		createdAt: time.Now(),
	}
	return nil
}

// Connected reports whether a client has been built. The REST transport holds
// no connection handle, so this means "configured", not "reachable"; use
// hsapi.Probe for reachability.
func Connected() bool {
	clientMu.Lock()
	defer clientMu.Unlock()
	return GlobalClient != nil
}

func Close() {
	clientMu.Lock()
	defer clientMu.Unlock()
	GlobalClient = nil
}
