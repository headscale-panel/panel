package services

import (
	"fmt"
	"headscale-panel/pkg/conf"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type headscaleConfigService struct{}

var HeadscaleConfigService = new(headscaleConfigService)

const redactedSecretPlaceholder = "******"

// HeadscaleConfigFile represents the full Headscale config.yaml structure
type HeadscaleConfigFile struct {
	ServerURL                      string         `json:"server_url" yaml:"server_url"`
	ListenAddr                     string         `json:"listen_addr" yaml:"listen_addr"`
	MetricsListenAddr              string         `json:"metrics_listen_addr" yaml:"metrics_listen_addr"`
	GRPCListenAddr                 string         `json:"grpc_listen_addr" yaml:"grpc_listen_addr"`
	GRPCAllowInsecure              bool           `json:"grpc_allow_insecure" yaml:"grpc_allow_insecure"`
	DisableCheckUpdates            bool           `json:"disable_check_updates" yaml:"disable_check_updates,omitempty"`
	EphemeralNodeInactivityTimeout string         `json:"ephemeral_node_inactivity_timeout" yaml:"ephemeral_node_inactivity_timeout,omitempty"`
	Noise                          NoiseConfig    `json:"noise" yaml:"noise"`
	Prefixes                       PrefixesConfig `json:"prefixes" yaml:"prefixes"`
	DERP                           DERPConfig     `json:"derp" yaml:"derp"`
	Database                       DatabaseConfig `json:"database" yaml:"database"`
	DNS                            DNSConfig      `json:"dns" yaml:"dns"`
	Policy                         PolicyConfig   `json:"policy" yaml:"policy,omitempty"`
	OIDC                           OIDCConfig     `json:"oidc" yaml:"oidc,omitempty"`
	LogTail                        LogTailConfig  `json:"logtail" yaml:"logtail,omitempty"`
	RandomizeClientPort            bool           `json:"randomize_client_port" yaml:"randomize_client_port,omitempty"`

	// TLS / ACME
	TLSLetsEncryptHostname      string `json:"tls_letsencrypt_hostname" yaml:"tls_letsencrypt_hostname,omitempty"`
	TLSLetsEncryptCacheDir      string `json:"tls_letsencrypt_cache_dir" yaml:"tls_letsencrypt_cache_dir,omitempty"`
	TLSLetsEncryptChallengeType string `json:"tls_letsencrypt_challenge_type" yaml:"tls_letsencrypt_challenge_type,omitempty"`
	TLSLetsEncryptListen        string `json:"tls_letsencrypt_listen" yaml:"tls_letsencrypt_listen,omitempty"`
	TLSCertPath                 string `json:"tls_cert_path" yaml:"tls_cert_path,omitempty"`
	TLSKeyPath                  string `json:"tls_key_path" yaml:"tls_key_path,omitempty"`
	ACMEUrl                     string `json:"acme_url" yaml:"acme_url,omitempty"`
	ACMEEmail                   string `json:"acme_email" yaml:"acme_email,omitempty"`

	// Log
	Log LogConfig `json:"log" yaml:"log,omitempty"`

	// Unix Socket
	UnixSocket           string `json:"unix_socket" yaml:"unix_socket,omitempty"`
	UnixSocketPermission string `json:"unix_socket_permission" yaml:"unix_socket_permission,omitempty"`

	// Taildrop (file sharing between nodes)
	Taildrop TaildropConfig `json:"taildrop" yaml:"taildrop,omitempty"`
}

type NoiseConfig struct {
	PrivateKeyPath string `json:"private_key_path" yaml:"private_key_path"`
}

type PrefixesConfig struct {
	V4         string `json:"v4" yaml:"v4"`
	V6         string `json:"v6" yaml:"v6"`
	Allocation string `json:"allocation" yaml:"allocation,omitempty"`
}

type DERPConfig struct {
	Server            DERPServerConfig `json:"server" yaml:"server"`
	URLs              []string         `json:"urls" yaml:"urls"`
	Paths             []string         `json:"paths" yaml:"paths,omitempty"`
	AutoUpdateEnabled bool             `json:"auto_update_enabled" yaml:"auto_update_enabled"`
	UpdateFrequency   string           `json:"update_frequency" yaml:"update_frequency"`
}

type DERPServerConfig struct {
	Enabled                            bool   `json:"enabled" yaml:"enabled"`
	RegionID                           int    `json:"region_id" yaml:"region_id"`
	RegionCode                         string `json:"region_code" yaml:"region_code"`
	RegionName                         string `json:"region_name" yaml:"region_name"`
	VerifyClients                      bool   `json:"verify_clients" yaml:"verify_clients,omitempty"`
	STUNAddr                           string `json:"stun_listen_addr" yaml:"stun_listen_addr"`
	PrivateKeyPath                     string `json:"private_key_path" yaml:"private_key_path,omitempty"`
	AutomaticallyAddEmbeddedDERPRegion bool   `json:"automatically_add_embedded_derp_region" yaml:"automatically_add_embedded_derp_region,omitempty"`
	IPv4                               string `json:"ipv4" yaml:"ipv4,omitempty"`
	IPv6                               string `json:"ipv6" yaml:"ipv6,omitempty"`
}

type DatabaseConfig struct {
	Type     string         `json:"type" yaml:"type"`
	SQLite   SQLiteConfig   `json:"sqlite" yaml:"sqlite,omitempty"`
	Postgres PostgresConfig `json:"postgres" yaml:"postgres,omitempty"`
	Debug    bool           `json:"debug" yaml:"debug,omitempty"`
	GORM     GORMConfig     `json:"gorm" yaml:"gorm,omitempty"`
}

type GORMConfig struct {
	PrepareStmt           bool `json:"prepare_stmt" yaml:"prepare_stmt,omitempty"`
	ParameterizedQueries  bool `json:"parameterized_queries" yaml:"parameterized_queries,omitempty"`
	SkipErrRecordNotFound bool `json:"skip_err_record_not_found" yaml:"skip_err_record_not_found,omitempty"`
	SlowThreshold         int  `json:"slow_threshold" yaml:"slow_threshold,omitempty"`
}

type SQLiteConfig struct {
	Path              string `json:"path" yaml:"path"`
	WriteAheadLog     bool   `json:"write_ahead_log" yaml:"write_ahead_log,omitempty"`
	WALAutoCheckpoint int    `json:"wal_autocheckpoint" yaml:"wal_autocheckpoint,omitempty"`
}

type PostgresConfig struct {
	Host                string `json:"host" yaml:"host"`
	Port                int    `json:"port" yaml:"port"`
	Name                string `json:"name" yaml:"name"`
	User                string `json:"user" yaml:"user"`
	Pass                string `json:"pass" yaml:"pass"`
	MaxOpenConns        int    `json:"max_open_conns" yaml:"max_open_conns,omitempty"`
	MaxIdleConns        int    `json:"max_idle_conns" yaml:"max_idle_conns,omitempty"`
	ConnMaxIdleTimeSecs int    `json:"conn_max_idle_time_secs" yaml:"conn_max_idle_time_secs,omitempty"`
}

type DNSConfig struct {
	BaseDomain       string            `json:"base_domain" yaml:"base_domain"`
	MagicDNS         bool              `json:"magic_dns" yaml:"magic_dns"`
	Nameservers      NameserversConfig `json:"nameservers" yaml:"nameservers"`
	SearchDomains    []string          `json:"search_domains" yaml:"search_domains,omitempty"`
	ExtraRecords     []DNSExtraRecord  `json:"extra_records" yaml:"extra_records,omitempty"`
	ExtraRecordsPath string            `json:"extra_records_path" yaml:"extra_records_path,omitempty"`
	OverrideLocalDNS bool              `json:"override_local_dns" yaml:"override_local_dns,omitempty"`
}

type NameserversConfig struct {
	Global []string            `json:"global" yaml:"global"`
	Split  map[string][]string `json:"split" yaml:"split,omitempty"`
}

type DNSExtraRecord struct {
	Name  string `json:"name" yaml:"name"`
	Type  string `json:"type" yaml:"type"`
	Value string `json:"value" yaml:"value"`
}

type PolicyConfig struct {
	Mode string `json:"mode" yaml:"mode"`
	Path string `json:"path" yaml:"path,omitempty"`
}

type OIDCConfig struct {
	OnlyStartIfOIDCIsAvailable bool              `json:"only_start_if_oidc_is_available" yaml:"only_start_if_oidc_is_available,omitempty"`
	Issuer                     string            `json:"issuer" yaml:"issuer"`
	ClientID                   string            `json:"client_id" yaml:"client_id"`
	ClientSecret               string            `json:"client_secret" yaml:"client_secret"`
	ClientSecretPath           string            `json:"client_secret_path" yaml:"client_secret_path,omitempty"`
	Scope                      []string          `json:"scope" yaml:"scope,omitempty"`
	EmailVerifiedRequired      bool              `json:"email_verified_required" yaml:"email_verified_required,omitempty"`
	AllowedDomains             []string          `json:"allowed_domains" yaml:"allowed_domains,omitempty"`
	AllowedUsers               []string          `json:"allowed_users" yaml:"allowed_users,omitempty"`
	AllowedGroups              []string          `json:"allowed_groups" yaml:"allowed_groups,omitempty"`
	StripEmailDomain           bool              `json:"strip_email_domain" yaml:"strip_email_domain,omitempty"`
	Expiry                     string            `json:"expiry" yaml:"expiry,omitempty"`
	UseExpiryFromToken         bool              `json:"use_expiry_from_token" yaml:"use_expiry_from_token,omitempty"`
	ExtraParams                map[string]string `json:"extra_params" yaml:"extra_params,omitempty"`
	PKCE                       PKCEConfig        `json:"pkce" yaml:"pkce,omitempty"`
}

type PKCEConfig struct {
	Enabled bool   `json:"enabled" yaml:"enabled,omitempty"`
	Method  string `json:"method" yaml:"method,omitempty"`
}

type LogTailConfig struct {
	Enabled bool `json:"enabled" yaml:"enabled"`
}

type LogConfig struct {
	Level  string `json:"level" yaml:"level,omitempty"`
	Format string `json:"format" yaml:"format,omitempty"`
}

type TaildropConfig struct {
	Enabled bool `json:"enabled" yaml:"enabled,omitempty"`
}

// GetConfig reads the Headscale config.yaml file and returns the parsed config
func (s *headscaleConfigService) GetConfig() (*HeadscaleConfigFile, error) {
	filePath := s.getConfigPath()

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			// Return default config if file does not exist
			return s.defaultConfig(), nil
		}
		return nil, fmt.Errorf("读取配置文件失败: %w", err)
	}

	var config HeadscaleConfigFile
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("YAML 解析失败: %w", err)
	}

	return &config, nil
}

// SaveConfig writes the config to the Headscale config.yaml file
func (s *headscaleConfigService) SaveConfig(config *HeadscaleConfigFile) error {
	filePath := s.getConfigPath()

	// Ensure directory exists
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("创建目录失败: %w", err)
	}

	data, err := yaml.Marshal(config)
	if err != nil {
		return fmt.Errorf("YAML 序列化失败: %w", err)
	}

	if err := os.WriteFile(filePath, data, 0600); err != nil {
		return fmt.Errorf("写入配置文件失败: %w", err)
	}

	return nil
}

// PreviewConfig returns the YAML string representation of the config
func (s *headscaleConfigService) PreviewConfig(config *HeadscaleConfigFile) (string, error) {
	data, err := yaml.Marshal(config)
	if err != nil {
		return "", fmt.Errorf("YAML 序列化失败: %w", err)
	}
	return string(data), nil
}

func (s *headscaleConfigService) GetConfigWithAuth(actorUserID uint) (*HeadscaleConfigFile, error) {
	if err := RequirePermission(actorUserID, "headscale:config:view"); err != nil {
		return nil, err
	}
	return s.GetConfig()
}

func (s *headscaleConfigService) SaveConfigWithAuth(actorUserID uint, config *HeadscaleConfigFile) error {
	if err := RequirePermission(actorUserID, "headscale:config:update"); err != nil {
		return err
	}
	return s.SaveConfig(config)
}

func (s *headscaleConfigService) PreviewConfigWithAuth(actorUserID uint, config *HeadscaleConfigFile) (string, error) {
	if err := RequirePermission(actorUserID, "headscale:config:update"); err != nil {
		return "", err
	}
	return s.PreviewConfig(config)
}

func (s *headscaleConfigService) getConfigPath() string {
	if conf.Conf.Headscale.ConfigPath != "" {
		return conf.Conf.Headscale.ConfigPath
	}
	return "./headscale/config.yaml"
}

func (s *headscaleConfigService) RedactSecrets(config *HeadscaleConfigFile) *HeadscaleConfigFile {
	if config == nil {
		return nil
	}

	copyCfg := *config
	if copyCfg.OIDC.ClientSecret != "" {
		copyCfg.OIDC.ClientSecret = redactedSecretPlaceholder
	}
	if copyCfg.Database.Postgres.Pass != "" {
		copyCfg.Database.Postgres.Pass = redactedSecretPlaceholder
	}

	return &copyCfg
}

func (s *headscaleConfigService) MergePreservedSecrets(incoming, current *HeadscaleConfigFile) *HeadscaleConfigFile {
	if incoming == nil {
		return nil
	}

	merged := *incoming
	if current == nil {
		return &merged
	}

	if incoming.OIDC.ClientSecret == redactedSecretPlaceholder {
		merged.OIDC.ClientSecret = current.OIDC.ClientSecret
	}
	if incoming.Database.Postgres.Pass == redactedSecretPlaceholder {
		merged.Database.Postgres.Pass = current.Database.Postgres.Pass
	}

	return &merged
}

func (s *headscaleConfigService) defaultConfig() *HeadscaleConfigFile {
	return &HeadscaleConfigFile{
		ServerURL:                      "https://hs.bokro.cn",
		ListenAddr:                     "0.0.0.0:8080",
		MetricsListenAddr:              "0.0.0.0:9090",
		GRPCListenAddr:                 "0.0.0.0:50443",
		GRPCAllowInsecure:              true,
		EphemeralNodeInactivityTimeout: "30m",
		Noise: NoiseConfig{
			PrivateKeyPath: "./noise_private.key",
		},
		Prefixes: PrefixesConfig{
			V4:         "100.100.0.0/16",
			V6:         "fd7a:115c:a1e0::/48",
			Allocation: "sequential",
		},
		DERP: DERPConfig{
			Server: DERPServerConfig{
				Enabled:    false,
				RegionID:   999,
				RegionCode: "headscale",
				RegionName: "Headscale Embedded DERP",
				STUNAddr:   "0.0.0.0:3478",
			},
			URLs:              []string{},
			Paths:             []string{"/etc/headscale/derp.yaml"},
			AutoUpdateEnabled: true,
			UpdateFrequency:   "24h",
		},
		Database: DatabaseConfig{
			Type: "sqlite",
			SQLite: SQLiteConfig{
				Path:          "/var/lib/headscale/db.sqlite",
				WriteAheadLog: true,
			},
		},
		DNS: DNSConfig{
			BaseDomain:       "bokro.network",
			MagicDNS:         true,
			OverrideLocalDNS: true,
			Nameservers: NameserversConfig{
				Global: []string{"223.5.5.5", "114.114.114.114", "2400:3200::1", "2400:3200:baba::1"},
			},
			ExtraRecordsPath: "/var/lib/headscale/extra-records.json",
		},
		Policy: PolicyConfig{
			Mode: "database",
		},
		OIDC: OIDCConfig{
			OnlyStartIfOIDCIsAvailable: false,
			Issuer:                     "https://auth.bokro.cn",
			Scope:                      []string{"openid", "profile", "email", "groups"},
			PKCE: PKCEConfig{
				Enabled: false,
				Method:  "S256",
			},
		},
		LogTail: LogTailConfig{
			Enabled: false,
		},
		Log: LogConfig{
			Level:  "info",
			Format: "text",
		},
		UnixSocket:           "/var/run/headscale/headscale.sock",
		UnixSocketPermission: "0770",
		RandomizeClientPort:  false,
		Taildrop: TaildropConfig{
			Enabled: true,
		},
	}
}
