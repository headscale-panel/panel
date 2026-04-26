package controllers

import (
	"net/http"
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/pkg/influxdb"
	"headscale-panel/router/services"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type MetricsController struct{}

// GetOnlineDuration godoc
// @Summary Get online duration for user or device
// @Tags metrics
// @Produce json
// @Param user_id query string false "User ID"
// @Param machine_id query string false "Machine ID"
// @Param start query string false "Start date (YYYY-MM-DD)"
// @Param end query string false "End date (YYYY-MM-DD)"
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /metrics/online-duration [get]
// GetOnlineDuration gets online duration for a user or device
// GET /api/metrics/online-duration?user_id=1&machine_id=xxx&start=2024-01-01&end=2024-01-31
func (c *MetricsController) GetOnlineDuration(ctx *gin.Context) {
	actorUserID := ctx.GetUint("userID")
	userIDParam := ctx.Query("user_id")
	machineID := ctx.Query("machine_id")
	startStr := ctx.DefaultQuery("start", time.Now().AddDate(0, 0, -7).Format("2006-01-02"))
	endStr := ctx.DefaultQuery("end", time.Now().Format("2006-01-02"))

	start, err := time.Parse("2006-01-02", startStr)
	if err != nil {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "Invalid start date format"))
		return
	}

	end, err := time.Parse("2006-01-02", endStr)
	if err != nil {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "Invalid end date format"))
		return
	}
	end = end.Add(24 * time.Hour) // Include the end date

	if userIDParam != "" {
		if _, err := strconv.ParseUint(userIDParam, 10, 64); err != nil {
			unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "Invalid user_id"))
			return
		}
	}

	duration, err := services.MetricsService.GetOnlineDuration(ctx.Request.Context(), actorUserID, userIDParam, machineID, start, end)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, gin.H{
		"duration_seconds": duration.Seconds(),
		"duration_hours":   duration.Hours(),
		"duration_days":    duration.Hours() / 24,
	})
}

// GetOnlineDurationStats godoc
// @Summary Get online duration statistics for all users
// @Tags metrics
// @Produce json
// @Param start query string false "Start date (YYYY-MM-DD)"
// @Param end query string false "End date (YYYY-MM-DD)"
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /metrics/online-duration-stats [get]
// GetOnlineDurationStats gets online duration statistics for all users
// GET /api/metrics/online-duration-stats?start=2024-01-01&end=2024-01-31
func (c *MetricsController) GetOnlineDurationStats(ctx *gin.Context) {
	actorUserID := ctx.GetUint("userID")
	startStr := ctx.DefaultQuery("start", time.Now().AddDate(0, 0, -7).Format("2006-01-02"))
	endStr := ctx.DefaultQuery("end", time.Now().Format("2006-01-02"))

	start, err := time.Parse("2006-01-02", startStr)
	if err != nil {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "Invalid start date format"))
		return
	}

	end, err := time.Parse("2006-01-02", endStr)
	if err != nil {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "Invalid end date format"))
		return
	}
	end = end.Add(24 * time.Hour)

	stats, err := services.MetricsService.GetOnlineDurationStats(ctx.Request.Context(), actorUserID, start, end)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, stats)
}

// GetDeviceStatus godoc
// @Summary Get current device status
// @Tags metrics
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /metrics/device-status [get]
// GetDeviceStatus gets current device status
// GET /api/metrics/device-status
func (c *MetricsController) GetDeviceStatus(ctx *gin.Context) {
	actorUserID := ctx.GetUint("userID")
	devices, err := services.MetricsService.GetDeviceStatus(ctx.Request.Context(), actorUserID)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, devices)
}

// GetDeviceStatusHistory godoc
// @Summary Get device status history
// @Tags metrics
// @Produce json
// @Param machine_id query string true "Machine ID"
// @Param start query string false "Start date (YYYY-MM-DD)"
// @Param end query string false "End date (YYYY-MM-DD)"
// @Success 200 {object} unifyerror.Response{data=object}
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /metrics/device-status-history [get]
// GetDeviceStatusHistory gets device status history
// GET /api/metrics/device-status-history?machine_id=xxx&start=2024-01-01&end=2024-01-31
func (c *MetricsController) GetDeviceStatusHistory(ctx *gin.Context) {
	actorUserID := ctx.GetUint("userID")
	machineID := ctx.Query("machine_id")
	if machineID == "" {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "machine_id is required"))
		return
	}

	startStr := ctx.DefaultQuery("start", time.Now().AddDate(0, 0, -7).Format("2006-01-02"))
	endStr := ctx.DefaultQuery("end", time.Now().Format("2006-01-02"))

	start, err := time.Parse("2006-01-02", startStr)
	if err != nil {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "Invalid start date format"))
		return
	}

	end, err := time.Parse("2006-01-02", endStr)
	if err != nil {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "Invalid end date format"))
		return
	}
	end = end.Add(24 * time.Hour)

	history, err := services.MetricsService.GetDeviceStatusHistory(ctx.Request.Context(), actorUserID, machineID, start, end)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, history)
}

// GetTrafficStats godoc
// @Summary Get traffic statistics for a device
// @Tags metrics
// @Produce json
// @Param machine_id query string false "Machine ID"
// @Param start query string false "Start date (YYYY-MM-DD)"
// @Param end query string false "End date (YYYY-MM-DD)"
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /metrics/traffic [get]
// GetTrafficStats gets traffic statistics
// GET /api/metrics/traffic?machine_id=xxx&start=2024-01-01&end=2024-01-31
func (c *MetricsController) GetTrafficStats(ctx *gin.Context) {
	actorUserID := ctx.GetUint("userID")
	machineID := ctx.Query("machine_id")
	startStr := ctx.DefaultQuery("start", time.Now().AddDate(0, 0, -7).Format("2006-01-02"))
	endStr := ctx.DefaultQuery("end", time.Now().Format("2006-01-02"))

	start, err := time.Parse("2006-01-02", startStr)
	if err != nil {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "Invalid start date format"))
		return
	}

	end, err := time.Parse("2006-01-02", endStr)
	if err != nil {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "Invalid end date format"))
		return
	}
	end = end.Add(24 * time.Hour)

	stats, err := services.MetricsService.GetTrafficStats(ctx.Request.Context(), actorUserID, machineID, start, end)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}

	unifyerror.Success(ctx, stats)
}

// GetInfluxDBStatus godoc
// @Summary Get InfluxDB connection status
// @Tags metrics
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /metrics/influxdb-status [get]
// GetInfluxDBStatus returns whether InfluxDB is connected
// GET /api/metrics/influxdb-status
func (c *MetricsController) GetInfluxDBStatus(ctx *gin.Context) {
	unifyerror.Success(ctx, gin.H{
		"connected": influxdb.IsConnected(),
	})
}
