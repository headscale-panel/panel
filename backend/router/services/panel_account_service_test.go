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
)

func TestBuildValidatedBindingsRejectsUnavailableHeadscale(t *testing.T) {
	entries := []BindingEntry{
		{HeadscaleName: "ghost-user", IsPrimary: true},
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
