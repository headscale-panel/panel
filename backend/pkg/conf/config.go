package conf

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log"
	"strings"

	"github.com/joho/godotenv"
	"github.com/spf13/viper"
)

type Config struct {
	System    SystemConfig    `mapstructure:"system"`
	JWT       JWTConfig       `mapstructure:"jwt"`
	Headscale HeadscaleConfig `mapstructure:"headscale"`
	InfluxDB  InfluxDBConfig  `mapstructure:"influxdb"`
	Docker    DockerConfig    `mapstructure:"docker"`
}

type SystemConfig struct {
	Port                string `mapstructure:"port"`
	BaseURL             string `mapstructure:"base_url"`
	SetupBootstrapToken string `mapstructure:"setup_bootstrap_token"`
}

type JWTConfig struct {
	Secret string `mapstructure:"secret"`
	Expire int64  `mapstructure:"expire"` // hours
}

type HeadscaleConfig struct {
	GRPCAddr         string `mapstructure:"grpc_addr"`
	APIKey           string `mapstructure:"api_key"`
	Insecure         bool   `mapstructure:"insecure"`
	ExtraRecordsPath string `mapstructure:"extra_records_path"`
}

type InfluxDBConfig struct {
	URL    string `mapstructure:"url"`
	Token  string `mapstructure:"token"`
	Org    string `mapstructure:"org"`
	Bucket string `mapstructure:"bucket"`
}

// DockerConfig holds Docker-in-Docker (DinD) settings used to restart the
// Headscale container when configuration changes require a reload.
type DockerConfig struct {
	// DinDEnabled controls whether the panel is allowed to restart the
	// Headscale container automatically after config file changes.
	// Set DOCKER_DIND_ENABLED=true to enable.
	DinDEnabled bool `mapstructure:"dind_enabled"`
	// HeadscaleContainerName is the name of the Headscale Docker container
	// to restart. Set via DOCKER_HEADSCALE_CONTAINER_NAME.
	HeadscaleContainerName string `mapstructure:"headscale_container_name"`
}

var Conf Config

func Init(path string) {
	if err := godotenv.Load(path); err != nil {
		log.Printf("Warning: Error loading .env file: %v", err)
	}

	viper.SetConfigFile(path)
	viper.SetConfigType("env") // or yaml, json
	viper.AutomaticEnv()

	// Replace dots with underscores in env vars
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	if err := viper.ReadInConfig(); err != nil {
		log.Printf("Warning: Config file not found: %v", err)
	}

	// Set defaults
	viper.SetDefault("system.port", ":8080")
	viper.SetDefault("system.base_url", "http://localhost:8080")
	viper.SetDefault("system.setup_bootstrap_token", "")
	viper.SetDefault("jwt.expire", 24)
	viper.SetDefault("influxdb.url", "")
	viper.SetDefault("influxdb.token", "")
	viper.SetDefault("influxdb.org", "headscale-panel")
	viper.SetDefault("influxdb.bucket", "metrics")
	// Manually bind env vars to nested keys because Viper doesn't automatically map flat env keys to nested structs
	viper.BindEnv("system.port", "SYSTEM_PORT")
	viper.BindEnv("system.base_url", "SYSTEM_BASE_URL")
	viper.BindEnv("system.setup_bootstrap_token", "SYSTEM_SETUP_BOOTSTRAP_TOKEN")
	viper.BindEnv("jwt.secret", "JWT_SECRET")
	viper.BindEnv("jwt.expire", "JWT_EXPIRE")
	viper.BindEnv("influxdb.url", "INFLUXDB_URL")
	viper.BindEnv("influxdb.token", "INFLUXDB_TOKEN")
	viper.BindEnv("influxdb.org", "INFLUXDB_ORG")
	viper.BindEnv("influxdb.bucket", "INFLUXDB_BUCKET")
	viper.BindEnv("headscale.extra_records_path", "HEADSCALE_EXTRA_RECORDS_PATH")
	viper.BindEnv("docker.dind_enabled", "DOCKER_DIND_ENABLED")
	viper.BindEnv("docker.headscale_container_name", "DOCKER_HEADSCALE_CONTAINER_NAME")
	viper.SetDefault("docker.dind_enabled", false)
	viper.SetDefault("docker.headscale_container_name", "")

	if err := viper.Unmarshal(&Conf); err != nil {
		log.Fatalf("Unable to decode into struct, %v", err)
	}

	if err := validateSecurityConfig(Conf); err != nil {
		log.Fatalf("Invalid security configuration: %v", err)
	}
}

func validateSecurityConfig(cfg Config) error {
	secret := strings.TrimSpace(cfg.JWT.Secret)
	if secret == "" {
		buf := make([]byte, 48)
		if _, err := rand.Read(buf); err != nil {
			return fmt.Errorf("failed to auto-generate JWT_SECRET: %w", err)
		}
		Conf.JWT.Secret = base64.RawURLEncoding.EncodeToString(buf)[:48]
		log.Println("JWT_SECRET not set, auto-generated for this session (tokens will be invalidated on restart)")
		return nil
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
		if len(bootstrapToken) < 32 {
			return fmt.Errorf("SYSTEM_SETUP_BOOTSTRAP_TOKEN must be at least 32 characters when configured")
		}
	}

	return nil
}
