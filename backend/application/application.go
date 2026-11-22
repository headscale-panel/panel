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
	"headscale-panel/pkg/log"
	"headscale-panel/pkg/utils/jwt"
	"headscale-panel/router"
	"headscale-panel/router/services"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

type Server struct {
	router *gin.Engine
	server *http.Server
}

func NewServer(versionCode string) (*Server, error) {
	time.Local = time.UTC

	confPath, err := filepath.Abs(".env")
	if err != nil {
		log.L.Warn(constants.LogConfigPathFailed, zap.Error(err))
	}
	conf.Init(confPath)

	// Access tokens are signed with an asymmetric key that is generated once and
	// kept on disk. A shared secret in the environment could be read by anything
	// that can inspect the process, and it cannot be rotated without invalidating
	// every session at once.
	jwt.ConfigureKeyStore(constants.JWTSigningKeyPath)
	if _, err := jwt.KeyID(); err != nil {
		return nil, err
	}

	if conf.Conf.System.Debug {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	// gin writes its own route table and mode warnings straight to stdout.
	gin.DefaultWriter = log.Writer{Logger: log.L, Level: zapcore.DebugLevel}
	gin.DefaultErrorWriter = log.Writer{Logger: log.L, Level: zapcore.ErrorLevel}

	model.Init(versionCode)

	// The account domain owns roles and the permission catalogue, and validates
	// that the catalogue in code matches the one in the database. A mismatch is a
	// startup failure: it means a route guards on a code nobody can be granted.
	if err := services.InitAccountDomain(model.DB); err != nil {
		return nil, err
	}
	services.InitNetworkDomain(model.DB)

	// Restore headscale connection settings from DB (survives container restart)
	if services.LoadConnectionFromDB() {
		if err := services.HeadscaleInitService.InitializeFromCurrentConfig(context.Background()); err != nil {
			log.L.Warn("headscale init failed; finish the setup wizard in the UI", zap.Error(err))
		}
	} else {
		log.L.Warn("headscale connection is not configured yet; finish the setup wizard in the UI")
	}

	if err := services.IdPService.Init(); err != nil {
		return nil, err
	}

	if conf.Conf.InfluxDB.URL != "" {
		if err := influxdb.Init(influxdb.Config{
			URL:    conf.Conf.InfluxDB.URL,
			Token:  conf.Conf.InfluxDB.Token,
			Org:    conf.Conf.InfluxDB.Org,
			Bucket: conf.Conf.InfluxDB.Bucket,
		}); err != nil {
			log.L.Error("Failed to init InfluxDB client", zap.Error(err))
		} else {
			services.MetricsService.StartMetricsCollector(1 * time.Minute)
		}
	}

	r := router.InitRouter()

	return &Server{
		router: r,
	}, nil
}

func (s *Server) Run() {
	s.server = &http.Server{
		Addr:              conf.Conf.System.Port,
		Handler:           s.router,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	listenErr := make(chan error, 1)
	go func() {
		log.L.Info("Server starting", zap.String("addr", conf.Conf.System.Port))
		if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			listenErr <- err
		}
		close(listenErr)
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-listenErr:
		log.L.Fatal("listen failed", zap.Error(err))
	case <-quit:
		log.L.Info("Shutting down server...")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if s.server != nil {
		if err := s.server.Shutdown(shutdownCtx); err != nil {
			log.L.Error("Failed to gracefully shutdown HTTP server", zap.Error(err))
		}
	}

	services.MetricsService.StopMetricsCollector()
	services.StopWebSocket()

	headscale.Close()
	influxdb.Close()
	if err := model.Close(); err != nil {
		log.L.Warn("Failed to close database connection", zap.Error(err))
	}
}
