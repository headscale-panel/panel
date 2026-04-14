package constants

import "time"

// DataDir is the directory where all persistent application data is stored.
const DataDir = "data"

// HeadscaleBaseDir is the root directory for all headscale-related panel data.
const HeadscaleBaseDir = DataDir + "/headscale"

// HeadscaleLibDir holds configuration files managed by the panel (config.yaml, extra records, etc.).
// It is mounted into the headscale container as /var/lib/headscale.
const HeadscaleLibDir = HeadscaleBaseDir + "/lib"

// HeadscaleEtcDir holds support files such as the custom DERP map.
// It is mounted into the headscale container as /etc/headscale.
const HeadscaleEtcDir = HeadscaleBaseDir + "/etc"

// Shared filenames for files managed by both the panel and referenced in headscale config.
const (
	HeadscaleConfigFileName = "config.yaml"
	ExtraRecordsFileName    = "extra-records.json"
	DERPMapFileName         = "derp-custom.yaml"
)

// Panel-side file paths – paths relative to the panel's working directory,
// used by the panel to read/write these files on disk.
const (
	HeadscaleConfigFilePath = HeadscaleEtcDir + "/" + HeadscaleConfigFileName
	DERPMapFilePath         = HeadscaleEtcDir + "/" + DERPMapFileName
	ExtraRecordsFilePath    = HeadscaleLibDir + "/" + ExtraRecordsFileName
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

// FrontendDir is the directory where compiled frontend static files are served from.
const FrontendDir = "frontend"

const (
	DefaultPage     = 1
	DefaultPageSize = 10
	MaxPageSize     = 200

	SetupWindow = 30 * time.Minute

	AuthRateLimitCount  = 20
	AuthRateLimitWindow = 1 * time.Minute

	ServiceRequestTimeout = 30 * time.Second

	OIDCAuthCodeTTL     = 10 * time.Minute
	OIDCTokenTTL        = 1 * time.Hour
	OIDCRefreshTokenTTL = 30 * 24 * time.Hour
)
