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
	"headscale-panel/model"
	"testing"
	"time"
)

func TestSetupWindowOpenUsesDeadline(t *testing.T) {
	service := newSetupStateService()

	openDeadline := time.Now().Add(5 * time.Minute)
	openState := &model.SetupState{
		State:          model.SetupStateInitWindow,
		WindowDeadline: &openDeadline,
	}
	if !service.IsWindowOpen(openState, time.Now()) {
		t.Fatal("expected setup window to be open before deadline")
	}

	closedDeadline := time.Now().Add(-5 * time.Minute)
	closedState := &model.SetupState{
		State:          model.SetupStateInitWindow,
		WindowDeadline: &closedDeadline,
	}
	if service.IsWindowOpen(closedState, time.Now()) {
		t.Fatal("expected setup window to close after deadline")
	}

	nonWindowState := &model.SetupState{State: model.SetupStateUninitialized}
	if service.IsWindowOpen(nonWindowState, time.Now()) {
		t.Fatal("expected non-window setup state to be closed")
	}
}
