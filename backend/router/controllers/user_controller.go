package controllers

import (
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

type UserController struct{}

func NewUserController() *UserController {
	return &UserController{}
}

func (u *UserController) Register(c *gin.Context) {
	var req services.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	if err := services.UserService.RegisterWithContext(c.Request.Context(), &req); err != nil {
		serializer.Fail(c, err)
		return
	}

	serializer.Success(c, nil)
}

func (u *UserController) Login(c *gin.Context) {
	var req services.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	token, user, err := services.UserService.LoginWithContext(c.Request.Context(), &req)
	if err != nil {
		serializer.Fail(c, err)
		return
	}

	// Determine role based on group name
	role := "user"
	if user.Group.Name == "Admin" || user.Group.Name == "admin" {
		role = "admin"
	}

	// Get user permissions
	permissions, _ := services.UserService.GetUserPermissions(user.ID)

	serializer.Success(c, gin.H{
		"token": token,
		"user": gin.H{
			"id":           user.ID,
			"username":     user.Username,
			"email":        user.Email,
			"role":         role,
			"display_name": user.DisplayName,
			"avatar":       user.ProfilePicURL,
		},
		"permissions": permissions,
	})
}

func (u *UserController) GetInfo(c *gin.Context) {
	userID := c.GetUint("userID")
	if userID == 0 {
		serializer.Fail(c, serializer.ErrInvalidToken)
		return
	}
	user, err := services.UserService.GetUserInfo(userID)
	if err != nil {
		serializer.Fail(c, err)
		return
	}

	permissions, err := services.UserService.GetUserPermissions(userID)
	if err != nil {
		serializer.Fail(c, err)
		return
	}

	serializer.Success(c, gin.H{
		"user":        user,
		"permissions": permissions,
	})
}

func (u *UserController) GenerateTOTP(c *gin.Context) {
	userID := c.GetUint("userID")
	secret, url, err := services.UserService.GenerateTOTP(userID)
	if err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, gin.H{
		"secret": secret,
		"url":    url,
	})
}

type EnableTOTPRequest struct {
	Code string `json:"code" binding:"required"`
}

func (u *UserController) EnableTOTP(c *gin.Context) {
	var req EnableTOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		serializer.Fail(c, serializer.ErrBind)
		return
	}

	userID := c.GetUint("userID")
	if err := services.UserService.EnableTOTP(userID, req.Code); err != nil {
		serializer.Fail(c, err)
		return
	}
	serializer.Success(c, nil)
}
