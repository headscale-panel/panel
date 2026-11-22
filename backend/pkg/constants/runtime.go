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

package constants

import (
	"os"
	"path/filepath"
	"time"
)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// DataDir is the directory where all persistent application data is stored.
var DataDir = envOr("DATA_DIR", "data")

// DBPath is the SQLite database file. It lives under DataDir by default.
var DBPath = envOr("DB_PATH", filepath.Join(DataDir, "data.db"))

// JWTKeyDir holds the panel's token signing key. It is kept out of the database
// so a database backup does not also hand over the ability to forge tokens.
var JWTKeyDir = envOr("JWT_KEY_DIR", filepath.Join(DataDir, "keys"))

// JWTSigningKeyPath is the RSA private key used to sign access tokens.
var JWTSigningKeyPath = filepath.Join(JWTKeyDir, "jwt-signing.pem")

// HeadscaleBaseDir is the root directory for all headscale-related panel data.
const HeadscaleBaseDir = "headscale"

// HeadscaleLibDir holds files shared with the headscale container at /var/lib/headscale.
var HeadscaleLibDir = envOr("HEADSCALE_LIB_DIR", HeadscaleBaseDir+"/lib")

// HeadscaleEtcDir holds files shared with the headscale container at /etc/headscale.
var HeadscaleEtcDir = envOr("HEADSCALE_ETC_DIR", HeadscaleBaseDir+"/etc")

// Shared filenames for files managed by both the panel and referenced in headscale config.
const (
	HeadscaleConfigFileName = "config.yaml"
	ExtraRecordsFileName    = "extra-records.json"
	DERPMapFileName         = "derp-custom.yaml"
)

// Panel-side file paths – paths relative to the panel's working directory,
// used by the panel to read/write these files on disk.
var (
	HeadscaleConfigFilePath = filepath.Join(HeadscaleEtcDir, HeadscaleConfigFileName)
	DERPMapFilePath         = filepath.Join(HeadscaleEtcDir, DERPMapFileName)
	ExtraRecordsFilePath    = filepath.Join(HeadscaleLibDir, ExtraRecordsFileName)
)

// Headscale container-side paths – absolute paths as seen inside the headscale
// container. These values are written into config.yaml so headscale can locate
// its files at runtime.
const (
	HSDataDir          = "/var/lib/headscale"
	HSEtcDir           = "/etc/headscale"
	HSPrivateKeyPath   = HSDataDir + "/private.key"
	HSNoiseKeyPath     = HSDataDir + "/noise_private.key"
	HSDBPath           = HSDataDir + "/db.sqlite"
	HSDERPMapPath      = HSEtcDir + "/" + DERPMapFileName
	HSExtraRecordsPath = HSEtcDir + "/" + ExtraRecordsFileName
)

// FrontendDir is where compiled frontend assets live, relative to the binary
// unless FRONTEND_DIR says otherwise.
//
// It is read from the environment because the same binary is used in the
// container (assets next to the executable) and in local development (assets in
// the source tree), and the README has always documented the variable.
var FrontendDir = envOr("FRONTEND_DIR", "frontend")

const (
	DefaultPage     = 1
	DefaultPageSize = 10
	MaxPageSize     = 200

	SetupWindow = 30 * time.Minute

	// Rate limits are per client IP, per window.
	//
	// Login is the tightest because it is the only endpoint where guessing is
	// useful. Setup is tighter than ordinary writes because those endpoints are
	// reachable before the panel has any accounts at all, so there is no identity
	// to attribute an attempt to.
	AuthRateLimitCount  = 20
	AuthRateLimitWindow = 1 * time.Minute

	SetupRateLimitCount  = 10
	SetupRateLimitWindow = 1 * time.Minute

	WriteRateLimitCount  = 60
	WriteRateLimitWindow = 1 * time.Minute

	ServiceRequestTimeout = 30 * time.Second

	OIDCAuthCodeTTL     = 10 * time.Minute
	OIDCTokenTTL        = 1 * time.Hour
	OIDCRefreshTokenTTL = 30 * 24 * time.Hour
)
