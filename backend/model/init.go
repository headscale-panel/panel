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
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/log"
	"os"
	"path/filepath"
	"strings"

	"github.com/glebarez/sqlite"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/mod/semver"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// CurrentVersion is the version of the running backend, set during Init().
var CurrentVersion string

const migrationUpperBound_Admin = "v1.34.0"
const migrationUpperBound_Oauth = "v1.34.0"

func Init(versionCode string) {
	CurrentVersion = versionCode
	log.L.Info("Starting headscale-panel", zap.String("version", CurrentVersion))
	dbPath := filepath.Join(constants.DataDir, "data.db")
	if err := os.MkdirAll(constants.DataDir, 0700); err != nil {
		log.L.Fatal("models.Setup: failed to create data directory", zap.Error(err))
	}

	gormLogger := logger.Default.LogMode(logger.Silent)
	if conf.Conf.System.Debug {
		gormLogger = logger.Default.LogMode(logger.Info)
	}

	var err error
	DB, err = gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: gormLogger,
	})
	if err != nil {
		log.L.Fatal("models.Setup failed", zap.Error(err))
	}

	// Auto-migrate
	err = DB.AutoMigrate(
		&User{},
		&Group{},
		&Resource{},
		&Permission{},
		&OauthClient{},
		&ACLPolicy{},
		&DNSRecord{},
		&SetupState{},
		&PanelSetting{},
		&UserIdentityBinding{},
	)
	if err != nil {
		log.L.Fatal("models.AutoMigrate failed", zap.Error(err))
	}

	initDefaultData()
}

func Close() error {
	if DB == nil {
		return nil
	}
	sqlDB, err := DB.DB()
	if err != nil {
		return fmt.Errorf("failed to get sql db: %w", err)
	}
	if err := sqlDB.Close(); err != nil {
		return fmt.Errorf("failed to close sql db: %w", err)
	}
	return nil
}

func initDefaultData() {
	// Default permissions
	for _, def := range constants.DefaultPermissions {
		perm := Permission{Name: def.Name, Code: def.Code, Type: def.Type}
		if err := DB.Where(Permission{Code: perm.Code}).FirstOrCreate(&perm).Error; err != nil {
			log.L.Fatal("failed to bootstrap permission", zap.String("code", perm.Code), zap.Error(err))
		}
	}

	// Admin group
	var adminGroup Group
	if err := DB.Where("name = ?", constants.GROUP_ADMIN).First(&adminGroup).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			adminGroup = Group{Name: constants.GROUP_ADMIN}
			if err := DB.Create(&adminGroup).Error; err != nil {
				log.L.Fatal("failed to bootstrap Admin group", zap.Error(err))
			}
		} else {
			log.L.Fatal("failed to load Admin group", zap.Error(err))
		}
	}

	// Normal user group
	var userGroup Group
	if err := DB.Where("name = ?", constants.GROUP_USER).First(&userGroup).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			userGroup = Group{Name: constants.GROUP_USER}
			if err := DB.Create(&userGroup).Error; err != nil {
				log.L.Fatal("failed to bootstrap User group", zap.Error(err))
			}
		} else {
			log.L.Fatal("failed to load User group", zap.Error(err))
		}
	}

	// Assign all permissions to admin group
	var allPermissions []Permission
	if err := DB.Find(&allPermissions).Error; err != nil {
		log.L.Fatal("failed to load permissions for Admin group", zap.Error(err))
	}
	if err := DB.Model(&adminGroup).Association("Permissions").Replace(allPermissions); err != nil {
		log.L.Fatal("failed to assign Admin group permissions", zap.Error(err))
	}

	var userCount int64
	if err := DB.Model(&User{}).Count(&userCount).Error; err == nil && userCount == 0 {
		log.L.Info("No users found. Create the first admin via /api/v1/setup/init")
	}

	runLegacyMigrations()
	initSetupStateRecord()
	initVersionCode()
}

func initSetupStateRecord() {
	var state SetupState
	err := DB.First(&state, 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		state = SetupState{
			ID:    1,
			State: SetupStateUninitialized,
		}
		if err := DB.Create(&state).Error; err != nil {
			log.L.Fatal("failed to initialize setup state", zap.Error(err))
		}
		return
	}
	if err != nil {
		log.L.Fatal("failed to load setup state", zap.Error(err))
	}
}

// runLegacyMigrations runs data migrations for upgrading from older versions.
func runLegacyMigrations() {
	if !semver.IsValid(CurrentVersion) {
		log.L.Warn("Invalid VersionCode format, skipping legacy migrations", zap.String("version", CurrentVersion))
		return
	}

	migrateAdminFlag(CurrentVersion)
	migrateLegacyOauthClientSecrets(CurrentVersion)
}

// initVersionCode writes the current version to PanelSetting if set.
func initVersionCode() {
	if CurrentVersion == "" {
		return
	}

	key := "version_code"
	var setting PanelSetting
	err := DB.Where("key = ?", key).First(&setting).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		setting = PanelSetting{Key: key, Value: CurrentVersion}
		if err := DB.Create(&setting).Error; err != nil {
			log.L.Error("failed to create version_code panel setting", zap.Error(err))
		}
		return
	}
	if err != nil {
		log.L.Error("failed to query version_code panel setting", zap.Error(err))
		return
	}

	if err := DB.Model(&setting).Update("value", CurrentVersion).Error; err != nil {
		log.L.Error("failed to update version_code panel setting", zap.Error(err))
	}
}

// migrateAdminFlag ensures at least one user has is_admin = true.
// If no admin exists, promotes the earliest created user.
// Runs for versions >= 1.24.0 and < 1.34.0.
func migrateAdminFlag(v string) {
	if semver.Compare(v, migrationUpperBound_Admin) >= 0 {
		return
	}

	var userCount int64
	if err := DB.Model(&User{}).Count(&userCount).Error; err != nil || userCount == 0 {
		return
	}

	var adminCount int64
	if err := DB.Model(&User{}).Where("is_admin = ?", true).Count(&adminCount).Error; err != nil {
		log.L.Error("migrateAdminFlag: failed to count admins", zap.Error(err))
		return
	}
	if adminCount > 0 {
		return
	}

	var earliest User
	if err := DB.Order("id").First(&earliest).Error; err != nil {
		return
	}

	if err := DB.Model(&earliest).Update("is_admin", true).Error; err != nil {
		log.L.Error("migrateAdminFlag: failed to promote user to admin", zap.Uint("userID", earliest.ID), zap.Error(err))
		return
	}
	log.L.Info("migrateAdminFlag: promoted earliest user to admin", zap.Uint("userID", earliest.ID), zap.String("username", earliest.Username))
}

// migrateLegacyOauthClientSecrets hashes legacy plaintext OAuth client secrets.
// Runs for versions >= 1.24.0 and < 1.34.0.
func migrateLegacyOauthClientSecrets(v string) {
	if semver.Compare(v, migrationUpperBound_Oauth) >= 0 {
		return
	}

	var clients []OauthClient
	if err := DB.
		Where("(client_secret_hash IS NULL OR client_secret_hash = '') AND client_secret IS NOT NULL AND client_secret <> ''").
		Find(&clients).Error; err != nil {
		log.L.Error("migrateLegacyOauthClientSecrets: query legacy oauth clients failed", zap.Error(err))
		return
	}

	for _, client := range clients {
		legacySecret := strings.TrimSpace(client.ClientSecret)
		if legacySecret == "" {
			continue
		}

		normalizedSecret := strings.ToLower(legacySecret)
		if normalizedSecret == "headscale-secret" {
			log.L.Error("migrateLegacyOauthClientSecrets: oidc client uses insecure default secret; rotate before startup", zap.String("clientID", client.ClientID))
			continue
		}

		hashedSecret, err := bcrypt.GenerateFromPassword([]byte(legacySecret), bcrypt.DefaultCost)
		if err != nil {
			log.L.Error("migrateLegacyOauthClientSecrets: hash oauth secret failed", zap.String("clientID", client.ClientID), zap.Error(err))
			continue
		}

		if err := DB.Model(&OauthClient{}).
			Where("id = ?", client.ID).
			Updates(map[string]interface{}{
				"client_secret_hash": string(hashedSecret),
				"client_secret":      "",
			}).Error; err != nil {
			log.L.Error("migrateLegacyOauthClientSecrets: persist oauth secret hash failed", zap.String("clientID", client.ClientID), zap.Error(err))
		}
	}
}
