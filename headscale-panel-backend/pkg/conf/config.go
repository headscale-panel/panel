package conf

import (
	"log"
	"strings"

	"github.com/joho/godotenv"
	"github.com/spf13/viper"
)

type Config struct {
	System    SystemConfig    `mapstructure:"system"`
	DB        DBConfig        `mapstructure:"db"`
	JWT       JWTConfig       `mapstructure:"jwt"`
	Headscale HeadscaleConfig `mapstructure:"headscale"`
	InfluxDB  InfluxDBConfig  `mapstructure:"influxdb"`
	Redis     RedisConfig     `mapstructure:"redis"`
}

type SystemConfig struct {
	Port    string `mapstructure:"port"`
	Release bool   `mapstructure:"release"`
	BaseURL string `mapstructure:"base_url"`
}

type DBConfig struct {
	Path string `mapstructure:"path"`
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
	ConfigPath       string `mapstructure:"config_path"`
}

type InfluxDBConfig struct {
	URL    string `mapstructure:"url"`
	Token  string `mapstructure:"token"`
	Org    string `mapstructure:"org"`
	Bucket string `mapstructure:"bucket"`
}

type RedisConfig struct {
	Addr     string `mapstructure:"addr"`
	Password string `mapstructure:"password"`
	DB       int    `mapstructure:"db"`
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
	viper.SetDefault("system.release", false)
	viper.SetDefault("system.base_url", "http://localhost:8080")
	viper.SetDefault("db.path", "data.db")
	viper.SetDefault("jwt.secret", "headscale-panel-secret")
	viper.SetDefault("jwt.expire", 24)
	viper.SetDefault("headscale.grpc_addr", "localhost:50443")
	viper.SetDefault("headscale.api_key", "")
	viper.SetDefault("headscale.insecure", true)
	viper.SetDefault("influxdb.url", "")
	viper.SetDefault("influxdb.token", "")
	viper.SetDefault("influxdb.org", "headscale-panel")
	viper.SetDefault("influxdb.bucket", "metrics")
	viper.SetDefault("redis.addr", "localhost:6379")
	viper.SetDefault("redis.password", "")
	viper.SetDefault("redis.db", 0)

	// Manually bind env vars to nested keys because Viper doesn't automatically map flat env keys to nested structs
	viper.BindEnv("system.port", "SYSTEM_PORT")
	viper.BindEnv("system.release", "SYSTEM_RELEASE")
	viper.BindEnv("db.path", "DB_PATH")
	viper.BindEnv("jwt.secret", "JWT_SECRET")
	viper.BindEnv("jwt.expire", "JWT_EXPIRE")
	viper.BindEnv("headscale.grpc_addr", "HEADSCALE_GRPC_ADDR")
	viper.BindEnv("headscale.api_key", "HEADSCALE_API_KEY")
	viper.BindEnv("headscale.insecure", "HEADSCALE_INSECURE")
	viper.BindEnv("influxdb.url", "INFLUXDB_URL")
	viper.BindEnv("influxdb.token", "INFLUXDB_TOKEN")
	viper.BindEnv("influxdb.org", "INFLUXDB_ORG")
	viper.BindEnv("influxdb.bucket", "INFLUXDB_BUCKET")
	viper.BindEnv("redis.addr", "REDIS_ADDR")
	viper.BindEnv("redis.password", "REDIS_PASSWORD")
	viper.BindEnv("redis.db", "REDIS_DB")

	if err := viper.Unmarshal(&Conf); err != nil {
		log.Fatalf("Unable to decode into struct, %v", err)
	}
}
