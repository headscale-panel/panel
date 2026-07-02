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

package services

import (
	"testing"

	"headscale-panel/model"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestBuildValidatedBindingsRejectsUnavailableHeadscale(t *testing.T) {
	entries := []BindingEntry{
		{HeadscaleID: 99999},
	}

	bindings, err := buildValidatedBindings(1, entries)
	if err == nil {
		t.Fatal("expected binding validation to fail when headscale is unavailable")
	}
	if len(bindings) != 0 {
		t.Fatalf("expected no bindings on validation failure, got %d", len(bindings))
	}
}

func TestDeriveLoginMethodsRequiresPasswordForLocal(t *testing.T) {
	methods := deriveLoginMethods(&model.User{Provider: "local"})
	if len(methods) != 1 || methods[0] != "none" {
		t.Fatalf("expected local user without password to expose no login method, got %#v", methods)
	}
}

func setupPanelAccountImportTestDB(t *testing.T) {
	t.Helper()

	previousDB := model.DB
	t.Cleanup(func() {
		model.DB = previousDB
	})

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	model.DB = db
	if err := db.AutoMigrate(&model.User{}, &model.Group{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
}

func TestValidatePanelAccountImportRowsAcceptsValidRows(t *testing.T) {
	setupPanelAccountImportTestDB(t)

	group := model.Group{Name: "User"}
	if err := model.DB.Create(&group).Error; err != nil {
		t.Fatalf("create group: %v", err)
	}

	result, normalized, err := validatePanelAccountImportRows([]PanelAccountImportRow{
		{
			RowNumber:   2,
			Username:    "alice",
			Password:    "ChangeMe123",
			Email:       "alice@example.com",
			DisplayName: "Alice",
			GroupName:   "User",
		},
	})
	if err != nil {
		t.Fatalf("validate import rows: %v", err)
	}
	if result.HasErrors || !result.CanImport || result.Valid != 1 || result.Invalid != 0 {
		t.Fatalf("expected one valid row, got %#v", result)
	}
	if len(normalized) != 1 || normalized[0].GroupID != group.ID {
		t.Fatalf("expected normalized row with group id %d, got %#v", group.ID, normalized)
	}
}

func TestValidatePanelAccountImportRowsRejectsDuplicates(t *testing.T) {
	setupPanelAccountImportTestDB(t)

	if err := model.DB.Create(&model.User{Username: "existing", Password: "ChangeMe123", Provider: "local"}).Error; err != nil {
		t.Fatalf("create existing user: %v", err)
	}

	result, normalized, err := validatePanelAccountImportRows([]PanelAccountImportRow{
		{RowNumber: 2, Username: "existing", Password: "ChangeMe123"},
		{RowNumber: 3, Username: "new-user", Password: "ChangeMe123"},
		{RowNumber: 4, Username: "new-user", Password: "ChangeMe123"},
	})
	if err != nil {
		t.Fatalf("validate import rows: %v", err)
	}
	if !result.HasErrors || result.CanImport || result.Valid != 1 || result.Invalid != 2 {
		t.Fatalf("expected duplicate errors with one valid row, got %#v", result)
	}
	if len(normalized) != 1 || normalized[0].Username != "new-user" {
		t.Fatalf("expected only the first new-user row to normalize, got %#v", normalized)
	}
}
