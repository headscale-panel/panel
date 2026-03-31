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
