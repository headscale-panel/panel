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

package influxdb

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	influxdb2 "github.com/influxdata/influxdb-client-go/v2"
	"github.com/influxdata/influxdb-client-go/v2/api"
	"headscale-panel/pkg/log"
	"go.uber.org/zap"
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
		log.L.Warn("InfluxDB URL not configured, metrics collection disabled")
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

	log.L.Info("InfluxDB client initialized successfully")
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

// IsConnected returns true if the InfluxDB client is initialized and ready.
func IsConnected() bool {
	return Client != nil && QueryAPI != nil
}

// WriteDeviceStatus writes device online status to InfluxDB
func WriteDeviceStatus(userID, machineID, machineName, ipAddress string, online bool) {
	if WriteAPI == nil {
		return
	}

	normalizedUserID, err := normalizeNumericID("user_id", userID, true)
	if err != nil {
		log.L.Warn("Skip writing device status due to invalid user_id", zap.Error(err))
		return
	}
	normalizedMachineID, err := normalizeNumericID("machine_id", machineID, true)
	if err != nil {
		log.L.Warn("Skip writing device status due to invalid machine_id", zap.Error(err))
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
		log.L.Warn("Skip writing device traffic due to invalid machine_id", zap.Error(err))
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
func QueryOnlineDuration(ctx context.Context, userID, machineID string, start *time.Time, end time.Time) (time.Duration, error) {
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

	rangeClause := buildFluxRangeClause(start, end)

	query := fmt.Sprintf(`
		from(bucket: %s)
			%s
			|> filter(fn: (r) => r["_measurement"] == "device_status")
			|> filter(fn: (r) => %s)
			|> filter(fn: (r) => r["_field"] == "online")
			|> filter(fn: (r) => r["_value"] == true)
			|> elapsed(unit: 1s)
			|> sum(column: "elapsed")
	`, fluxStringLiteral(bucket), rangeClause, filter)

	result, err := QueryAPI.Query(ctx, query)
	if err != nil {
		return 0, fmt.Errorf("query failed: %w", err)
	}
	defer result.Close()

	var totalSeconds int64
	for result.Next() {
		record := result.Record()
		if val, ok := toInt64Seconds(record.ValueByKey("elapsed")); ok {
			totalSeconds += val
			continue
		}
		if val, ok := toInt64Seconds(record.Value()); ok {
			totalSeconds += val
		}
	}

	if result.Err() != nil {
		return 0, result.Err()
	}

	return time.Duration(totalSeconds) * time.Second, nil
}

// GetDeviceStatusHistory gets device status history
func GetDeviceStatusHistory(ctx context.Context, machineID string, start *time.Time, end time.Time) ([]map[string]interface{}, error) {
	normalizedMachineID, err := normalizeNumericID("machine_id", machineID, true)
	if err != nil {
		return nil, err
	}

	if QueryAPI == nil {
		return nil, fmt.Errorf("InfluxDB not configured")
	}

	rangeClause := buildFluxRangeClause(start, end)

	query := fmt.Sprintf(`
		from(bucket: %s)
			%s
			|> filter(fn: (r) => r["_measurement"] == "device_status")
			|> filter(fn: (r) => r["machine_id"] == %s)
			|> filter(fn: (r) => r["_field"] == "status")
	`, fluxStringLiteral(bucket), rangeClause, fluxStringLiteral(normalizedMachineID))

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

func toInt64Seconds(value interface{}) (int64, bool) {
	switch v := value.(type) {
	case int64:
		return v, true
	case int:
		return int64(v), true
	case int32:
		return int64(v), true
	case uint64:
		if v > uint64(^uint64(0)>>1) {
			return 0, false
		}
		return int64(v), true
	case uint32:
		return int64(v), true
	case float64:
		if v < 0 {
			return 0, false
		}
		return int64(v), true
	case float32:
		if v < 0 {
			return 0, false
		}
		return int64(v), true
	default:
		return 0, false
	}
}

// GetDeviceStatusHistories gets device status history for multiple machines in one query.
func GetDeviceStatusHistories(ctx context.Context, machineIDs []string, start *time.Time, end time.Time) (map[string][]map[string]interface{}, error) {
	if QueryAPI == nil {
		return nil, fmt.Errorf("InfluxDB not configured")
	}

	machineFilterClause, normalizedMachineIDs, err := buildMachineIDFilterClause(machineIDs)
	if err != nil {
		return nil, err
	}

	rangeClause := buildFluxRangeClause(start, end)

	query := fmt.Sprintf(`
		from(bucket: %s)
			%s
			|> filter(fn: (r) => r["_measurement"] == "device_status")
			|> filter(fn: (r) => r["_field"] == "status")
			|> filter(fn: (r) => %s)
	`, fluxStringLiteral(bucket), rangeClause, machineFilterClause)

	result, err := QueryAPI.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer result.Close()

	histories := make(map[string][]map[string]interface{}, len(normalizedMachineIDs))
	for _, machineID := range normalizedMachineIDs {
		histories[machineID] = make([]map[string]interface{}, 0)
	}

	for result.Next() {
		record := result.Record()
		machineID := strings.TrimSpace(fmt.Sprintf("%v", record.ValueByKey("machine_id")))
		if machineID == "" {
			continue
		}

		histories[machineID] = append(histories[machineID], map[string]interface{}{
			"time":   record.Time(),
			"status": record.Value(),
		})
	}

	if result.Err() != nil {
		return nil, result.Err()
	}

	return histories, nil
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

func buildFluxRangeClause(start *time.Time, end time.Time) string {
	if start == nil {
		return fmt.Sprintf(`|> range(start: 0, stop: %s)`, end.Format(time.RFC3339))
	}
	return fmt.Sprintf(`|> range(start: %s, stop: %s)`, start.Format(time.RFC3339), end.Format(time.RFC3339))
}

func buildMachineIDFilterClause(machineIDs []string) (string, []string, error) {
	normalized := make([]string, 0, len(machineIDs))
	seen := make(map[string]struct{}, len(machineIDs))

	for _, machineID := range machineIDs {
		id, err := normalizeNumericID("machine_id", machineID, true)
		if err != nil {
			return "", nil, err
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		normalized = append(normalized, id)
	}

	if len(normalized) == 0 {
		return "", nil, fmt.Errorf("machine_ids is required")
	}

	filters := make([]string, 0, len(normalized))
	for _, machineID := range normalized {
		filters = append(filters, fmt.Sprintf(`r["machine_id"] == %s`, fluxStringLiteral(machineID)))
	}

	return strings.Join(filters, " or "), normalized, nil
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
