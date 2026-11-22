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

package model

import (
	"errors"
	"fmt"
	"headscale-panel/internal/account"
	"headscale-panel/internal/audit"
	hsconfig "headscale-panel/internal/config"
	"headscale-panel/internal/network"
	"headscale-panel/internal/schema"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/log"
	"os"
	"path/filepath"

	"github.com/glebarez/sqlite"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

var DB *gorm.DB

// CurrentVersion is the version of the running backend, set during Init().
var CurrentVersion string

// Init opens the database, migrates the schema and enforces the version guard.
//
// A mismatch is fatal on purpose: the panel has no migration path from the
// pre-split layout, and running against a half-understood database is a worse
// outcome than refusing to start.
func Init(versionCode string) {
	CurrentVersion = versionCode
	log.L.Info("Starting headscale-panel", zap.String("version", CurrentVersion))

	dbPath := constants.DBPath
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o700); err != nil {
		log.L.Fatal("cannot create data directory", zap.Error(err))
	}

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: newGORMLogger(conf.Conf.System.Debug),
	})
	if err != nil {
		log.L.Fatal("cannot open database", zap.Error(err))
	}
	DB = db

	if err := migrate(); err != nil {
		log.L.Fatal("schema migration failed", zap.Error(err))
	}
	if err := schema.Ensure(DB); err != nil {
		log.L.Fatal("database is not usable by this build", zap.Error(err))
	}
}

// migrate creates every table the running build owns.
func migrate() error {
	if err := DB.AutoMigrate(&PanelSetting{}, &SetupState{}, &PanelSSOSettings{}); err != nil {
		return fmt.Errorf("panel tables: %w", err)
	}

	if err := DB.AutoMigrate(account.Models()...); err != nil {
		return fmt.Errorf("account tables: %w", err)
	}

	if err := DB.AutoMigrate(network.Models()...); err != nil {
		return fmt.Errorf("network tables: %w", err)
	}

	if err := DB.AutoMigrate(audit.Models()...); err != nil {
		return fmt.Errorf("audit tables: %w", err)
	}

	if err := DB.AutoMigrate(hsconfig.Models()...); err != nil {
		return fmt.Errorf("headscale config tables: %w", err)
	}

	if err := DB.AutoMigrate(&Resource{}, &ACLPolicy{}, &DNSRecord{}); err != nil {
		return fmt.Errorf("panel content tables: %w", err)
	}

	return initSetupStateRecord()
}

// initSetupStateRecord makes sure the single setup-state row exists.
func initSetupStateRecord() error {
	var state SetupState
	err := DB.First(&state, 1).Error
	if err == nil {
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return fmt.Errorf("loading setup state: %w", err)
	}

	state = SetupState{ID: 1, State: SetupStateUninitialized}
	if err := DB.Create(&state).Error; err != nil {
		return fmt.Errorf("creating setup state: %w", err)
	}
	return nil
}

// EnsureAdminRoleReady reports whether the account domain has been bootstrapped.
//
// Called after the domain services are constructed; kept here so callers do not
// need to reach into the account package during startup ordering.
func EnsureAdminRoleReady(hasAdmin func() (bool, error)) bool {
	ok, err := hasAdmin()
	if err != nil {
		log.L.Error("cannot determine whether an administrator exists", zap.Error(err))
		return false
	}
	if !ok {
		log.L.Info("no administrator yet; complete setup at /panel/setup",
			zap.String("role", constants.SystemAdminRoleName))
	}
	return ok
}

// Close releases the database handle.
func Close() error {
	if DB == nil {
		return nil
	}
	sqlDB, err := DB.DB()
	if err != nil {
		return fmt.Errorf("cannot reach sql handle: %w", err)
	}
	return sqlDB.Close()
}
