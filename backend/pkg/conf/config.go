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

package conf

import (
	"errors"
	"fmt"
	"headscale-panel/pkg/log"
	"net"
	"net/url"
	"strings"

	"github.com/joho/godotenv"
	"github.com/spf13/viper"
	"go.uber.org/zap"
)

type Config struct {
	System    SystemConfig    `mapstructure:"system"`
	JWT       JWTConfig       `mapstructure:"jwt"`
	Headscale HeadscaleConfig `mapstructure:"headscale"`
	InfluxDB  InfluxDBConfig  `mapstructure:"influxdb"`
	Lifecycle LifecycleConfig `mapstructure:"lifecycle"`
}

// LifecycleConfig controls whether the panel may start, stop and restart the
// headscale container.
type LifecycleConfig struct {
	// Enabled is the master switch. Off by default: letting a web application
	// control a container is a deliberate deployment decision.
	Enabled bool `mapstructure:"enabled"`
	// Mode is the only supported value today; anything else disables the feature
	// with a warning rather than guessing.
	Mode string `mapstructure:"mode"`
	// ContainerName must match ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$.
	ContainerName string `mapstructure:"container_name"`
}

type SystemConfig struct {
	Port                string `mapstructure:"port"`
	Debug               bool   `mapstructure:"debug"`
	BaseURL             string `mapstructure:"base_url"`
	SetupBootstrapToken string `mapstructure:"setup_bootstrap_token"`
	TrustedProxies      string `mapstructure:"trusted_proxies"`
}

type JWTConfig struct {
	Secret string `mapstructure:"secret"`
	Expire int64  `mapstructure:"expire"` // hours
}

type HeadscaleConfig struct {
	APIAddr       string `mapstructure:"api_addr"`
	APIKey        string `mapstructure:"api_key"`
	Insecure      bool   `mapstructure:"insecure"`
	TLSSkipVerify bool   `mapstructure:"tls_skip_verify"`
	TLSCACert     string `mapstructure:"tls_ca_cert"` // PEM content of custom CA cert
}

type InfluxDBConfig struct {
	URL    string `mapstructure:"url"`
	Token  string `mapstructure:"token"`
	Org    string `mapstructure:"org"`
	Bucket string `mapstructure:"bucket"`
}

var Conf Config

func Init(path string) {
	if err := godotenv.Load(path); err != nil {
		log.L.Warn("Error loading .env file", zap.Error(err))
	}

	viper.SetConfigFile(path)
	viper.SetConfigType("env") // or yaml, json
	viper.AutomaticEnv()

	// Replace dots with underscores in env vars
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	if err := viper.ReadInConfig(); err != nil {
		log.L.Warn("Config file not found", zap.Error(err))
	}

	// Set defaults
	viper.SetDefault("system.port", ":8080")
	viper.SetDefault("system.base_url", "http://localhost:8080")
	viper.SetDefault("system.setup_bootstrap_token", "")
	viper.SetDefault("system.trusted_proxies", "")
	viper.SetDefault("jwt.expire", 24)
	viper.SetDefault("influxdb.url", "")
	viper.SetDefault("influxdb.token", "")
	viper.SetDefault("influxdb.org", "headscale-panel")
	viper.SetDefault("influxdb.bucket", "metrics")
	// Manually bind env vars to nested keys because Viper doesn't automatically map flat env keys to nested structs
	viper.BindEnv("system.port", "SYSTEM_PORT")
	viper.BindEnv("system.debug", "SYSTEM_DEBUG")
	viper.BindEnv("system.base_url", "SYSTEM_BASE_URL")
	viper.BindEnv("system.setup_bootstrap_token", "SYSTEM_SETUP_BOOTSTRAP_TOKEN")
	viper.BindEnv("system.trusted_proxies", "SYSTEM_TRUSTED_PROXIES")
	viper.BindEnv("jwt.secret", "JWT_SECRET")
	viper.BindEnv("jwt.expire", "JWT_EXPIRE")
	viper.BindEnv("influxdb.url", "INFLUXDB_URL")
	viper.BindEnv("influxdb.token", "INFLUXDB_TOKEN")
	viper.BindEnv("influxdb.org", "INFLUXDB_ORG")
	viper.BindEnv("influxdb.bucket", "INFLUXDB_BUCKET")
	viper.BindEnv("headscale.extra_records_path", "HEADSCALE_EXTRA_RECORDS_PATH")
	viper.BindEnv("lifecycle.enabled", "HS_LIFECYCLE_ENABLED")
	viper.BindEnv("lifecycle.mode", "HS_LIFECYCLE_MODE")
	viper.BindEnv("lifecycle.container_name", "HS_CONTAINER_NAME")

	if err := viper.Unmarshal(&Conf); err != nil {
		log.L.Fatal("Unable to decode into struct", zap.Error(err))
	}

	if err := validateSecurityConfig(Conf); err != nil {
		log.L.Fatal("Invalid security configuration", zap.Error(err))
	}

	if shouldWarnInsecureBaseURL(Conf.System.BaseURL) {
		log.L.Warn("SYSTEM_BASE_URL is not using https in non-local env", zap.String("url", strings.TrimSpace(Conf.System.BaseURL)))
	}
}

func validateSecurityConfig(cfg Config) error {
	secret := strings.TrimSpace(cfg.JWT.Secret)
	if secret == "" {
		// Not auto-generated on purpose. This value encrypts the headscale API key
		// stored in the database; a per-session random key would make every stored
		// credential permanently unreadable on the next restart, which looks like
		// data loss and is silent about its cause.
		return errors.New("JWT_SECRET is required: it encrypts stored credentials, so it must survive a restart")
	}

	lowered := strings.ToLower(secret)
	insecureDefaults := map[string]struct{}{
		"headscale-panel-secret":   {},
		"your-secret-key":          {},
		"your_jwt_secret_key_here": {},
	}

	if _, found := insecureDefaults[lowered]; found {
		return fmt.Errorf("JWT_SECRET uses an insecure default or placeholder value")
	}

	if len(secret) < 32 {
		return fmt.Errorf("JWT_SECRET must be at least 32 characters")
	}

	if !isLocalBaseURL(cfg.System.BaseURL) {
		devOnlySecrets := map[string]struct{}{
			"dev-only-jwt-secret-change-me-0123456789abcdef": {},
		}
		if _, found := devOnlySecrets[lowered]; found {
			return fmt.Errorf("JWT_SECRET uses a dev-only default in a non-local deployment")
		}
	}

	bootstrapToken := strings.TrimSpace(cfg.System.SetupBootstrapToken)
	if bootstrapToken != "" {
		loweredBootstrap := strings.ToLower(bootstrapToken)
		insecureBootstrapDefaults := map[string]struct{}{
			"bootstrap":       {},
			"bootstrap-token": {},
			"changeme":        {},
			"default":         {},
		}
		if _, found := insecureBootstrapDefaults[loweredBootstrap]; found {
			return fmt.Errorf("SYSTEM_SETUP_BOOTSTRAP_TOKEN uses an insecure default or placeholder value")
		}
		if !isLocalBaseURL(cfg.System.BaseURL) {
			devOnlyBootstrap := map[string]struct{}{
				"dev-bootstrap-token-change-me-0123456789": {},
			}
			if _, found := devOnlyBootstrap[loweredBootstrap]; found {
				return fmt.Errorf("SYSTEM_SETUP_BOOTSTRAP_TOKEN uses a dev-only default in a non-local deployment")
			}
		}
		if len(bootstrapToken) < 32 {
			return fmt.Errorf("SYSTEM_SETUP_BOOTSTRAP_TOKEN must be at least 32 characters when configured")
		}
	}

	return nil
}

func isLocalBaseURL(baseURL string) bool {
	trimmed := strings.TrimSpace(baseURL)
	if trimmed == "" {
		return true
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Host == "" {
		return false
	}
	hostname := strings.TrimSpace(parsed.Hostname())
	if strings.EqualFold(hostname, "localhost") || strings.EqualFold(hostname, "127.0.0.1") || strings.EqualFold(hostname, "::1") {
		return true
	}
	if ip := net.ParseIP(hostname); ip != nil && ip.IsLoopback() {
		return true
	}
	return false
}

func shouldWarnInsecureBaseURL(baseURL string) bool {
	trimmed := strings.TrimSpace(baseURL)
	if trimmed == "" {
		return false
	}

	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Host == "" {
		return false
	}

	if strings.EqualFold(parsed.Scheme, "https") {
		return false
	}

	hostname := strings.TrimSpace(parsed.Hostname())
	if hostname == "" {
		return false
	}

	if strings.EqualFold(hostname, "localhost") || strings.EqualFold(hostname, "127.0.0.1") || strings.EqualFold(hostname, "::1") {
		return false
	}

	if ip := net.ParseIP(hostname); ip != nil && ip.IsLoopback() {
		return false
	}

	return true
}
