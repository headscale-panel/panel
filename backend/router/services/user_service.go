package services

import (
	"context"
	"errors"
	"fmt"
	"headscale-panel/model"
	"headscale-panel/pkg/constants"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/pkg/utils/jwt"
	"net/http"
	"time"

	"github.com/pquerna/otp/totp"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gorm.io/gorm"
)

type userService struct{}

var UserService = new(userService)

type RegisterRequest struct {
	Username    string `json:"username" binding:"required"`
	Password    string `json:"password" binding:"required"`
	Email       string `json:"email" binding:"required"`
	DisplayName string `json:"display_name"`
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
		return unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, "registration is disabled before initialization")
	}

	var userCount int64
	if err := model.DB.Model(&model.User{}).Count(&userCount).Error; err != nil {
		return unifyerror.DbError(err)
	}

	var group model.Group
	if userCount == 0 {
		// 第一个用户为管理员
		if err := model.DB.Where("name = ?", constants.GROUP_ADMIN).First(&group).Error; err != nil {
			return errors.New("admin group not found")
		}
	} else {
		// 其他用户默认加入普通用户组
		if err := model.DB.Where("name = ?", constants.GROUP_USER).First(&group).Error; err != nil {
			return errors.New("default user group not found")
		}
	}

	var count int64
	if err := model.DB.Model(&model.User{}).Where("username = ?", req.Username).Count(&count).Error; err != nil {
		return unifyerror.DbError(err)
	}
	if count > 0 {
		return unifyerror.UserExists()
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	headscaleClient, err := headscaleServiceClient()
	if err != nil {
		return err
	}

	_, err = headscaleClient.CreateUser(queryCtx, &v1.CreateUserRequest{
		Name:        req.Username,
		DisplayName: req.DisplayName,
		Email:       req.Email,
	})
	if err != nil {
		if st, ok := status.FromError(err); !ok || st.Code() != codes.AlreadyExists {
			return unifyerror.New(http.StatusBadGateway, unifyerror.CodeGRPCErr,
				fmt.Sprintf("failed to initialize headscale user %q", req.Username))
		}
	}

	user := model.User{
		Username:      req.Username,
		Password:      req.Password,
		Email:         req.Email,
		DisplayName:   req.DisplayName,
		GroupID:       group.ID,
		HeadscaleName: req.Username, // Map username to Headscale Name
		Provider:      "local",
	}

	if err := model.DB.Create(&user).Error; err != nil {
		return unifyerror.DbError(err)
	}

	return nil
}

func (s *userService) Login(req *LoginRequest) (string, *model.User, error) {
	return s.LoginWithContext(context.Background(), req)
}

func EnsureUserCanAuthenticate(user *model.User) error {
	if user == nil {
		return unifyerror.LoginFailed()
	}
	if !user.IsActive {
		return unifyerror.UserNotActive()
	}
	return nil
}

func ValidateSessionUser(userID uint) (*model.User, error) {
	var user model.User
	if err := model.DB.Preload("Group").First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, unifyerror.InvalidToken()
		}
		return nil, unifyerror.DbError(err)
	}
	if !user.IsActive {
		return nil, unifyerror.InvalidToken()
	}
	return &user, nil
}

func (s *userService) LoginWithContext(ctx context.Context, req *LoginRequest) (string, *model.User, error) {
	var user model.User
	if err := model.DB.Preload("Group").Where("username = ?", req.Username).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", nil, unifyerror.LoginFailed()
		}
		return "", nil, unifyerror.DbError(err)
	}

	if err := EnsureUserCanAuthenticate(&user); err != nil {
		return "", nil, err
	}

	if !user.CheckPassword(req.Password) {
		return "", nil, unifyerror.LoginFailed()
	}

	// Check TOTP
	if user.TOTPEnabled {
		if req.TOTPCode == "" {
			return "", nil, unifyerror.New(http.StatusUnauthorized, unifyerror.CodeInvalidToken, "TOTP code required")
		}
		valid := totp.Validate(req.TOTPCode, user.TOTPSecret)
		if !valid {
			return "", nil, unifyerror.New(http.StatusUnauthorized, unifyerror.CodeInvalidToken, "invalid TOTP code")
		}
	}

	token, err := jwt.GenerateToken(user.ID, user.Username, user.GroupID)
	if err != nil {
		return "", nil, unifyerror.ServerError(err)
	}

	return token, &user, nil
}

func (s *userService) GetUserInfo(userID uint) (*model.User, error) {
	var user model.User
	if err := model.DB.Preload("Group").First(&user, userID).Error; err != nil {
		return nil, unifyerror.NotFound()
	}
	return &user, nil
}

func (s *userService) GetUserPermissions(userID uint) ([]string, error) {
	var user model.User
	if err := model.DB.Preload("Group.Permissions").First(&user, userID).Error; err != nil {
		return nil, unifyerror.DbError(err)
	}

	var codes []string
	for _, p := range user.Group.Permissions {
		codes = append(codes, p.Code)
	}
	return codes, nil
}

func (s *userService) MarkGuideTourSeen(userID uint) error {
	now := time.Now()
	if err := model.DB.Model(&model.User{}).
		Where("id = ? AND guide_tour_seen_at IS NULL", userID).
		Update("guide_tour_seen_at", now).Error; err != nil {
		return unifyerror.DbError(err)
	}
	return nil
}

func (s *userService) GenerateTOTP(userID uint) (string, string, error) {
	var user model.User
	if err := model.DB.First(&user, userID).Error; err != nil {
		return "", "", unifyerror.NotFound()
	}

	if user.TOTPEnabled {
		return "", "", unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "TOTP is already enabled; disable it first")
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
		return "", "", unifyerror.DbError(err)
	}

	return key.Secret(), key.URL(), nil
}

func (s *userService) EnableTOTP(userID uint, code string) error {
	var user model.User
	if err := model.DB.First(&user, userID).Error; err != nil {
		return unifyerror.NotFound()
	}

	if !totp.Validate(code, user.TOTPSecret) {
		return unifyerror.New(http.StatusUnauthorized, unifyerror.CodeInvalidToken, "invalid TOTP code")
	}

	user.TOTPEnabled = true
	if err := model.DB.Save(&user).Error; err != nil {
		return unifyerror.DbError(err)
	}
	return nil
}
