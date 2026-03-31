package services

import (
	"context"
	"errors"
	"fmt"
	"headscale-panel/model"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"headscale-panel/pkg/utils/serializer"
	"strings"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gorm.io/gorm"
)

type systemService struct {
	lastSyncTime time.Time
	syncMu       sync.Mutex
}

var SystemService = new(systemService)

func shouldCreateHeadscaleUserForPanelUser() bool {
	return !PanelSettingsService.IsThirdPartyOIDCEnabled()
}

func isOIDCManagedPanelUser(provider string) bool {
	return strings.EqualFold(strings.TrimSpace(provider), "oidc")
}

// syncHeadscaleUsers fetches users from Headscale gRPC and upserts them into the panel DB.
// This is best-effort: errors are logged but do not block the caller.
// Throttled to at most once per 30 seconds to avoid excessive gRPC calls.
func (s *systemService) syncHeadscaleUsers() {
	s.syncMu.Lock()
	if time.Since(s.lastSyncTime) < 30*time.Second {
		s.syncMu.Unlock()
		return
	}
	s.lastSyncTime = time.Now()
	s.syncMu.Unlock()

	client, err := headscaleServiceClient()
	if err != nil {
		logrus.WithError(err).Debug("syncHeadscaleUsers: cannot connect to Headscale, skipping sync")
		return
	}

	ctx, cancel := withServiceTimeout(context.Background())
	defer cancel()

	resp, err := client.ListUsers(ctx, &v1.ListUsersRequest{})
	if err != nil {
		logrus.WithError(err).Warn("syncHeadscaleUsers: failed to list users from Headscale")
		return
	}

	for _, hsUser := range resp.Users {
		if hsUser.Name == "" {
			continue
		}
		var existing model.User
		if err := model.DB.Where("headscale_name = ?", hsUser.Name).First(&existing).Error; err != nil {
			// User doesn't exist in panel DB — create it (ungrouped by default)
			provider := normalizeHeadscaleProvider(hsUser.Provider)
			newUser := model.User{
				Username:      hsUser.Name,
				HeadscaleName: hsUser.Name,
				DisplayName:   hsUser.DisplayName,
				Email:         hsUser.Email,
				Provider:      provider,
				ProviderID:    hsUser.ProviderId,
			}
			if hsUser.ProfilePicUrl != "" {
				newUser.ProfilePicURL = hsUser.ProfilePicUrl
			}
			if createErr := model.DB.Create(&newUser).Error; createErr != nil {
				// Skip duplicate username errors silently
				continue
			}
		} else {
			// Update display info if changed
			updates := map[string]interface{}{}
			if hsUser.DisplayName != "" && existing.DisplayName != hsUser.DisplayName {
				updates["display_name"] = hsUser.DisplayName
			}
			if hsUser.Email != "" && existing.Email != hsUser.Email {
				updates["email"] = hsUser.Email
			}
			if hsUser.ProfilePicUrl != "" && existing.ProfilePicURL != hsUser.ProfilePicUrl {
				updates["profile_pic_url"] = hsUser.ProfilePicUrl
			}
			normalizedProvider := normalizeHeadscaleProvider(hsUser.Provider)
			if normalizedProvider != "" && existing.Provider != normalizedProvider {
				updates["provider"] = normalizedProvider
			}
			if hsUser.ProviderId != "" && existing.ProviderID != hsUser.ProviderId {
				updates["provider_id"] = hsUser.ProviderId
			}
			// Fix: headscale-synced users should not be in Admin group by default.
			// Reset group_id to 0 for headscale users that were auto-assigned to Admin.
			if normalizedProvider == "headscale" && existing.GroupID != 0 {
				var adminGroup model.Group
				if err := model.DB.Where("name = ?", "Admin").First(&adminGroup).Error; err == nil {
					if existing.GroupID == adminGroup.ID {
						updates["group_id"] = 0
					}
				}
			}
			if len(updates) > 0 {
				model.DB.Model(&existing).Updates(updates)
			}
		}
	}
}

// User Management
func (s *systemService) ListUsers(actorUserID uint, page, pageSize int) ([]model.User, int64, error) {
	if err := RequirePermission(actorUserID, "system:user:list"); err != nil {
		return nil, 0, err
	}

	// Auto-sync users from Headscale gRPC (best-effort)
	s.syncHeadscaleUsers()

	var users []model.User
	var total int64

	if err := model.DB.Model(&model.User{}).Count(&total).Error; err != nil {
		return nil, 0, serializer.ErrDatabase.WithError(err)
	}

	offset := (page - 1) * pageSize
	if err := model.DB.Offset(offset).Limit(pageSize).Preload("Group").Find(&users).Error; err != nil {
		return nil, 0, serializer.ErrDatabase.WithError(err)
	}

	return users, total, nil
}

func (s *systemService) CreateUser(actorUserID uint, username, password, email string, groupID uint, displayName string) error {
	if err := RequirePermission(actorUserID, "system:user:create"); err != nil {
		return err
	}

	var count int64
	if err := model.DB.Model(&model.User{}).Where("username = ?", username).Count(&count).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	if count > 0 {
		return serializer.ErrUserNameExisted
	}

	provider := "local"
	if PanelSettingsService.IsThirdPartyOIDCEnabled() {
		provider = "oidc"
	}
	if shouldCreateHeadscaleUserForPanelUser() {
		// Built-in OIDC still keeps local panel users and Headscale local users side by side.
		client, err := headscaleServiceClient()
		if err != nil {
			return fmt.Errorf("failed to connect to Headscale: %w", err)
		}
		ctx, cancel := withServiceTimeout(context.Background())
		defer cancel()
		_, err = client.CreateUser(ctx, &v1.CreateUserRequest{Name: username})
		if err != nil {
			// Ignore AlreadyExists errors
			if st, ok := status.FromError(err); !ok || st.Code() != codes.AlreadyExists {
				return serializer.NewError(
					serializer.CodeThirdPartyServiceError,
					"failed to create headscale user",
					fmt.Errorf("headscale create user %q: %w", username, err),
				)
			}
		}
	}

	user := model.User{
		Username:      username,
		Password:      password,
		Email:         email,
		GroupID:       groupID, // 0 means ungrouped
		DisplayName:   displayName,
		HeadscaleName: username,
		Provider:      provider,
	}

	if err := model.DB.Create(&user).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	return nil
}

func (s *systemService) UpdateUser(actorUserID uint, id uint, email string, groupID uint, password string, displayName string) error {
	if err := RequirePermission(actorUserID, "system:user:update"); err != nil {
		return err
	}

	var user model.User
	if err := model.DB.First(&user, id).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}

	// Only admins can change group assignments; prevent privilege escalation
	if groupID != 0 && groupID != user.GroupID {
		if err := RequireAdmin(actorUserID); err != nil {
			return serializer.NewError(serializer.CodeNoPermissionErr, "only admins can change user group", nil)
		}
		if actorUserID == id {
			return serializer.NewError(serializer.CodeParamErr, "cannot change your own group", nil)
		}
		user.GroupID = groupID
	}

	user.Email = email
	user.DisplayName = displayName
	if password != "" {
		user.Password = password
	}

	if err := model.DB.Save(&user).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	return nil
}

func (s *systemService) DeleteUser(actorUserID uint, id uint) error {
	if err := RequirePermission(actorUserID, "system:user:delete"); err != nil {
		return err
	}

	if actorUserID == id {
		return serializer.NewError(serializer.CodeParamErr, "cannot delete your own account", nil)
	}

	var user model.User
	if err := model.DB.First(&user, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return serializer.NewError(serializer.CodeNotFound, "user not found", nil)
		}
		return serializer.ErrDatabase.WithError(err)
	}

	if isOIDCManagedPanelUser(user.Provider) {
		return serializer.NewError(serializer.CodeConflict, "OIDC users are managed by the identity provider and cannot be deleted from the panel", nil)
	}

	headscaleName := strings.TrimSpace(user.HeadscaleName)
	if headscaleName == "" {
		headscaleName = strings.TrimSpace(user.Username)
	}

	if headscaleName != "" {
		deviceCount, err := HeadscaleService.CountUserMachinesWithContext(context.Background(), headscaleName)
		if err != nil {
			return serializer.NewError(serializer.CodeThirdPartyServiceError, "failed to validate headscale devices before deletion", err)
		}
		if deviceCount > 0 {
			return serializer.NewError(serializer.CodeConflict, fmt.Sprintf("cannot delete user %q because %d device(s) are still attached", headscaleName, deviceCount), nil)
		}

		headscaleUserID, err := HeadscaleService.ResolveUserIDByNameWithContext(context.Background(), headscaleName)
		if err == nil {
			if err := HeadscaleService.DeleteUserWithContext(context.Background(), actorUserID, headscaleUserID); err != nil {
				return serializer.NewError(serializer.CodeThirdPartyServiceError, "failed to delete headscale user", err)
			}
		} else {
			var appErr serializer.AppError
			if !errors.As(err, &appErr) || appErr.Code != serializer.CodeNotFound {
				return serializer.NewError(serializer.CodeThirdPartyServiceError, "failed to resolve headscale user before deletion", err)
			}
		}
	}

	if err := model.DB.Delete(&model.User{}, id).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	return nil
}

// Group Management
// Deprecated: Use GroupService instead
func (s *systemService) ListGroups() ([]model.Group, error) {
	return nil, serializer.NewError(serializer.CodeForbidden, "deprecated system group API is disabled; use GroupService", nil)
}

// Deprecated: Use GroupService instead
func (s *systemService) CreateGroup(name string, permissionIDs []uint) error {
	return serializer.NewError(serializer.CodeForbidden, "deprecated system group API is disabled; use GroupService", nil)
}

// Deprecated: Use GroupService instead
func (s *systemService) UpdateGroup(id uint, name string, permissionIDs []uint) error {
	return serializer.NewError(serializer.CodeForbidden, "deprecated system group API is disabled; use GroupService", nil)
}

// Deprecated: Use PermissionService instead
func (s *systemService) ListPermissions() ([]model.Permission, error) {
	return nil, serializer.NewError(serializer.CodeForbidden, "deprecated permission API is disabled; use PermissionService", nil)
}
