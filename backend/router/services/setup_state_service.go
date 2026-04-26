package services

import (
	"errors"
	"headscale-panel/model"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/unifyerror"
	"net/http"
	"sync"
	"time"

	"gorm.io/gorm"
)

type setupStateService struct {
	mu          sync.Mutex
	setupWindow time.Duration
}

var SetupStateService = newSetupStateService()

func newSetupStateService() *setupStateService {
	return &setupStateService{
		setupWindow: constants.SetupWindow,
	}
}

func (s *setupStateService) GetState() (*model.SetupState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	state, err := s.loadOrCreateLocked()
	if err != nil {
		return nil, err
	}
	if err := s.refreshLocked(state, time.Now()); err != nil {
		return nil, err
	}
	return state, nil
}

// IsWindowOpen reports whether setup operations are allowed inside the active
// initialization window and before the system is initialized.
func (s *setupStateService) IsWindowOpen(state *model.SetupState, now time.Time) bool {
	if state == nil {
		return false
	}
	if state.State != model.SetupStateInitWindow {
		return false
	}
	if state.WindowDeadline == nil {
		return true
	}
	return now.Before(*state.WindowDeadline)
}

func (s *setupStateService) RequireSetupWindow() (*model.SetupState, error) {
	state, err := s.GetState()
	if err != nil {
		return nil, err
	}
	if !s.IsWindowOpen(state, time.Now()) {
		return nil, unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, "setup window closed")
	}
	return state, nil
}

func (s *setupStateService) MarkInitialized() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	state, err := s.loadOrCreateLocked()
	if err != nil {
		return err
	}

	now := time.Now()
	state.State = model.SetupStateInitialized
	state.WindowDeadline = nil
	state.InitializedAt = &now
	if err := model.DB.Save(state).Error; err != nil {
		return unifyerror.DbError(err)
	}

	return nil
}

func (s *setupStateService) CanRegister() (bool, error) {
	state, err := s.GetState()
	if err != nil {
		return false, err
	}
	return state.State == model.SetupStateInitialized, nil
}

func (s *setupStateService) loadOrCreateLocked() (*model.SetupState, error) {
	var state model.SetupState
	err := model.DB.First(&state, 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		state = model.SetupState{
			ID:    1,
			State: model.SetupStateUninitialized,
		}
		if err := model.DB.Create(&state).Error; err != nil {
			return nil, unifyerror.DbError(err)
		}
		return &state, nil
	}
	if err != nil {
		return nil, unifyerror.DbError(err)
	}
	return &state, nil
}

func (s *setupStateService) refreshLocked(state *model.SetupState, now time.Time) error {
	var userCount int64
	if err := model.DB.Model(&model.User{}).Count(&userCount).Error; err != nil {
		return unifyerror.DbError(err)
	}

	changed := false

	if userCount > 0 {
		if state.State != model.SetupStateInitialized {
			state.State = model.SetupStateInitialized
			changed = true
		}
		if state.InitializedAt == nil {
			ts := now
			state.InitializedAt = &ts
			changed = true
		}
		if state.WindowDeadline != nil {
			state.WindowDeadline = nil
			changed = true
		}
	} else {
		if state.State == model.SetupStateInitialized {
			state.State = model.SetupStateUninitialized
			state.InitializedAt = nil
			changed = true
		}

		if state.State == model.SetupStateInitWindow {
			if state.WindowDeadline == nil {
				deadline := now.Add(s.setupWindow)
				state.WindowDeadline = &deadline
				changed = true
			} else if !now.Before(*state.WindowDeadline) {
				// Window has closed; keep deadline as a close marker and move to UNINITIALIZED.
				state.State = model.SetupStateUninitialized
				changed = true
			}
		}

		// First boot enters the initialization window once.
		if state.State == model.SetupStateUninitialized && state.WindowDeadline == nil {
			deadline := now.Add(s.setupWindow)
			state.State = model.SetupStateInitWindow
			state.WindowDeadline = &deadline
			changed = true
		}
	}

	if changed {
		if err := model.DB.Save(state).Error; err != nil {
			return unifyerror.DbError(err)
		}
	}
	return nil
}
