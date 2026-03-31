package model

import "time"

const (
	SetupStateUninitialized = "UNINITIALIZED"
	SetupStateInitWindow    = "INIT_WINDOW"
	SetupStateInitialized   = "INITIALIZED"
)

// SetupState persists the setup lifecycle state machine.
// ID is fixed to 1 to keep a singleton row.
type SetupState struct {
	ID             uint       `gorm:"primaryKey"`
	State          string     `gorm:"type:varchar(32);not null"`
	WindowDeadline *time.Time `gorm:"column:window_deadline"`
	InitializedAt  *time.Time `gorm:"column:initialized_at"`
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (SetupState) TableName() string {
	return "setup_state"
}
