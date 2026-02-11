package controllers

import (
	"headscale-panel/model"
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"
	"time"

	"github.com/gin-gonic/gin"
)

type SetupController struct{}

func NewSetupController() *SetupController {
	return &SetupController{}
}

// GetStatus checks if the system has been initialized (any users exist).
func (s *SetupController) GetStatus(ctx *gin.Context) {
	state, err := services.SetupStateService.GetState()
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	var count int64
	if err := model.DB.Model(&model.User{}).Count(&count).Error; err != nil {
		serializer.Fail(ctx, serializer.ErrDatabase.WithError(err))
		return
	}

	now := time.Now()
	windowOpen := services.SetupStateService.IsWindowOpen(state, now)
	initialized := state.State == model.SetupStateInitialized

	resp := gin.H{
		"initialized":           initialized,
		"setup_state":           state.State,
		"user_count":            count,
		"setup_window_open":     windowOpen,
		"setup_window_deadline": "",
	}
	if state.WindowDeadline != nil {
		resp["setup_window_deadline"] = state.WindowDeadline.UTC().Format(time.RFC3339)
	}

	if windowOpen {
		initToken, initTokenExpiresAt, err := services.SetupGuardService.IssueInitToken(true, ctx.ClientIP(), ctx.GetHeader("User-Agent"))
		if err == nil {
			resp["init_token"] = initToken
			resp["init_token_expires_at"] = initTokenExpiresAt.UTC().Format(time.RFC3339)
		}
		deployToken, deployTokenExpiresAt, err := services.SetupGuardService.IssueDeployToken(true, ctx.ClientIP(), ctx.GetHeader("User-Agent"))
		if err == nil {
			resp["deploy_token"] = deployToken
			resp["deploy_token_expires_at"] = deployTokenExpiresAt.UTC().Format(time.RFC3339)
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
	state, err := services.SetupStateService.RequireSetupWindow()
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	setupInitToken := ctx.GetHeader("X-Setup-Init-Token")
	if setupInitToken == "" {
		setupInitToken = ctx.GetHeader("X-Setup-Token")
	}
	if err := services.SetupGuardService.ValidateAndConsumeInitToken(
		services.SetupStateService.IsWindowOpen(state, time.Now()),
		setupInitToken,
		ctx.ClientIP(),
		ctx.GetHeader("User-Agent"),
	); err != nil {
		serializer.Fail(ctx, err)
		return
	}

	var count int64
	if err := model.DB.Model(&model.User{}).Count(&count).Error; err != nil {
		serializer.Fail(ctx, serializer.ErrDatabase.WithError(err))
		return
	}
	if count > 0 {
		serializer.Fail(ctx, serializer.NewError(serializer.CodeConflict, "system already initialized", nil))
		return
	}

	var req InitializeRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	var adminGroup model.Group
	if err := model.DB.Where("name = ?", "Admin").First(&adminGroup).Error; err != nil {
		serializer.Fail(ctx, serializer.NewError(serializer.CodeInternalError, "admin group not found, please check database initialization", err))
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

	if err := services.SetupStateService.MarkInitialized(); err != nil {
		serializer.Fail(ctx, err)
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
	state, err := services.SetupStateService.RequireSetupWindow()
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}

	var count int64
	if err := model.DB.Model(&model.User{}).Count(&count).Error; err != nil {
		serializer.Fail(ctx, serializer.ErrDatabase.WithError(err))
		return
	}
	if count > 0 {
		serializer.Fail(ctx, serializer.NewError(serializer.CodeNoPermissionErr, "system already initialized, use authenticated docker API instead", nil))
		return
	}

	setupDeployToken := ctx.GetHeader("X-Setup-Deploy-Token")
	if setupDeployToken == "" {
		setupDeployToken = ctx.GetHeader("X-Setup-Token")
	}
	if err := services.SetupGuardService.ValidateAndConsumeDeployToken(
		services.SetupStateService.IsWindowOpen(state, time.Now()),
		setupDeployToken,
		ctx.ClientIP(),
		ctx.GetHeader("User-Agent"),
	); err != nil {
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
		serializer.Fail(ctx, serializer.NewError(serializer.CodeInternalError, "Docker service not available", err))
		return
	}

	progress, err := dockerService.DeployContainerUnsafeWithContext(ctx.Request.Context(), req)
	if err != nil {
		serializer.Fail(ctx, serializer.NewError(serializer.CodeInternalError, "container deployment failed", err))
		return
	}

	serializer.Success(ctx, gin.H{
		"progress": progress,
	})
}
