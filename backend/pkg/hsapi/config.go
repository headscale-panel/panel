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

package hsapi

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
)

const (
	configAPIPath          = "/api/v1/config"
	configDocsQueryParam   = "docs"
	opGettingRunningConfig = "getting running config"
)

// GetRunningConfig fetches Headscale's active configuration as redacted YAML
// via GET /api/v1/config. When includeDocs is true, upstream attaches inline
// key documentation as YAML comments.
func (c *Client) GetRunningConfig(ctx context.Context, includeDocs bool) (string, error) {
	q := url.Values{}
	q.Set(configDocsQueryParam, strconv.FormatBool(includeDocs))

	raw, err := c.do(ctx, opGettingRunningConfig, http.MethodGet, configAPIPath, q, nil)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}
