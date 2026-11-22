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

package schema

import (
	"errors"
	"fmt"

	"gorm.io/gorm"
)

// Version is the layout the running binary expects.
//
// It is bumped whenever a table is renamed, split, or repurposed. The panel
// refuses to start on a mismatch rather than attempting a migration: the
// pre-2 layout had no separation between panel accounts and headscale users, so
// there is no reliable way to derive the new rows from the old ones, and a
// half-converted database is worse than a clean failure.
const Version = 2

// SettingKey is where the recorded version lives.
const SettingKey = "schema_version"

// ErrMismatch is returned when the database was built by a different version.
var ErrMismatch = errors.New("database schema version does not match this build")

// MismatchError carries both versions so the message can name them.
type MismatchError struct {
	Found uint
	Want  uint
}

func (e *MismatchError) Error() string {
	return fmt.Sprintf("database schema version %d, this build expects %d; "+
		"back up data/data.db if you need it, then run ./shell/dev/reset.sh to start clean", e.Found, e.Want)
}

// Is lets errors.Is(err, ErrMismatch) match a MismatchError.
func (e *MismatchError) Is(target error) bool { return target == ErrMismatch }

// Ensure reads the recorded version and either accepts it or reports a
// mismatch. On a brand-new database it records the current version.
//
// settingsTable is the panel_settings table name; it is passed in so this
// package does not depend on any domain model.
func Ensure(db *gorm.DB) error {
	var value string
	err := db.Raw("SELECT value FROM panel_settings WHERE key = ?", SettingKey).Scan(&value).Error
	if err != nil {
		return err
	}

	if value == "" {
		var count int64
		if err := db.Raw("SELECT count(*) FROM panel_settings").Scan(&count).Error; err != nil {
			return err
		}
		// A populated settings table without a recorded version is a database
		// from before the split; treat it as version 1 rather than as new.
		if count > 0 {
			return &MismatchError{Found: 1, Want: Version}
		}
		return setVersion(db)
	}

	var found uint
	if _, scanErr := fmt.Sscanf(value, "%d", &found); scanErr != nil {
		return &MismatchError{Found: 0, Want: Version}
	}
	if found != Version {
		return &MismatchError{Found: found, Want: Version}
	}
	return nil
}

func setVersion(db *gorm.DB) error {
	return db.Exec("INSERT INTO panel_settings (key, value) VALUES (?, ?)", SettingKey, fmt.Sprint(Version)).Error
}
