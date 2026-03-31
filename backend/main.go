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
