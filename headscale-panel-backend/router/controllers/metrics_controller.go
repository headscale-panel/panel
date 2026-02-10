package controllers

import (
	"fmt"
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type MetricsController struct{}

// GetOnlineDuration gets online duration for a user or device
// GET /api/metrics/online-duration?user_id=1&machine_id=xxx&start=2024-01-01&end=2024-01-31
func (c *MetricsController) GetOnlineDuration(ctx *gin.Context) {
	userID, _ := strconv.ParseUint(ctx.Query("user_id"), 10, 32)
	machineID := ctx.Query("machine_id")
	startStr := ctx.DefaultQuery("start", time.Now().AddDate(0, 0, -7).Format("2006-01-02"))
	endStr := ctx.DefaultQuery("end", time.Now().Format("2006-01-02"))

	start, err := time.Parse("2006-01-02", startStr)
	if err != nil {
		serializer.FailWithCode(ctx, serializer.CodeParamErr, "Invalid start date format")
		return
	}

	end, err := time.Parse("2006-01-02", endStr)
	if err != nil {
		serializer.FailWithCode(ctx, serializer.CodeParamErr, "Invalid end date format")
		return
	}
	end = end.Add(24 * time.Hour) // Include the end date

	duration, err := services.MetricsService.GetOnlineDuration(ctx, fmt.Sprintf("%d", userID), machineID, start, end)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, gin.H{
		"duration_seconds": duration.Seconds(),
		"duration_hours":   duration.Hours(),
		"duration_days":    duration.Hours() / 24,
	})
}

// GetOnlineDurationStats gets online duration statistics for all users
// GET /api/metrics/online-duration-stats?start=2024-01-01&end=2024-01-31
func (c *MetricsController) GetOnlineDurationStats(ctx *gin.Context) {
	startStr := ctx.DefaultQuery("start", time.Now().AddDate(0, 0, -7).Format("2006-01-02"))
	endStr := ctx.DefaultQuery("end", time.Now().Format("2006-01-02"))

	start, err := time.Parse("2006-01-02", startStr)
	if err != nil {
		serializer.FailWithCode(ctx, serializer.CodeParamErr, "Invalid start date format")
		return
	}

	end, err := time.Parse("2006-01-02", endStr)
	if err != nil {
		serializer.FailWithCode(ctx, serializer.CodeParamErr, "Invalid end date format")
		return
	}
	end = end.Add(24 * time.Hour)

	stats, err := services.MetricsService.GetOnlineDurationStats(ctx, start, end)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, stats)
}

// GetDeviceStatus gets current device status
// GET /api/metrics/device-status
func (c *MetricsController) GetDeviceStatus(ctx *gin.Context) {
	devices, err := services.MetricsService.GetDeviceStatus()
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, devices)
}

// GetDeviceStatusHistory gets device status history
// GET /api/metrics/device-status-history?machine_id=xxx&start=2024-01-01&end=2024-01-31
func (c *MetricsController) GetDeviceStatusHistory(ctx *gin.Context) {
	machineID := ctx.Query("machine_id")
	if machineID == "" {
		serializer.FailWithCode(ctx, serializer.CodeParamErr, "machine_id is required")
		return
	}

	startStr := ctx.DefaultQuery("start", time.Now().AddDate(0, 0, -7).Format("2006-01-02"))
	endStr := ctx.DefaultQuery("end", time.Now().Format("2006-01-02"))

	start, err := time.Parse("2006-01-02", startStr)
	if err != nil {
		serializer.FailWithCode(ctx, serializer.CodeParamErr, "Invalid start date format")
		return
	}

	end, err := time.Parse("2006-01-02", endStr)
	if err != nil {
		serializer.FailWithCode(ctx, serializer.CodeParamErr, "Invalid end date format")
		return
	}
	end = end.Add(24 * time.Hour)

	history, err := services.MetricsService.GetDeviceStatusHistory(ctx, machineID, start, end)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, history)
}

// GetTrafficStats gets traffic statistics
// GET /api/metrics/traffic?machine_id=xxx&start=2024-01-01&end=2024-01-31
func (c *MetricsController) GetTrafficStats(ctx *gin.Context) {
	machineID := ctx.Query("machine_id")
	startStr := ctx.DefaultQuery("start", time.Now().AddDate(0, 0, -7).Format("2006-01-02"))
	endStr := ctx.DefaultQuery("end", time.Now().Format("2006-01-02"))

	start, err := time.Parse("2006-01-02", startStr)
	if err != nil {
		serializer.FailWithCode(ctx, serializer.CodeParamErr, "Invalid start date format")
		return
	}

	end, err := time.Parse("2006-01-02", endStr)
	if err != nil {
		serializer.FailWithCode(ctx, serializer.CodeParamErr, "Invalid end date format")
		return
	}
	end = end.Add(24 * time.Hour)

	stats, err := services.MetricsService.GetTrafficStats(ctx, machineID, start, end)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	serializer.Success(ctx, stats)
}
