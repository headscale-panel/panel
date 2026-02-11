package influxdb

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	"github.com/influxdata/influxdb-client-go/v2/api"
	"github.com/sirupsen/logrus"
)

var (
	Client   influxdb2.Client
	WriteAPI api.WriteAPI
	QueryAPI api.QueryAPI
	bucket   string
	idRegex  = regexp.MustCompile(`^[0-9]{1,20}$`)
)

type Config struct {
	URL    string
	Token  string
	Org    string
	Bucket string
}

func Init(cfg Config) error {
	if cfg.URL == "" {
		logrus.Warn("InfluxDB URL not configured, metrics collection disabled")
		return nil
	}
	if strings.TrimSpace(cfg.Org) == "" {
		return fmt.Errorf("influxdb org is required when URL is configured")
	}
	if strings.TrimSpace(cfg.Bucket) == "" {
		return fmt.Errorf("influxdb bucket is required when URL is configured")
	}

	Client = influxdb2.NewClient(cfg.URL, cfg.Token)

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	health, err := Client.Health(ctx)
	if err != nil {
		return fmt.Errorf("failed to connect to InfluxDB: %w", err)
	}

	if health.Status != "pass" {
		message := ""
		if health.Message != nil {
			message = *health.Message
		}
		return fmt.Errorf("InfluxDB health check failed: status=%s message=%s", health.Status, message)
	}

	WriteAPI = Client.WriteAPI(cfg.Org, cfg.Bucket)
	QueryAPI = Client.QueryAPI(cfg.Org)
	bucket = cfg.Bucket

	logrus.Info("InfluxDB client initialized successfully")
	return nil
}

func Close() {
	if WriteAPI != nil {
		WriteAPI.Flush()
	}
	if Client != nil {
		Client.Close()
	}
	Client = nil
	WriteAPI = nil
	QueryAPI = nil
	bucket = ""
}

// WriteDeviceStatus writes device online status to InfluxDB
func WriteDeviceStatus(userID, machineID, machineName, ipAddress string, online bool) {
	if WriteAPI == nil {
		return
	}

	normalizedUserID, err := normalizeNumericID("user_id", userID, true)
	if err != nil {
		logrus.WithError(err).Warn("Skip writing device status due to invalid user_id")
		return
	}
	normalizedMachineID, err := normalizeNumericID("machine_id", machineID, true)
	if err != nil {
		logrus.WithError(err).Warn("Skip writing device status due to invalid machine_id")
		return
	}

	status := "offline"
	if online {
		status = "online"
	}

	p := influxdb2.NewPoint(
		"device_status",
		map[string]string{
			"user_id":      normalizedUserID,
			"machine_id":   normalizedMachineID,
			"machine_name": machineName,
		},
		map[string]interface{}{
			"status":     status,
			"online":     online,
			"ip_address": ipAddress,
		},
		time.Now(),
	)

	WriteAPI.WritePoint(p)
}

// WriteDeviceTraffic writes device traffic statistics to InfluxDB
func WriteDeviceTraffic(machineID string, rxBytes, txBytes uint64) {
	if WriteAPI == nil {
		return
	}

	normalizedMachineID, err := normalizeNumericID("machine_id", machineID, true)
	if err != nil {
		logrus.WithError(err).Warn("Skip writing device traffic due to invalid machine_id")
		return
	}

	p := influxdb2.NewPoint(
		"device_traffic",
		map[string]string{
			"machine_id": normalizedMachineID,
		},
		map[string]interface{}{
			"rx_bytes": rxBytes,
			"tx_bytes": txBytes,
		},
		time.Now(),
	)

	WriteAPI.WritePoint(p)
}

// QueryOnlineDuration queries the total online duration for a user or device
func QueryOnlineDuration(ctx context.Context, userID, machineID string, start, end time.Time) (time.Duration, error) {
	var err error
	normalizedUserID := ""
	normalizedMachineID := ""

	if strings.TrimSpace(userID) != "" {
		normalizedUserID, err = normalizeNumericID("user_id", userID, true)
		if err != nil {
			return 0, err
		}
	}
	if strings.TrimSpace(machineID) != "" {
		normalizedMachineID, err = normalizeNumericID("machine_id", machineID, true)
		if err != nil {
			return 0, err
		}
	}
	if normalizedUserID == "" && normalizedMachineID == "" {
		return 0, fmt.Errorf("either user_id or machine_id is required")
	}

	if QueryAPI == nil {
		return 0, fmt.Errorf("InfluxDB not configured")
	}

	filter := fmt.Sprintf(`r["user_id"] == %s`, fluxStringLiteral(normalizedUserID))
	if normalizedMachineID != "" {
		filter = fmt.Sprintf(`r["machine_id"] == %s`, fluxStringLiteral(normalizedMachineID))
	}

	query := fmt.Sprintf(`
		from(bucket: %s)
			|> range(start: %s, stop: %s)
			|> filter(fn: (r) => r["_measurement"] == "device_status")
			|> filter(fn: (r) => %s)
			|> filter(fn: (r) => r["_field"] == "online")
			|> filter(fn: (r) => r["_value"] == true)
			|> elapsed(unit: 1s)
			|> sum()
	`, fluxStringLiteral(bucket), start.Format(time.RFC3339), end.Format(time.RFC3339), filter)

	result, err := QueryAPI.Query(ctx, query)
	if err != nil {
		return 0, fmt.Errorf("query failed: %w", err)
	}
	defer result.Close()

	var totalSeconds int64
	for result.Next() {
		if val, ok := result.Record().Value().(int64); ok {
			totalSeconds += val
		}
	}

	if result.Err() != nil {
		return 0, result.Err()
	}

	return time.Duration(totalSeconds) * time.Second, nil
}

// GetDeviceStatusHistory gets device status history
func GetDeviceStatusHistory(ctx context.Context, machineID string, start, end time.Time) ([]map[string]interface{}, error) {
	normalizedMachineID, err := normalizeNumericID("machine_id", machineID, true)
	if err != nil {
		return nil, err
	}

	if QueryAPI == nil {
		return nil, fmt.Errorf("InfluxDB not configured")
	}

	query := fmt.Sprintf(`
		from(bucket: %s)
			|> range(start: %s, stop: %s)
			|> filter(fn: (r) => r["_measurement"] == "device_status")
			|> filter(fn: (r) => r["machine_id"] == %s)
			|> filter(fn: (r) => r["_field"] == "status")
	`, fluxStringLiteral(bucket), start.Format(time.RFC3339), end.Format(time.RFC3339), fluxStringLiteral(normalizedMachineID))

	result, err := QueryAPI.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer result.Close()

	var records []map[string]interface{}
	for result.Next() {
		record := result.Record()
		records = append(records, map[string]interface{}{
			"time":   record.Time(),
			"status": record.Value(),
		})
	}

	if result.Err() != nil {
		return nil, result.Err()
	}

	return records, nil
}

func fluxStringLiteral(input string) string {
	replacer := strings.NewReplacer(
		"\\", "\\\\",
		"\"", "\\\"",
		"\n", " ",
		"\r", " ",
		"\t", " ",
	)
	return fmt.Sprintf("\"%s\"", replacer.Replace(input))
}

func normalizeNumericID(field, value string, required bool) (string, error) {
	normalized := strings.TrimSpace(value)
	if normalized == "" {
		if required {
			return "", fmt.Errorf("%s is required", field)
		}
		return "", nil
	}

	if !idRegex.MatchString(normalized) {
		return "", fmt.Errorf("invalid %s format", field)
	}

	return normalized, nil
}
