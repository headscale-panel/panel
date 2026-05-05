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
