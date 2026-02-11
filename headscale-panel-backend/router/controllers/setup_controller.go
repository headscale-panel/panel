package controllers

import (
	"headscale-panel/model"
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

type SetupController struct{}

func NewSetupController() *SetupController {
	return &SetupController{}
}

// GetStatus checks if the system has been initialized (any users exist).
func (s *SetupController) GetStatus(ctx *gin.Context) {
	var count int64
	model.DB.Model(&model.User{}).Count(&count)
	initialized := count > 0
	windowOpen := services.SetupGuardService.IsWindowOpen(initialized)

	resp := gin.H{
		"initialized":           initialized,
		"user_count":            count,
		"setup_window_open":     windowOpen,
		"setup_window_deadline": services.SetupGuardService.WindowDeadline().UTC().Format("2006-01-02T15:04:05Z"),
	}

	if windowOpen {
		token, expiresAt, err := services.SetupGuardService.IssueDeployToken(initialized, ctx.ClientIP(), ctx.GetHeader("User-Agent"))
		if err == nil {
			resp["deploy_token"] = token
			resp["deploy_token_expires_at"] = expiresAt.UTC().Format("2006-01-02T15:04:05Z")
		}
	}

	serializer.Success(ctx, resp)
}

// InitializeRequest is the payload for the first-time setup.
type InitializeRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	Email    string `json:"email"`
}

// Initialize creates the first admin user if no users exist yet.
func (s *SetupController) Initialize(ctx *gin.Context) {
	var count int64
	model.DB.Model(&model.User{}).Count(&count)
	if count > 0 {
		serializer.Fail(ctx, serializer.NewError(400, "system already initialized", nil))
		return
	}

	var req InitializeRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	var adminGroup model.Group
	if err := model.DB.Where("name = ?", "Admin").First(&adminGroup).Error; err != nil {
		serializer.Fail(ctx, serializer.NewError(500, "admin group not found, please check database initialization", nil))
		return
	}

	user := model.User{
		Username:      req.Username,
		Password:      req.Password,
		Email:         req.Email,
		GroupID:       adminGroup.ID,
		HeadscaleName: req.Username,
		Provider:      "local",
	}

	if err := model.DB.Create(&user).Error; err != nil {
		serializer.Fail(ctx, serializer.ErrDatabase)
		return
	}

	services.SetupGuardService.RevokeAllTokens()

	serializer.Success(ctx, gin.H{
		"message": "Admin user created successfully",
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"email":    user.Email,
		},
	})
}

// DeployContainer deploys a Docker container during the setup wizard.
// SECURITY: Only available when the system has NOT been initialized yet (no users exist).
func (s *SetupController) DeployContainer(ctx *gin.Context) {
	// Check that system is not yet initialized
	var count int64
	model.DB.Model(&model.User{}).Count(&count)
	if count > 0 {
		serializer.Fail(ctx, serializer.NewError(403, "system already initialized, use authenticated docker API instead", nil))
		return
	}

	setupDeployToken := ctx.GetHeader("X-Setup-Deploy-Token")
	if err := services.SetupGuardService.ValidateAndConsumeDeployToken(false, setupDeployToken, ctx.ClientIP(), ctx.GetHeader("User-Agent")); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	var req services.DeployRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	// Restrict images to allowed list during setup
	allowedImages := map[string]bool{
		"headscale/headscale:stable": true,
		"headscale/headscale:latest": true,
		"fredliang/derper":           true,
	}
	if !allowedImages[req.Image] {
		serializer.Fail(ctx, serializer.NewError(400, "image not allowed during setup: "+req.Image, nil))
		return
	}

	dockerService, err := services.NewDockerService()
	if err != nil {
		serializer.Fail(ctx, serializer.NewError(500, "Docker is not available: "+err.Error(), nil))
		return
	}

	progress, err := dockerService.DeployContainerUnsafe(req)
	if err != nil {
		serializer.Fail(ctx, serializer.NewError(500, err.Error(), nil))
		return
	}

	serializer.Success(ctx, gin.H{
		"progress": progress,
	})
}
