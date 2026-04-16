package controllers

import (
	"headscale-panel/model"
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

type UserController struct{}

func NewUserController() *UserController {
	return &UserController{}
}

func buildUserAuthPayload(user *model.User, role string) gin.H {
	return gin.H{
		"id":                 user.ID,
		"username":           user.Username,
		"email":              user.Email,
		"role":               role,
		"display_name":       user.DisplayName,
		"avatar":             user.ProfilePicURL,
		"guide_tour_seen_at": user.GuideTourSeenAt,
		"totp_enabled":       user.TOTPEnabled,
	}
}

// Register godoc
// @Summary Register a new user
// @Tags auth
// @Accept json
// @Produce json
// @Param body body services.RegisterRequest true "Registration data"
// @Success 200 {object} serializer.Response
// @Failure 400 {object} serializer.Response
// @Router /register [post]
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

// Login godoc
// @Summary Log in with username and password
// @Tags auth
// @Accept json
// @Produce json
// @Param body body services.LoginRequest true "Login credentials"
// @Success 200 {object} serializer.Response{data=object} "token and user info"
// @Failure 400 {object} serializer.Response
// @Router /login [post]
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

	// Set HttpOnly cookie for OIDC authorize flow
	secure := conf.Conf.System.BaseURL != "" &&
		len(conf.Conf.System.BaseURL) > 5 &&
		conf.Conf.System.BaseURL[:5] == "https"
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie("headscale_panel_token", token, int(conf.Conf.JWT.Expire*3600), "/", "", secure, true)

	serializer.Success(c, gin.H{
		"token":       token,
		"user":        buildUserAuthPayload(user, role),
		"permissions": permissions,
	})
}

// GetInfo godoc
// @Summary Get current user info and permissions
// @Tags auth
// @Produce json
// @Success 200 {object} serializer.Response{data=object} "user and permissions"
// @Security BearerAuth
// @Router /user/info [get]
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

// MarkGuideTourSeen godoc
// @Summary Mark the guide tour as seen for the current user
// @Tags auth
// @Produce json
// @Success 200 {object} serializer.Response
// @Security BearerAuth
// @Router /user/guide-tour/seen [post]
func (u *UserController) MarkGuideTourSeen(c *gin.Context) {
	userID := c.GetUint("userID")
	if userID == 0 {
		serializer.Fail(c, serializer.ErrInvalidToken)
		return
	}

	if err := services.UserService.MarkGuideTourSeen(userID); err != nil {
		serializer.Fail(c, err)
		return
	}

	serializer.Success(c, nil)
}

// GenerateTOTP godoc
// @Summary Generate a TOTP secret for the current user
// @Tags auth
// @Produce json
// @Success 200 {object} serializer.Response{data=object} "secret and url"
// @Security BearerAuth
// @Router /user/totp/generate [post]
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

// EnableTOTP godoc
// @Summary Enable TOTP for the current user
// @Tags auth
// @Accept json
// @Produce json
// @Param body body EnableTOTPRequest true "TOTP verification code"
// @Success 200 {object} serializer.Response
// @Failure 400 {object} serializer.Response
// @Security BearerAuth
// @Router /user/totp/enable [post]
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
