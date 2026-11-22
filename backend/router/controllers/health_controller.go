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

package controllers

import (
	"headscale-panel/model"
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/services"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Healthz reports process liveness only.
//
// It deliberately does not touch the database or headscale: a liveness probe that
// fails when a dependency is down causes the orchestrator to restart a process
// that is working fine.
func Healthz(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "alive"})
}

// Readyz reports whether the panel can serve traffic.
//
// This one does check the database, because an instance that cannot read its own
// schema has nothing useful to say and should be taken out of rotation.
func Readyz(c *gin.Context) {
	sqlDB, err := model.DB.DB()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable", "detail": "database handle"})
		return
	}
	if pingErr := sqlDB.Ping(); pingErr != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable", "detail": "database unreachable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ready"})
}

// Version reports the panel build.
func Version(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"version": model.CurrentVersion})
}

// HealthController reports the overall system state.
type HealthController struct{}

// NewHealthController builds the controller.
func NewHealthController() *HealthController {
	return &HealthController{}
}

// Get godoc
// @Summary System health summary
// @Tags system
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /system/health [get]
func (h *HealthController) Get(c *gin.Context) {
	report, err := services.SystemHealth(c.Request.Context())
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, report)
}

// AuditEventsQuery filters the audit log.
type AuditEventsQuery struct {
	unifyerror.PaginationQuery
	ActorID  uint   `form:"actor_id"`
	Action   string `form:"action"`
	Resource string `form:"resource"`
	Success  *bool  `form:"success"`
}

// AuditEvents godoc
// @Summary Read the audit log
// @Tags system
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /system/audit-events [get]
func (h *HealthController) AuditEvents(c *gin.Context) {
	if err := services.RequirePermission(c.GetUint("userID"), permissionAuditList); err != nil {
		unifyerror.Fail(c, err)
		return
	}

	var q AuditEventsQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	page, pageSize := normalizePage(q.Page, q.PageSize)
	events, total, err := services.ListAuditEvents(services.AuditFilter{
		ActorID:  q.ActorID,
		Action:   q.Action,
		Resource: q.Resource,
		Success:  q.Success,
		Offset:   (page - 1) * pageSize,
		Limit:    pageSize,
	})
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	unifyerror.Success(c, gin.H{"list": events, "total": total, "page": page, "page_size": pageSize})
}

// normalizePage clamps pagination inputs.
func normalizePage(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > 200 {
		pageSize = 200
	}
	return page, pageSize
}

var _ = strconv.Itoa
