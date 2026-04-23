package application

import (
	"context"
	"headscale-panel/model"
	"headscale-panel/pkg/conf"
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
	confPath, err := filepath.Abs(".env")
	if err != nil {
		logrus.WithError(err).Warn("无法获取配置文件路径，使用默认配置")
	}
	conf.Init(confPath)

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
	gin.SetMode(gin.ReleaseMode)

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
