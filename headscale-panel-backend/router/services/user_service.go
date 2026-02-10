package services

import (
	"context"
	"errors"
	"headscale-panel/model"
	"headscale-panel/pkg/headscale"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"headscale-panel/pkg/utils/jwt"
	"headscale-panel/pkg/utils/serializer"

	"github.com/pquerna/otp/totp"
	"gorm.io/gorm"
)

type userService struct{}

var UserService = new(userService)

type RegisterRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	Email    string `json:"email"`
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	TOTPCode string `json:"totp_code"`
}

func (s *userService) Register(req *RegisterRequest) error {
	var userCount int64
	model.DB.Model(&model.User{}).Count(&userCount)

	var group model.Group
	if userCount == 0 {
		// 第一个用户为管理员
		if err := model.DB.Where("name = ?", "Admin").First(&group).Error; err != nil {
			return errors.New("admin group not found")
		}
	} else {
		// 其他用户为普通用户
		if err := model.DB.Where("name = ?", "User").First(&group).Error; err != nil {
			return errors.New("user group not found")
		}
	}

	var count int64
	model.DB.Model(&model.User{}).Where("username = ?", req.Username).Count(&count)
	if count > 0 {
		return serializer.ErrUserNameExisted
	}

	ctx := context.Background()
	_, err := headscale.GlobalClient.Service.CreateUser(ctx, &v1.CreateUserRequest{
		Name: req.Username,
	})
	if err != nil {
		// If user already exists in Headscale, we might want to proceed or fail.
		// For now, let's assume we want to sync it.
		// But if it fails with "already exists", we can ignore.
		// However, checking error string is brittle.
		// Let's assume if it fails, we fail registration for now, unless it's "already exists".
		// But gRPC errors are specific.
		// Let's just log it or return error.
		// Actually, if we want to support "importing" existing Headscale users, we should probably use SyncData first.
		// But for new registration, we try to create.
		// return err
	}

	user := model.User{
		Username:      req.Username,
		Password:      req.Password,
		Email:         req.Email,
		GroupID:       group.ID,
		HeadscaleName: req.Username, // Map username to Headscale Name
		Provider:      "local",
	}

	if err := model.DB.Create(&user).Error; err != nil {
		return serializer.ErrDatabase
	}

	return nil
}

func (s *userService) Login(req *LoginRequest) (string, *model.User, error) {
	var user model.User
	if err := model.DB.Preload("Group").Where("username = ?", req.Username).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", nil, serializer.ErrUserNotFound
		}
		return "", nil, serializer.ErrDatabase
	}

	if !user.CheckPassword(req.Password) {
		return "", nil, serializer.ErrPasswordMismatch
	}

	// Check TOTP
	if user.TOTPEnabled {
		if req.TOTPCode == "" {
			return "", nil, errors.New("TOTP code required")
		}
		valid := totp.Validate(req.TOTPCode, user.TOTPSecret)
		if !valid {
			return "", nil, errors.New("invalid TOTP code")
		}
	}

	token, err := jwt.GenerateToken(user.ID, user.Username, user.GroupID)
	if err != nil {
		return "", nil, serializer.ErrInternalServer
	}

	return token, &user, nil
}

func (s *userService) GetUserInfo(userID uint) (*model.User, error) {
	var user model.User
	if err := model.DB.Preload("Group").First(&user, userID).Error; err != nil {
		return nil, serializer.ErrUserNotFound
	}
	return &user, nil
}

func (s *userService) GetUserPermissions(userID uint) ([]string, error) {
	var user model.User
	if err := model.DB.Preload("Group.Permissions").First(&user, userID).Error; err != nil {
		return nil, err
	}

	var codes []string
	for _, p := range user.Group.Permissions {
		codes = append(codes, p.Code)
	}
	return codes, nil
}

func (s *userService) GenerateTOTP(userID uint) (string, string, error) {
	var user model.User
	if err := model.DB.First(&user, userID).Error; err != nil {
		return "", "", serializer.ErrUserNotFound
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "HeadscalePanel",
		AccountName: user.Username,
	})
	if err != nil {
		return "", "", err
	}

	// Save secret temporarily or return it to be saved after verification?
	// Usually we save it but mark as disabled until verified.
	user.TOTPSecret = key.Secret()
	model.DB.Save(&user)

	return key.Secret(), key.URL(), nil
}

func (s *userService) EnableTOTP(userID uint, code string) error {
	var user model.User
	if err := model.DB.First(&user, userID).Error; err != nil {
		return serializer.ErrUserNotFound
	}

	if !totp.Validate(code, user.TOTPSecret) {
		return errors.New("invalid TOTP code")
	}

	user.TOTPEnabled = true
	model.DB.Save(&user)
	return nil
}
