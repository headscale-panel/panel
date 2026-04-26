package services

import (
	"context"
	"fmt"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/headscale"
	"os"
	"path/filepath"
	"strings"

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
	PrivateKeyPath                 string         `json:"private_key_path" yaml:"private_key_path"`
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
	URLs              []string         `json:"urls" yaml:"urls,omitempty"`
	Paths             []string         `json:"paths" yaml:"paths,omitempty"`
	AutoUpdateEnabled bool             `json:"auto_update_enabled" yaml:"auto_update_enabled,omitempty"`
	UpdateFrequency   string           `json:"update_frequency" yaml:"update_frequency,omitempty"`
}

type DERPServerConfig struct {
	Enabled                            bool   `json:"enabled" yaml:"enabled"`
	RegionID                           int    `json:"region_id" yaml:"region_id,omitempty"`
	RegionCode                         string `json:"region_code" yaml:"region_code,omitempty"`
	RegionName                         string `json:"region_name" yaml:"region_name,omitempty"`
	VerifyClients                      bool   `json:"verify_clients" yaml:"verify_clients,omitempty"`
	STUNAddr                           string `json:"stun_listen_addr" yaml:"stun_listen_addr,omitempty"`
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

// defaultConfig returns the preset minimal headscale configuration written to
// config.yaml when the file is absent or empty.
func (s *headscaleConfigService) defaultConfig() *HeadscaleConfigFile {
	return &HeadscaleConfigFile{
		ServerURL:         "https://vpn.example.com",
		ListenAddr:        "0.0.0.0:8080",
		MetricsListenAddr: "0.0.0.0:9090",
		GRPCListenAddr:    "0.0.0.0:50443",
		GRPCAllowInsecure: true,
		PrivateKeyPath:    constants.HSPrivateKeyPath,
		Noise: NoiseConfig{
			PrivateKeyPath: constants.HSNoiseKeyPath,
		},
		Prefixes: PrefixesConfig{
			V4:         "100.100.0.0/16",
			Allocation: "sequential",
		},
		DERP: DERPConfig{
			Server: DERPServerConfig{
				Enabled: false,
			},
			Paths: []string{constants.HSDERPMapPath},
		},
		Database: DatabaseConfig{
			Type: "sqlite",
			SQLite: SQLiteConfig{
				Path:          constants.HSDBPath,
				WriteAheadLog: true,
			},
		},
		DNS: DNSConfig{
			MagicDNS:         true,
			OverrideLocalDNS: true,
			BaseDomain:       "example.net",
			Nameservers: NameserversConfig{
				Global: []string{"1.1.1.1", "1.0.0.1"},
			},
		},
		Policy: PolicyConfig{
			Mode: "database",
		},
	}
}

// GetConfig reads and parses the config file.
func (s *headscaleConfigService) GetConfig() (*HeadscaleConfigFile, error) {
	path := constants.HeadscaleConfigFilePath
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return s.defaultConfig(), nil
		}
		return nil, fmt.Errorf("读取配置文件失败: %w", err)
	}
	var cfg HeadscaleConfigFile
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("YAML 解析失败: %w", err)
	}
	return &cfg, nil
}

// SaveConfig writes the config to the file. When restart is true and DinD
// mode is enabled the Headscale container will be restarted after writing.
func (s *headscaleConfigService) SaveConfig(cfg *HeadscaleConfigFile, restart bool) error {
	if err := s.writeConfig(cfg); err != nil {
		return err
	}
	if restart {
		s.tryRestartHeadscale()
	}
	return nil
}

// tryRestartHeadscale attempts to restart Headscale after writing config.
// Failures are logged and do not block the successful config write path.
func (s *headscaleConfigService) tryRestartHeadscale() {
	headscale.TryRestartHeadscale(context.Background(), "config write")
}

// PreviewConfig returns the YAML string of the config.
func (s *headscaleConfigService) PreviewConfig(cfg *HeadscaleConfigFile) (string, error) {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return "", fmt.Errorf("YAML 序列化失败: %w", err)
	}
	return string(data), nil
}

// GetConfigWithAuth is GetConfig with permission check.
func (s *headscaleConfigService) GetConfigWithAuth(actorUserID uint) (*HeadscaleConfigFile, error) {
	if err := RequirePermission(actorUserID, "headscale:config:view"); err != nil {
		return nil, err
	}
	return s.GetConfig()
}

// SaveConfigWithAuth is SaveConfig with permission check.
func (s *headscaleConfigService) SaveConfigWithAuth(actorUserID uint, cfg *HeadscaleConfigFile, restart bool) error {
	if err := RequirePermission(actorUserID, "headscale:config:update"); err != nil {
		return err
	}
	return s.SaveConfig(cfg, restart)
}

// PreviewConfigWithAuth is PreviewConfig with permission check.
func (s *headscaleConfigService) PreviewConfigWithAuth(actorUserID uint, cfg *HeadscaleConfigFile) (string, error) {
	if err := RequirePermission(actorUserID, "headscale:config:view"); err != nil {
		return "", err
	}
	return s.PreviewConfig(cfg)
}

// RedactSecrets returns a copy of the config with sensitive fields masked.
func (s *headscaleConfigService) RedactSecrets(cfg *HeadscaleConfigFile) *HeadscaleConfigFile {
	if cfg == nil {
		return nil
	}
	copy := *cfg
	if copy.OIDC.ClientSecret != "" {
		copy.OIDC.ClientSecret = redactedSecretPlaceholder
	}
	if copy.Database.Postgres.Pass != "" {
		copy.Database.Postgres.Pass = redactedSecretPlaceholder
	}
	return &copy
}

// MergePreservedSecrets prevents clients from overwriting secrets with the redacted placeholder.
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

// IsOIDCAutoLinkAllowed reports whether the given email is permitted by the
// OIDC allowed_users / allowed_domains allowlist. Returns true when no
// allowlist is configured (open enrollment).
func (s *headscaleConfigService) IsOIDCAutoLinkAllowed(cfg *HeadscaleConfigFile, email string) bool {
	if cfg == nil {
		return true
	}

	normalizedEmail := strings.ToLower(strings.TrimSpace(email))
	if normalizedEmail == "" {
		return false
	}

	allowedUsers := normalizeOIDCAllowlist(cfg.OIDC.AllowedUsers)
	allowedDomains := normalizeOIDCAllowlist(cfg.OIDC.AllowedDomains)
	if len(allowedUsers) == 0 && len(allowedDomains) == 0 {
		return true
	}

	if _, ok := allowedUsers[normalizedEmail]; ok {
		return true
	}

	parts := strings.Split(normalizedEmail, "@")
	if len(parts) != 2 || strings.TrimSpace(parts[1]) == "" {
		return false
	}
	_, ok := allowedDomains[parts[1]]
	return ok
}

// HasOIDCAllowlist reports whether the config has any allowed_users or
// allowed_domains configured.
func (s *headscaleConfigService) HasOIDCAllowlist(cfg *HeadscaleConfigFile) bool {
	if cfg == nil {
		return false
	}
	return len(normalizeOIDCAllowlist(cfg.OIDC.AllowedUsers)) > 0 ||
		len(normalizeOIDCAllowlist(cfg.OIDC.AllowedDomains)) > 0
}

func normalizeOIDCAllowlist(values []string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, v := range values {
		normalized := strings.ToLower(strings.TrimSpace(v))
		if normalized == "" {
			continue
		}
		result[normalized] = struct{}{}
	}
	return result
}

// writeConfig marshals cfg to YAML and writes it to the config file path.
func (s *headscaleConfigService) writeConfig(cfg *HeadscaleConfigFile) error {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("YAML 序列化失败: %w", err)
	}
	path := constants.HeadscaleConfigFilePath
	if err := os.MkdirAll(filepath.Dir(path), 0750); err != nil {
		return fmt.Errorf("创建配置目录失败: %w", err)
	}
	if err := os.WriteFile(path, data, 0600); err != nil {
		return fmt.Errorf("写入配置文件失败: %w", err)
	}
	return nil
}

// mergeWithDefaults fills zero-value fields in cfg with values from the default
// config. Only essential startup fields are back-filled.
func (s *headscaleConfigService) mergeWithDefaults(cfg *HeadscaleConfigFile) *HeadscaleConfigFile {
	def := s.defaultConfig()
	out := *cfg

	if out.ServerURL == "" {
		out.ServerURL = def.ServerURL
	}
	if out.ListenAddr == "" {
		out.ListenAddr = def.ListenAddr
	}
	if out.MetricsListenAddr == "" {
		out.MetricsListenAddr = def.MetricsListenAddr
	}
	if out.GRPCListenAddr == "" {
		out.GRPCListenAddr = def.GRPCListenAddr
	}
	if out.PrivateKeyPath == "" {
		out.PrivateKeyPath = def.PrivateKeyPath
	}
	if out.Noise.PrivateKeyPath == "" {
		out.Noise.PrivateKeyPath = def.Noise.PrivateKeyPath
	}
	if out.Prefixes.V4 == "" {
		out.Prefixes.V4 = def.Prefixes.V4
	}
	if out.Prefixes.Allocation == "" {
		out.Prefixes.Allocation = def.Prefixes.Allocation
	}
	if len(out.DERP.Paths) == 0 {
		out.DERP.Paths = def.DERP.Paths
	}
	if out.Database.Type == "" {
		out.Database.Type = def.Database.Type
	}
	if out.Database.SQLite.Path == "" {
		out.Database.SQLite.Path = def.Database.SQLite.Path
	}
	if out.DNS.BaseDomain == "" {
		out.DNS.BaseDomain = def.DNS.BaseDomain
	}
	if len(out.DNS.Nameservers.Global) == 0 {
		out.DNS.Nameservers.Global = def.DNS.Nameservers.Global
	}
	if out.Policy.Mode == "" {
		out.Policy.Mode = def.Policy.Mode
	}

	return &out
}
