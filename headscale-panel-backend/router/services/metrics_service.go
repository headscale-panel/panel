package services

import (
	"context"
	"fmt"
	"headscale-panel/pkg/influxdb"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"headscale-panel/pkg/utils/serializer"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
)

type metricsService struct {
	mu      sync.Mutex
	cancel  context.CancelFunc
	stopped chan struct{}
}

var MetricsService = &metricsService{}

// CollectDeviceStatus collects device status and writes to InfluxDB
func (s *metricsService) CollectDeviceStatus(ctx context.Context) error {
	ctx, cancel := withServiceTimeout(ctx)
	defer cancel()
	client, err := headscaleServiceClient()
	if err != nil {
		return err
	}

	nodes, err := client.ListNodes(ctx, &v1.ListNodesRequest{})
	if err != nil {
		return fmt.Errorf("failed to list nodes: %w", err)
	}

	for _, node := range nodes.Nodes {
		if node.User == nil {
			logrus.WithField("node_id", node.Id).Warn("Skip metrics collection for node without user")
			continue
		}

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
	s.StopMetricsCollector()

	collectorCtx, cancel := context.WithCancel(context.Background())
	stopped := make(chan struct{})

	s.mu.Lock()
	s.cancel = cancel
	s.stopped = stopped
	s.mu.Unlock()

	ticker := time.NewTicker(interval)
	go func() {
		defer close(stopped)
		defer ticker.Stop()
		for {
			select {
			case <-collectorCtx.Done():
				return
			case <-ticker.C:
			}

			func() {
				defer func() {
					if r := recover(); r != nil {
						logrus.WithField("panic", r).Error("panic recovered in metrics collector")
					}
				}()
				if err := s.CollectDeviceStatus(collectorCtx); err != nil {
					logrus.WithError(err).Error("Failed to collect device status")
				}
			}()
		}
	}()
	logrus.Infof("Metrics collector started with interval: %v", interval)
}

func (s *metricsService) StopMetricsCollector() {
	s.mu.Lock()
	cancel := s.cancel
	stopped := s.stopped
	s.cancel = nil
	s.stopped = nil
	s.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	if stopped != nil {
		<-stopped
	}
}

// GetOnlineDuration gets online duration for a user or device
func (s *metricsService) GetOnlineDuration(ctx context.Context, actorUserID uint, userID, machineID string, start, end time.Time) (time.Duration, error) {
	if err := RequirePermission(actorUserID, "metrics:online_duration:view"); err != nil {
		return 0, err
	}
	if strings.TrimSpace(machineID) != "" {
		nodes, _, err := listAccessibleNodes(ctx, actorUserID)
		if err != nil {
			return 0, err
		}
		for _, node := range nodes {
			if fmt.Sprintf("%d", node.Id) == strings.TrimSpace(machineID) {
				return influxdb.QueryOnlineDuration(ctx, "", machineID, start, end)
			}
		}
		return 0, serializer.ErrPermissionDenied
	}
	if strings.TrimSpace(userID) != "" {
		parsedUserID, err := strconv.ParseUint(strings.TrimSpace(userID), 10, 64)
		if err != nil {
			return 0, serializer.NewError(serializer.CodeParamErr, "invalid user_id", err)
		}
		if err := ensureActorCanAccessHeadscaleUserID(ctx, actorUserID, parsedUserID); err != nil {
			return 0, err
		}
	}
	return influxdb.QueryOnlineDuration(ctx, userID, machineID, start, end)
}

// GetDeviceStatusHistory gets device status history
func (s *metricsService) GetDeviceStatusHistory(ctx context.Context, actorUserID uint, machineID string, start, end time.Time) ([]map[string]interface{}, error) {
	if err := RequirePermission(actorUserID, "metrics:device_status_history:view"); err != nil {
		return nil, err
	}
	if strings.TrimSpace(machineID) == "" {
		return nil, serializer.NewError(serializer.CodeParamErr, "machine_id is required", nil)
	}
	nodes, _, err := listAccessibleNodes(ctx, actorUserID)
	if err != nil {
		return nil, err
	}
	for _, node := range nodes {
		if fmt.Sprintf("%d", node.Id) == strings.TrimSpace(machineID) {
			return influxdb.GetDeviceStatusHistory(ctx, machineID, start, end)
		}
	}
	return nil, serializer.ErrPermissionDenied
}

// GetOnlineDurationStats gets online duration statistics for all users
func (s *metricsService) GetOnlineDurationStats(ctx context.Context, actorUserID uint, start, end time.Time) ([]map[string]interface{}, error) {
	if err := RequirePermission(actorUserID, "metrics:online_duration_stats:view"); err != nil {
		return nil, err
	}
	nodes, _, err := listAccessibleNodes(ctx, actorUserID)
	if err != nil {
		return nil, err
	}

	var stats []map[string]interface{}
	for _, node := range nodes {
		duration, err := influxdb.QueryOnlineDuration(ctx, "", fmt.Sprintf("%d", node.Id), start, end)
		if err != nil {
			logrus.WithError(err).Warnf("Failed to get online duration for node %d", node.Id)
			continue
		}

		userID := ""
		userName := ""
		if node.User != nil {
			userID = fmt.Sprintf("%d", node.User.Id)
			userName = node.User.Name
		}

		stats = append(stats, map[string]interface{}{
			"machine_id":      fmt.Sprintf("%d", node.Id),
			"machine_name":    node.Name,
			"user_id":         userID,
			"user_name":       userName,
			"online_duration": duration.Seconds(),
			"online_hours":    duration.Hours(),
		})
	}

	return stats, nil
}

// GetDeviceStatus gets current device status
func (s *metricsService) GetDeviceStatus(ctx context.Context, actorUserID uint) ([]map[string]interface{}, error) {
	if err := RequirePermission(actorUserID, "metrics:device_status:view"); err != nil {
		return nil, err
	}
	nodes, _, err := listAccessibleNodes(ctx, actorUserID)
	if err != nil {
		return nil, err
	}

	var devices []map[string]interface{}
	for _, node := range nodes {
		online := false
		if node.LastSeen != nil {
			lastSeen := node.LastSeen.AsTime()
			online = time.Since(lastSeen) < 5*time.Minute
		}

		ipAddress := ""
		if len(node.IpAddresses) > 0 {
			ipAddress = node.IpAddresses[0]
		}

		userID := ""
		userName := ""
		if node.User != nil {
			userID = fmt.Sprintf("%d", node.User.Id)
			userName = node.User.Name
		}

		devices = append(devices, map[string]interface{}{
			"machine_id":   fmt.Sprintf("%d", node.Id),
			"machine_name": node.Name,
			"user_id":      userID,
			"user_name":    userName,
			"online":       online,
			"ip_address":   ipAddress,
			"last_seen":    node.LastSeen,
		})
	}

	return devices, nil
}

// GetTrafficStats gets traffic statistics for devices
// Note: Headscale doesn't provide traffic stats directly, so this returns basic info
func (s *metricsService) GetTrafficStats(ctx context.Context, actorUserID uint, machineID string, start, end time.Time) (map[string]interface{}, error) {
	if err := RequirePermission(actorUserID, "metrics:traffic:view"); err != nil {
		return nil, err
	}
	nodes, _, err := listAccessibleNodes(ctx, actorUserID)
	if err != nil {
		return nil, err
	}

	var totalDevices int64 = 0
	var onlineDevices int64 = 0
	var trafficData []map[string]interface{}

	for _, node := range nodes {
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

		userName := ""
		if node.User != nil {
			userName = node.User.Name
		}

		trafficData = append(trafficData, map[string]interface{}{
			"machine_id":   fmt.Sprintf("%d", node.Id),
			"machine_name": node.Name,
			"user_name":    userName,
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
