package services

import (
	"context"
	"errors"
	"fmt"
	"headscale-panel/model"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"headscale-panel/pkg/utils/jwt"
	"headscale-panel/pkg/utils/serializer"

	"github.com/pquerna/otp/totp"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
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
	return s.RegisterWithContext(context.Background(), req)
}

func (s *userService) RegisterWithContext(ctx context.Context, req *RegisterRequest) error {
	canRegister, err := SetupStateService.CanRegister()
	if err != nil {
		return err
	}
	if !canRegister {
		return serializer.NewError(serializer.CodeNoPermissionErr, "registration is disabled before initialization", nil)
	}

	var userCount int64
	if err := model.DB.Model(&model.User{}).Count(&userCount).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}

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
	if err := model.DB.Model(&model.User{}).Where("username = ?", req.Username).Count(&count).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	if count > 0 {
		return serializer.ErrUserNameExisted
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	headscaleClient, err := headscaleServiceClient()
	if err != nil {
		return err
	}

	_, err = headscaleClient.CreateUser(queryCtx, &v1.CreateUserRequest{
		Name: req.Username,
	})
	if err != nil {
		if st, ok := status.FromError(err); !ok || st.Code() != codes.AlreadyExists {
			return serializer.NewError(
				serializer.CodeThirdPartyServiceError,
				"failed to initialize headscale user",
				fmt.Errorf("headscale create user %q: %w", req.Username, err),
			)
		}
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
		return serializer.ErrDatabase.WithError(err)
	}

	return nil
}

func (s *userService) Login(req *LoginRequest) (string, *model.User, error) {
	return s.LoginWithContext(context.Background(), req)
}

func (s *userService) LoginWithContext(ctx context.Context, req *LoginRequest) (string, *model.User, error) {
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
			return "", nil, serializer.NewError(serializer.Code2FACodeErr, "TOTP code required", nil)
		}
		valid := totp.Validate(req.TOTPCode, user.TOTPSecret)
		if !valid {
			return "", nil, serializer.NewError(serializer.Code2FACodeErr, "invalid TOTP code", nil)
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
		return nil, serializer.ErrDatabase.WithError(err)
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

	if user.TOTPEnabled {
		return "", "", serializer.NewError(serializer.CodeParamErr, "TOTP is already enabled; disable it first", nil)
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "HeadscalePanel",
		AccountName: user.Username,
	})
	if err != nil {
		return "", "", err
	}

	// Persist the secret in pending state; TOTPEnabled stays false until
	// the user proves possession of the code via EnableTOTP.
	user.TOTPSecret = key.Secret()
	if err := model.DB.Save(&user).Error; err != nil {
		return "", "", serializer.ErrDatabase.WithError(err)
	}

	return key.Secret(), key.URL(), nil
}

func (s *userService) EnableTOTP(userID uint, code string) error {
	var user model.User
	if err := model.DB.First(&user, userID).Error; err != nil {
		return serializer.ErrUserNotFound
	}

	if !totp.Validate(code, user.TOTPSecret) {
		return serializer.NewError(serializer.Code2FACodeErr, "invalid TOTP code", nil)
	}

	user.TOTPEnabled = true
	if err := model.DB.Save(&user).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	return nil
}
