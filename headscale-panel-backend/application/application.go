package application

import (
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

func NewServer() *Server {
	confPath, err := filepath.Abs(".env")
	if err != nil {
		logrus.WithError(err).Warn("无法获取配置文件路径，使用默认配置")
	}
	conf.Init(confPath)

	model.Init()

	if err := headscale.Init(); err != nil {
		logrus.WithError(err).Error("Failed to init headscale client")
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
		logrus.WithError(err).Error("Failed to init OIDC service")
	}

	r := router.InitRouter()

	return &Server{
		router: r,
	}
}

func (s *Server) Run() {
	if conf.Conf.System.Release {
		gin.SetMode(gin.ReleaseMode)
	}

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

	influxdb.Close()
}
