// @title Headscale Panel API
// @version 1.0
// @description Headscale Panel management API
// @host localhost:8080
// @BasePath /panel/api/v1
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
package main

import (
	"headscale-panel/application"

	"github.com/sirupsen/logrus"
)

func main() {
	server, err := application.NewServer()
	if err != nil {
		logrus.WithError(err).Fatal("failed to start server")
	}
	server.Run()
}
