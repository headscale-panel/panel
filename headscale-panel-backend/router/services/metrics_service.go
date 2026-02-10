package services

import (
	"context"
	"fmt"
	"headscale-panel/pkg/headscale"
	"headscale-panel/pkg/influxdb"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"time"

	"github.com/sirupsen/logrus"
)

type metricsService struct{}

var MetricsService = &metricsService{}

// CollectDeviceStatus collects device status and writes to InfluxDB
func (s *metricsService) CollectDeviceStatus() error {
	nodes, err := headscale.GlobalClient.Service.ListNodes(context.Background(), &v1.ListNodesRequest{})
	if err != nil {
		return fmt.Errorf("failed to list nodes: %w", err)
	}

	for _, node := range nodes.Nodes {
		// Determine if device is online based on last seen time
		online := false
		if node.LastSeen != nil {
			lastSeen := node.LastSeen.AsTime()
			// Consider online if last seen within 5 minutes
			online = time.Since(lastSeen) < 5*time.Minute
		}

		// Get primary IP
		ipAddress := ""
		if len(node.IpAddresses) > 0 {
			ipAddress = node.IpAddresses[0]
		}

		// Write to InfluxDB
		influxdb.WriteDeviceStatus(
			fmt.Sprintf("%d", node.User.Id),
			fmt.Sprintf("%d", node.Id),
			node.Name,
			ipAddress,
			online,
		)
	}

	return nil
}

// StartMetricsCollector starts a background goroutine to collect metrics periodically
func (s *metricsService) StartMetricsCollector(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for range ticker.C {
			if err := s.CollectDeviceStatus(); err != nil {
				logrus.WithError(err).Error("Failed to collect device status")
			}
		}
	}()
	logrus.Infof("Metrics collector started with interval: %v", interval)
}

// GetOnlineDuration gets online duration for a user or device
func (s *metricsService) GetOnlineDuration(ctx context.Context, userID, machineID string, start, end time.Time) (time.Duration, error) {
	return influxdb.QueryOnlineDuration(ctx, userID, machineID, start, end)
}

// GetDeviceStatusHistory gets device status history
func (s *metricsService) GetDeviceStatusHistory(ctx context.Context, machineID string, start, end time.Time) ([]map[string]interface{}, error) {
	return influxdb.GetDeviceStatusHistory(ctx, machineID, start, end)
}

// GetOnlineDurationStats gets online duration statistics for all users
func (s *metricsService) GetOnlineDurationStats(ctx context.Context, start, end time.Time) ([]map[string]interface{}, error) {
	nodes, err := headscale.GlobalClient.Service.ListNodes(context.Background(), &v1.ListNodesRequest{})
	if err != nil {
		return nil, fmt.Errorf("failed to list nodes: %w", err)
	}

	var stats []map[string]interface{}
	for _, node := range nodes.Nodes {
		duration, err := s.GetOnlineDuration(ctx, "", fmt.Sprintf("%d", node.Id), start, end)
		if err != nil {
			logrus.WithError(err).Warnf("Failed to get online duration for node %d", node.Id)
			continue
		}

		stats = append(stats, map[string]interface{}{
			"machine_id":      fmt.Sprintf("%d", node.Id),
			"machine_name":    node.Name,
			"user_id":         fmt.Sprintf("%d", node.User.Id),
			"user_name":       node.User.Name,
			"online_duration": duration.Seconds(),
			"online_hours":    duration.Hours(),
		})
	}

	return stats, nil
}

// GetDeviceStatus gets current device status
func (s *metricsService) GetDeviceStatus() ([]map[string]interface{}, error) {
	nodes, err := headscale.GlobalClient.Service.ListNodes(context.Background(), &v1.ListNodesRequest{})
	if err != nil {
		return nil, fmt.Errorf("failed to list nodes: %w", err)
	}

	var devices []map[string]interface{}
	for _, node := range nodes.Nodes {
		online := false
		if node.LastSeen != nil {
			lastSeen := node.LastSeen.AsTime()
			online = time.Since(lastSeen) < 5*time.Minute
		}

		ipAddress := ""
		if len(node.IpAddresses) > 0 {
			ipAddress = node.IpAddresses[0]
		}

		devices = append(devices, map[string]interface{}{
			"machine_id":   fmt.Sprintf("%d", node.Id),
			"machine_name": node.Name,
			"user_id":      fmt.Sprintf("%d", node.User.Id),
			"user_name":    node.User.Name,
			"online":       online,
			"ip_address":   ipAddress,
			"last_seen":    node.LastSeen,
		})
	}

	return devices, nil
}

// GetTrafficStats gets traffic statistics for devices
// Note: Headscale doesn't provide traffic stats directly, so this returns basic info
func (s *metricsService) GetTrafficStats(ctx context.Context, machineID string, start, end time.Time) (map[string]interface{}, error) {
	nodes, err := headscale.GlobalClient.Service.ListNodes(context.Background(), &v1.ListNodesRequest{})
	if err != nil {
		return nil, fmt.Errorf("failed to list nodes: %w", err)
	}

	var totalDevices int64 = 0
	var onlineDevices int64 = 0
	var trafficData []map[string]interface{}

	for _, node := range nodes.Nodes {
		// Skip if machineID is specified and doesn't match
		if machineID != "" && fmt.Sprintf("%d", node.Id) != machineID {
			continue
		}

		online := false
		if node.LastSeen != nil {
			lastSeen := node.LastSeen.AsTime()
			online = time.Since(lastSeen) < 5*time.Minute
		}

		totalDevices++
		if online {
			onlineDevices++
		}

		trafficData = append(trafficData, map[string]interface{}{
			"machine_id":   fmt.Sprintf("%d", node.Id),
			"machine_name": node.Name,
			"user_name":    node.User.Name,
			"online":       online,
			"tx_bytes":     int64(0), // Headscale doesn't provide traffic stats
			"rx_bytes":     int64(0),
		})
	}

	return map[string]interface{}{
		"totalBytes":    int64(0),
		"totalDevices":  totalDevices,
		"onlineDevices": onlineDevices,
		"period_start":  start.Format(time.RFC3339),
		"period_end":    end.Format(time.RFC3339),
		"devices":       trafficData,
	}, nil
}
