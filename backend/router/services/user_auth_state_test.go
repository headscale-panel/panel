package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"headscale-panel/model"
	"headscale-panel/pkg/utils/serializer"

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

	var appErr serializer.AppError
	if !errors.As(err, &appErr) {
		t.Fatalf("expected AppError, got %T", err)
	}
	if appErr.ErrCode() != serializer.CodeUserBaned {
		t.Fatalf("unexpected error code: got %d want %d", appErr.ErrCode(), serializer.CodeUserBaned)
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

	var appErr serializer.AppError
	if !errors.As(err, &appErr) {
		t.Fatalf("expected AppError, got %T", err)
	}
	if appErr.ErrCode() != serializer.CodeInvalidToken {
		t.Fatalf("unexpected error code: got %d want %d", appErr.ErrCode(), serializer.CodeInvalidToken)
	}
}
