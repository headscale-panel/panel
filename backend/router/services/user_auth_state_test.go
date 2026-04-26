package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"headscale-panel/model"
	"headscale-panel/pkg/unifyerror"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func setupUserAuthStateTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	previousDB := model.DB
	t.Cleanup(func() {
		model.DB = previousDB
	})

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	model.DB = db

	if err := db.AutoMigrate(&model.Group{}, &model.User{}); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}

	return db
}

func TestLoginWithContextRejectsInactiveUser(t *testing.T) {
	db := setupUserAuthStateTestDB(t)

	group := model.Group{Name: "User"}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("create group: %v", err)
	}

	user := model.User{
		Username: "disabled-user",
		Password: "secret-pass",
		GroupID:  group.ID,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	if err := db.Model(&user).Update("is_active", false).Error; err != nil {
		t.Fatalf("disable user: %v", err)
	}

	_, _, err := UserService.LoginWithContext(context.Background(), &LoginRequest{
		Username: user.Username,
		Password: "secret-pass",
	})
	if err == nil {
		t.Fatal("expected inactive user login to fail")
	}

	var uniErr *unifyerror.UniErr
	if !errors.As(err, &uniErr) {
		t.Fatalf("expected AppError, got %T", err)
	}
	if uniErr.Code != unifyerror.CodeUserNotActive {
		t.Fatalf("unexpected error code: got %d want %d", uniErr.Code, unifyerror.CodeUserNotActive)
	}
}

func TestValidateSessionUserRejectsInactiveUser(t *testing.T) {
	db := setupUserAuthStateTestDB(t)

	group := model.Group{Name: "User"}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("create group: %v", err)
	}

	user := model.User{
		Username: "inactive-session",
		Password: "secret-pass",
		GroupID:  group.ID,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	if err := db.Model(&user).Update("is_active", false).Error; err != nil {
		t.Fatalf("disable user: %v", err)
	}

	_, err := ValidateSessionUser(user.ID)
	if err == nil {
		t.Fatal("expected inactive session validation to fail")
	}

	var uniErr *unifyerror.UniErr
	if !errors.As(err, &uniErr) {
		t.Fatalf("expected AppError, got %T", err)
	}
	if uniErr.Code != unifyerror.CodeInvalidToken {
		t.Fatalf("unexpected error code: got %d want %d", uniErr.Code, unifyerror.CodeInvalidToken)
	}
}

func TestMarkGuideTourSeenIsIdempotent(t *testing.T) {
	db := setupUserAuthStateTestDB(t)

	group := model.Group{Name: "User"}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("create group: %v", err)
	}

	user := model.User{
		Username: "tour-user",
		Password: "secret-pass",
		GroupID:  group.ID,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	if err := UserService.MarkGuideTourSeen(user.ID); err != nil {
		t.Fatalf("first mark guide tour seen: %v", err)
	}

	var marked model.User
	if err := db.First(&marked, user.ID).Error; err != nil {
		t.Fatalf("load marked user: %v", err)
	}
	if marked.GuideTourSeenAt == nil {
		t.Fatal("expected guide_tour_seen_at to be set")
	}

	firstSeenAt := *marked.GuideTourSeenAt
	time.Sleep(10 * time.Millisecond)

	if err := UserService.MarkGuideTourSeen(user.ID); err != nil {
		t.Fatalf("second mark guide tour seen: %v", err)
	}

	var markedAgain model.User
	if err := db.First(&markedAgain, user.ID).Error; err != nil {
		t.Fatalf("load user after second mark: %v", err)
	}
	if markedAgain.GuideTourSeenAt == nil {
		t.Fatal("expected guide_tour_seen_at to stay set")
	}
	if !markedAgain.GuideTourSeenAt.Equal(firstSeenAt) {
		t.Fatalf("expected guide_tour_seen_at to remain unchanged, got %v want %v", markedAgain.GuideTourSeenAt, firstSeenAt)
	}
}
