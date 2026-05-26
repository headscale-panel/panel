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

package application

import (
	"context"
	"headscale-panel/model"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/headscale"
	"headscale-panel/pkg/influxdb"
	"headscale-panel/router"
	"headscale-panel/router/services"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

type Server struct {
	router *gin.Engine
	server *http.Server
}

func NewServer() (*Server, error) {
	time.Local = time.UTC

	confPath, err := filepath.Abs(".env")
	if err != nil {
		logrus.WithError(err).Warn(constants.LogConfigPathFailed)
	}
	conf.Init(confPath)

	if conf.Conf.System.Debug {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	model.Init()

	// Restore headscale connection settings from DB (survives container restart)
	if services.LoadHeadscaleConnectionFromDB() {
		if err := services.HeadscaleInitService.InitializeFromCurrentConfig(context.Background()); err != nil {
			logrus.WithError(err).Warn("Headscale init flow failed; complete setup via WebUI")
		}
	} else {
		logrus.Warn("No Headscale connection configured; complete setup via WebUI")
	}

	if conf.Conf.InfluxDB.URL != "" {
		if err := influxdb.Init(influxdb.Config{
			URL:    conf.Conf.InfluxDB.URL,
			Token:  conf.Conf.InfluxDB.Token,
			Org:    conf.Conf.InfluxDB.Org,
			Bucket: conf.Conf.InfluxDB.Bucket,
		}); err != nil {
			logrus.WithError(err).Error("Failed to init InfluxDB client")
		} else {
			services.MetricsService.StartMetricsCollector(1 * time.Minute)
		}
	}

	if err := services.OIDCService.Init(); err != nil {
		return nil, err
	}

	r := router.InitRouter()

	return &Server{
		router: r,
	}, nil
}

func (s *Server) Run() {
	s.server = &http.Server{
		Addr:    conf.Conf.System.Port,
		Handler: s.router,
	}

	go func() {
		logrus.Infof("Server starting on %s", conf.Conf.System.Port)
		if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logrus.Fatalf("listen: %s\n", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logrus.Info("Shutting down server...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if s.server != nil {
		if err := s.server.Shutdown(shutdownCtx); err != nil {
			logrus.WithError(err).Error("Failed to gracefully shutdown HTTP server")
		}
	}

	services.MetricsService.StopMetricsCollector()
	services.StopWebSocket()

	headscale.Close()
	influxdb.Close()
	if err := model.Close(); err != nil {
		logrus.WithError(err).Warn("Failed to close database connection")
	}
}
