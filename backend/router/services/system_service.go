// Copyright (C) 2026
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

package services

import (
	"context"
	"errors"
	"fmt"
	"headscale-panel/model"
	"headscale-panel/pkg/unifyerror"
	"net/http"
	"strings"
	"sync"
	"time"

	v1 "github.com/juanfont/headscale/gen/go/headscale/v1"

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

// User Management
func (s *systemService) ListUsers(actorUserID uint, page, pageSize int) ([]model.User, int64, error) {
	if err := RequirePermission(actorUserID, "system:user:list"); err != nil {
		return nil, 0, err
	}

	// Auto-sync users from Headscale (best-effort, throttled)
	s.syncMu.Lock()
	if time.Since(s.lastSyncTime) >= 30*time.Second {
		s.lastSyncTime = time.Now()
		s.syncMu.Unlock()
		HeadscaleService.SyncUsersFromHeadscale(context.Background())
	} else {
		s.syncMu.Unlock()
	}

	var users []model.User
	var total int64

	db := model.DB.Model(&model.User{})

	if err := db.Count(&total).Error; err != nil {
		return nil, 0, unifyerror.DbError(err)
	}

	offset := (page - 1) * pageSize
	if err := db.Offset(offset).Limit(pageSize).Preload("Group").Find(&users).Error; err != nil {
		return nil, 0, unifyerror.DbError(err)
	}

	return users, total, nil
}

func (s *systemService) CreateUser(actorUserID uint, username, password, email string, groupID uint, displayName string) error {
	if err := RequirePermission(actorUserID, "system:user:create"); err != nil {
		return err
	}

	var count int64
	if err := model.DB.Model(&model.User{}).Where("username = ?", username).Count(&count).Error; err != nil {
		return unifyerror.DbError(err)
	}
	if count > 0 {
		return unifyerror.UserExists()
	}

	provider := "local"
	if PanelSettingsService.IsThirdPartyOIDCEnabled() {
		provider = "oidc"
	}

	// Create panel user first (panel-only operation)
	user := model.User{
		Username:    username,
		Password:    password,
		Email:       email,
		GroupID:     groupID, // 0 means ungrouped
		DisplayName: displayName,
		Provider:    provider,
	}

	if err := model.DB.Create(&user).Error; err != nil {
		return unifyerror.DbError(err)
	}

	// Best-effort: create matching headscale user and binding
	if shouldCreateHeadscaleUserForPanelUser() {
		client, err := headscaleServiceClient()
		if err == nil {
			ctx, cancel := withServiceTimeout(context.Background())
			defer cancel()
			resp, err := client.CreateUser(ctx, &v1.CreateUserRequest{
				Name:        username,
				DisplayName: displayName,
				Email:       email,
			})
			if err == nil && resp.User != nil {
				model.DB.Create(&model.UserIdentityBinding{
					UserID:      user.ID,
					HeadscaleID: resp.User.Id,
				})
			}
		}
	}

	return nil
}

func (s *systemService) UpdateUser(actorUserID uint, id uint, email string, groupID uint, password string, displayName string) error {
	if err := RequirePermission(actorUserID, "system:user:update"); err != nil {
		return err
	}

	var user model.User
	if err := model.DB.First(&user, id).Error; err != nil {
		return unifyerror.DbError(err)
	}

	// Only admins can change group assignments; prevent privilege escalation
	if groupID != user.GroupID {
		if err := RequireAdmin(actorUserID); err != nil {
			return unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, "only admins can change user group")
		}
		if actorUserID == id {
			return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "cannot change your own group")
		}
		user.GroupID = groupID
	}

	user.Email = email
	user.DisplayName = displayName
	if password != "" {
		user.Password = password
	}

	if err := model.DB.Save(&user).Error; err != nil {
		return unifyerror.DbError(err)
	}
	return nil
}

func (s *systemService) DeleteUser(actorUserID uint, id uint) error {
	if err := RequirePermission(actorUserID, "system:user:delete"); err != nil {
		return err
	}

	if actorUserID == id {
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "cannot delete your own account")
	}

	var user model.User
	if err := model.DB.First(&user, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound, "user not found")
		}
		return unifyerror.DbError(err)
	}

	if isOIDCManagedPanelUser(user.Provider) {
		return unifyerror.Conflict("OIDC users are managed by the identity provider and cannot be deleted from the panel")
	}

	// Best-effort: check and clean up headscale users (does not block panel deletion)
	ids := model.GetHeadscaleIDs(id)
	for _, hsID := range ids {
		deviceCount, err := HeadscaleService.CountUserMachinesWithContext(context.Background(), fmt.Sprintf("%d", hsID))
		if err == nil && deviceCount > 0 {
			return unifyerror.Conflict(fmt.Sprintf("cannot delete user because %d device(s) are still attached to headscale user %d", deviceCount, hsID))
		}
		_ = HeadscaleService.DeleteUserWithContext(context.Background(), actorUserID, hsID)
	}

	if err := model.DB.Where("user_id = ?", id).Delete(&model.UserIdentityBinding{}).Error; err != nil {
		return unifyerror.DbError(err)
	}

	if err := model.DB.Delete(&model.User{}, id).Error; err != nil {
		return unifyerror.DbError(err)
	}
	return nil
}

// Group Management
// Deprecated: Use GroupService instead
func (s *systemService) ListGroups() ([]model.Group, error) {
	return nil, unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, "deprecated system group API is disabled; use GroupService")
}

// Deprecated: Use GroupService instead
func (s *systemService) CreateGroup(name string, permissionIDs []uint) error {
	return unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, "deprecated system group API is disabled; use GroupService")
}

// Deprecated: Use GroupService instead
func (s *systemService) UpdateGroup(id uint, name string, permissionIDs []uint) error {
	return unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, "deprecated system group API is disabled; use GroupService")
}

// Deprecated: Use PermissionService instead
func (s *systemService) ListPermissions() ([]model.Permission, error) {
	return nil, unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden, "deprecated permission API is disabled; use PermissionService")
}
