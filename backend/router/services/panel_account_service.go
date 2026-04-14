package services

import (
	"context"
	"errors"
	"headscale-panel/model"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"headscale-panel/pkg/utils/serializer"
	"strings"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gorm.io/gorm"
)

type panelAccountService struct{}

// PanelAccountService is the singleton service for Panel Account management.
var PanelAccountService = new(panelAccountService)

// ---------- Response types (JSON-friendly) ----------

// PanelAccountListItem is the list-view representation of a panel account.
type PanelAccountListItem struct {
	ID                  uint               `json:"id"`
	Username            string             `json:"username"`
	Email               string             `json:"email"`
	DisplayName         string             `json:"display_name"`
	IsActive            bool               `json:"is_active"`
	Group               *PanelAccountGroup `json:"group"`
	LoginMethods        []string           `json:"login_methods"`
	NetworkBindingCount int64              `json:"network_binding_count"`
	CreatedAt           string             `json:"created_at"`
	UpdatedAt           string             `json:"updated_at"`
}

type PanelAccountGroup struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
}

// PanelAccountDetail is the detail-view representation of a panel account.
type PanelAccountDetail struct {
	ID              uint                     `json:"id"`
	Username        string                   `json:"username"`
	Email           string                   `json:"email"`
	DisplayName     string                   `json:"display_name"`
	IsActive        bool                     `json:"is_active"`
	Group           *PanelAccountGroupDetail `json:"group"`
	LoginIdentities *LoginIdentities         `json:"login_identities"`
	NetworkBindings []NetworkBinding         `json:"network_bindings"`
	CreatedAt       string                   `json:"created_at"`
	UpdatedAt       string                   `json:"updated_at"`
}

type PanelAccountGroupDetail struct {
	ID          uint                  `json:"id"`
	Name        string                `json:"name"`
	Permissions []PanelPermissionItem `json:"permissions"`
}

type PanelPermissionItem struct {
	Code string `json:"code"`
	Name string `json:"name"`
	Type string `json:"type"`
}

type LoginIdentities struct {
	Local *LocalLoginIdentity `json:"local"`
	OIDC  *OIDCLoginIdentity  `json:"oidc"`
}

type LocalLoginIdentity struct {
	Enabled     bool `json:"enabled"`
	HasPassword bool `json:"has_password"`
	TOTPEnabled bool `json:"totp_enabled"`
}

type OIDCLoginIdentity struct {
	Bound      bool   `json:"bound"`
	Provider   string `json:"provider,omitempty"`
	ProviderID string `json:"provider_id,omitempty"`
	Email      string `json:"email,omitempty"`
}

type NetworkBinding struct {
	ID            uint   `json:"id"`
	HeadscaleID   uint64 `json:"headscale_id"`
	HeadscaleName string `json:"headscale_name"`
	DisplayName   string `json:"display_name"`
	Email         string `json:"email"`
	Provider      string `json:"provider"`
	IsPrimary     bool   `json:"is_primary"`
}

type NetworkIdentityItem struct {
	ID          uint64 `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	Email       string `json:"email"`
	Provider    string `json:"provider"`
}

// ---------- Query types ----------

type PanelAccountListQuery struct {
	Search   string
	Status   string // "active", "inactive", ""
	GroupID  uint
	Provider string // "local", "oidc", "headscale", ""
	Page     int
	PageSize int
}

// ---------- Service methods ----------

func (s *panelAccountService) List(actorUserID uint, q PanelAccountListQuery) ([]PanelAccountListItem, int64, error) {
	if err := RequirePermission(actorUserID, "panel:account:list"); err != nil {
		return nil, 0, err
	}

	page, pageSize := normalizePagination(q.Page, q.PageSize)

	db := model.DB.Model(&model.User{})

	// Panel accounts are local/oidc only — exclude headscale-synced users
	db = db.Where("provider IN ?", []string{"local", "oidc", ""})

	if q.Search != "" {
		like := "%" + q.Search + "%"
		db = db.Where("username LIKE ? OR email LIKE ?", like, like)
	}
	switch q.Status {
	case "active":
		db = db.Where("is_active = ?", true)
	case "inactive":
		db = db.Where("is_active = ?", false)
	}
	if q.GroupID > 0 {
		db = db.Where("group_id = ?", q.GroupID)
	}
	if q.Provider != "" {
		db = db.Where("provider = ?", q.Provider)
	}

	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, serializer.ErrDatabase.WithError(err)
	}

	var users []model.User
	query := db.Preload("Group")
	if pageSize > 0 {
		query = query.Offset((page - 1) * pageSize).Limit(pageSize)
	}
	if err := query.Order("id ASC").Find(&users).Error; err != nil {
		return nil, 0, serializer.ErrDatabase.WithError(err)
	}

	items := make([]PanelAccountListItem, 0, len(users))
	for _, u := range users {
		var bindingCount int64
		model.DB.Model(&model.UserIdentityBinding{}).Where("user_id = ?", u.ID).Count(&bindingCount)

		items = append(items, PanelAccountListItem{
			ID:          u.ID,
			Username:    u.Username,
			Email:       u.Email,
			DisplayName: u.DisplayName,
			IsActive:    u.IsActive,
			Group: &PanelAccountGroup{
				ID:   u.Group.ID,
				Name: u.Group.Name,
			},
			LoginMethods:        deriveLoginMethods(&u),
			NetworkBindingCount: bindingCount,
			CreatedAt:           u.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			UpdatedAt:           u.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}

	return items, total, nil
}

func (s *panelAccountService) GetDetail(actorUserID, accountID uint) (*PanelAccountDetail, error) {
	if err := RequirePermission(actorUserID, "panel:account:list"); err != nil {
		return nil, err
	}

	var user model.User
	if err := model.DB.Preload("Group.Permissions").First(&user, accountID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, serializer.NewError(serializer.CodeNotFound, "panel account not found", nil)
		}
		return nil, serializer.ErrDatabase.WithError(err)
	}

	// Only panel accounts (local/oidc) can be viewed via this endpoint
	if user.Provider == "headscale" {
		return nil, serializer.NewError(serializer.CodeNotFound, "panel account not found", nil)
	}

	var bindings []model.UserIdentityBinding
	model.DB.Where("user_id = ?", user.ID).Find(&bindings)

	detail := &PanelAccountDetail{
		ID:              user.ID,
		Username:        user.Username,
		Email:           user.Email,
		DisplayName:     user.DisplayName,
		IsActive:        user.IsActive,
		Group:           buildGroupDetail(&user),
		LoginIdentities: buildLoginIdentities(&user),
		NetworkBindings: buildNetworkBindings(bindings),
		CreatedAt:       user.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:       user.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}

	return detail, nil
}

func (s *panelAccountService) Create(actorUserID uint, username, password, email string, groupID uint) error {
	if err := RequirePermission(actorUserID, "panel:account:create"); err != nil {
		return err
	}

	if strings.TrimSpace(username) == "" {
		return serializer.NewError(serializer.CodeParamErr, "username is required", nil)
	}
	if strings.TrimSpace(password) == "" {
		return serializer.NewError(serializer.CodeParamErr, "password is required for local panel accounts", nil)
	}

	var count int64
	if err := model.DB.Model(&model.User{}).Where("username = ?", username).Count(&count).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	if count > 0 {
		return serializer.ErrUserNameExisted
	}

	user := model.User{
		Username: username,
		Password: password,
		Email:    email,
		GroupID:  groupID,
		Provider: "local",
		IsActive: true,
	}

	if err := model.DB.Create(&user).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	return nil
}

func (s *panelAccountService) Update(actorUserID, accountID uint, email, displayName, password string, groupID uint) error {
	if err := RequirePermission(actorUserID, "panel:account:update"); err != nil {
		return err
	}
	return SystemService.UpdateUser(actorUserID, accountID, email, groupID, password, displayName)
}

func (s *panelAccountService) SetStatus(actorUserID, accountID uint, isActive bool) error {
	if err := RequirePermission(actorUserID, "panel:account:update"); err != nil {
		return err
	}

	if actorUserID == accountID {
		return serializer.NewError(serializer.CodeParamErr, "cannot change your own account status", nil)
	}

	var user model.User
	if err := model.DB.First(&user, accountID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return serializer.NewError(serializer.CodeNotFound, "panel account not found", nil)
		}
		return serializer.ErrDatabase.WithError(err)
	}

	if err := model.DB.Model(&user).Update("is_active", isActive).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	return nil
}

func (s *panelAccountService) ResetTOTP(actorUserID, accountID uint) error {
	if err := RequirePermission(actorUserID, "panel:account:update"); err != nil {
		return err
	}

	var user model.User
	if err := model.DB.First(&user, accountID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return serializer.NewError(serializer.CodeNotFound, "panel account not found", nil)
		}
		return serializer.ErrDatabase.WithError(err)
	}

	if !user.TOTPEnabled {
		return serializer.NewError(serializer.CodeParamErr, "TOTP is not enabled for this account", nil)
	}

	if err := model.DB.Model(&user).Updates(map[string]interface{}{
		"totp_enabled": false,
		"totp_secret":  "",
	}).Error; err != nil {
		return serializer.ErrDatabase.WithError(err)
	}
	return nil
}

func (s *panelAccountService) GetLoginIdentities(actorUserID, accountID uint) (*LoginIdentities, error) {
	if err := RequirePermission(actorUserID, "panel:account:list"); err != nil {
		return nil, err
	}

	var user model.User
	if err := model.DB.First(&user, accountID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, serializer.NewError(serializer.CodeNotFound, "panel account not found", nil)
		}
		return nil, serializer.ErrDatabase.WithError(err)
	}

	return buildLoginIdentities(&user), nil
}

func (s *panelAccountService) GetNetworkBindings(actorUserID, accountID uint) ([]NetworkBinding, error) {
	if err := RequirePermission(actorUserID, "panel:account:list"); err != nil {
		return nil, err
	}

	var bindings []model.UserIdentityBinding
	if err := model.DB.Where("user_id = ?", accountID).Find(&bindings).Error; err != nil {
		return nil, serializer.ErrDatabase.WithError(err)
	}

	return buildNetworkBindings(bindings), nil
}

type BindingEntry struct {
	HeadscaleName string `json:"headscale_name"`
	IsPrimary     bool   `json:"is_primary"`
}

func (s *panelAccountService) UpdateNetworkBindings(actorUserID, accountID uint, entries []BindingEntry) error {
	if err := RequirePermission(actorUserID, "panel:account:bindding"); err != nil {
		return err
	}

	var user model.User
	if err := model.DB.First(&user, accountID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return serializer.NewError(serializer.CodeNotFound, "panel account not found", nil)
		}
		return serializer.ErrDatabase.WithError(err)
	}

	// Validate: at most one primary
	primaryCount := 0
	for _, e := range entries {
		if e.IsPrimary {
			primaryCount++
		}
	}
	if primaryCount > 1 {
		return serializer.NewError(serializer.CodeParamErr, "at most one primary binding is allowed", nil)
	}

	validatedBindings, err := buildValidatedBindings(accountID, entries)
	if err != nil {
		return err
	}
	primaryName := pickPrimaryBindingName(entries)

	// Replace all bindings in a transaction
	return model.DB.Transaction(func(tx *gorm.DB) error {
		// Delete existing bindings
		if err := tx.Where("user_id = ?", accountID).Delete(&model.UserIdentityBinding{}).Error; err != nil {
			return serializer.ErrDatabase.WithError(err)
		}

		for _, binding := range validatedBindings {
			if err := tx.Create(&binding).Error; err != nil {
				return serializer.ErrDatabase.WithError(err)
			}
		}

		if err := tx.Model(&model.User{}).Where("id = ?", accountID).Update("headscale_name", primaryName).Error; err != nil {
			return serializer.ErrDatabase.WithError(err)
		}

		return nil
	})
}

func (s *panelAccountService) SetPrimaryBinding(actorUserID, accountID uint, bindingID uint) error {
	if err := RequirePermission(actorUserID, "panel:account:bindding"); err != nil {
		return err
	}

	return model.DB.Transaction(func(tx *gorm.DB) error {
		// Unset all primary for this account
		if err := tx.Model(&model.UserIdentityBinding{}).
			Where("user_id = ?", accountID).
			Update("is_primary", false).Error; err != nil {
			return serializer.ErrDatabase.WithError(err)
		}

		// Set the specified binding as primary
		result := tx.Model(&model.UserIdentityBinding{}).
			Where("id = ? AND user_id = ?", bindingID, accountID).
			Update("is_primary", true)
		if result.Error != nil {
			return serializer.ErrDatabase.WithError(result.Error)
		}
		if result.RowsAffected == 0 {
			return serializer.NewError(serializer.CodeNotFound, "binding not found", nil)
		}

		// Update User.HeadscaleName for backward compatibility
		var binding model.UserIdentityBinding
		if err := tx.First(&binding, bindingID).Error; err == nil {
			tx.Model(&model.User{}).Where("id = ?", accountID).Update("headscale_name", binding.HeadscaleName)
		}

		return nil
	})
}

func (s *panelAccountService) ListAvailableNetworkIdentities(actorUserID uint, search string, excludeAccountID uint) ([]NetworkIdentityItem, error) {
	if err := RequirePermission(actorUserID, "panel:account:list"); err != nil {
		return nil, err
	}

	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	ctx, cancel := withServiceTimeout(context.Background())
	defer cancel()

	resp, err := client.ListUsers(ctx, &v1.ListUsersRequest{})
	if err != nil {
		st, ok := status.FromError(err)
		if ok && st.Code() == codes.Unavailable {
			return nil, serializer.NewError(serializer.CodeThirdPartyServiceError, "headscale service unavailable", err)
		}
		return nil, serializer.NewError(serializer.CodeThirdPartyServiceError, "failed to list headscale users", err)
	}

	// Get already-bound names for the specified account so we can exclude them
	boundNames := map[string]bool{}
	if excludeAccountID > 0 {
		var bindings []model.UserIdentityBinding
		model.DB.Where("user_id = ?", excludeAccountID).Find(&bindings)
		for _, b := range bindings {
			boundNames[strings.ToLower(b.HeadscaleName)] = true
		}
	}

	items := make([]NetworkIdentityItem, 0)
	searchLower := strings.ToLower(search)
	for _, u := range resp.Users {
		if boundNames[strings.ToLower(u.Name)] {
			continue
		}
		if search != "" {
			nameLower := strings.ToLower(u.Name)
			emailLower := strings.ToLower(u.Email)
			if !strings.Contains(nameLower, searchLower) && !strings.Contains(emailLower, searchLower) {
				continue
			}
		}
		items = append(items, NetworkIdentityItem{
			ID:          u.Id,
			Name:        u.Name,
			DisplayName: u.DisplayName,
			Email:       u.Email,
			Provider:    u.Provider,
		})
	}

	return items, nil
}

// ---------- Helpers ----------

func deriveLoginMethods(u *model.User) []string {
	methods := make([]string, 0)
	provider := strings.ToLower(strings.TrimSpace(u.Provider))
	hasLocalPassword := strings.TrimSpace(u.Password) != ""

	if hasLocalPassword {
		methods = append(methods, "local")
	}

	switch provider {
	case "oidc":
		methods = append(methods, "oidc")
	case "headscale":
		// Headscale-synced user without direct panel login
		methods = append(methods, "headscale")
	default:
		if provider != "" && provider != "local" {
			methods = append(methods, provider)
		}
	}

	if len(methods) == 0 {
		methods = append(methods, "none")
	}

	return methods
}

func buildGroupDetail(u *model.User) *PanelAccountGroupDetail {
	if u.Group.ID == 0 {
		return nil
	}
	perms := make([]PanelPermissionItem, 0, len(u.Group.Permissions))
	for _, p := range u.Group.Permissions {
		perms = append(perms, PanelPermissionItem{
			Code: p.Code,
			Name: p.Name,
			Type: p.Type,
		})
	}
	return &PanelAccountGroupDetail{
		ID:          u.Group.ID,
		Name:        u.Group.Name,
		Permissions: perms,
	}
}

func buildLoginIdentities(u *model.User) *LoginIdentities {
	provider := strings.ToLower(strings.TrimSpace(u.Provider))
	hasLocalPassword := strings.TrimSpace(u.Password) != ""

	local := &LocalLoginIdentity{
		Enabled:     hasLocalPassword,
		HasPassword: hasLocalPassword,
		TOTPEnabled: u.TOTPEnabled,
	}

	var oidc *OIDCLoginIdentity
	if provider == "oidc" {
		oidc = &OIDCLoginIdentity{
			Bound:      true,
			Provider:   u.Provider,
			ProviderID: u.ProviderID,
			Email:      u.Email,
		}
	} else {
		oidc = &OIDCLoginIdentity{Bound: false}
	}

	return &LoginIdentities{
		Local: local,
		OIDC:  oidc,
	}
}

func buildNetworkBindings(bindings []model.UserIdentityBinding) []NetworkBinding {
	result := make([]NetworkBinding, 0, len(bindings))
	for _, b := range bindings {
		result = append(result, NetworkBinding{
			ID:            b.ID,
			HeadscaleID:   b.HeadscaleID,
			HeadscaleName: b.HeadscaleName,
			DisplayName:   b.DisplayName,
			Email:         b.Email,
			Provider:      b.Provider,
			IsPrimary:     b.IsPrimary,
		})
	}
	return result
}

func (s *panelAccountService) Delete(actorUserID, accountID uint) error {
	if err := RequirePermission(actorUserID, "panel:account:delete"); err != nil {
		return err
	}
	if actorUserID == accountID {
		return serializer.NewError(serializer.CodeParamErr, "cannot delete your own account", nil)
	}

	var user model.User
	if err := model.DB.First(&user, accountID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return serializer.NewError(serializer.CodeNotFound, "panel account not found", nil)
		}
		return serializer.ErrDatabase.WithError(err)
	}
	if strings.EqualFold(strings.TrimSpace(user.Provider), "headscale") {
		return serializer.NewError(serializer.CodeNotFound, "panel account not found", nil)
	}

	return model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ?", accountID).Delete(&model.UserIdentityBinding{}).Error; err != nil {
			return serializer.ErrDatabase.WithError(err)
		}
		if err := tx.Delete(&model.User{}, accountID).Error; err != nil {
			return serializer.ErrDatabase.WithError(err)
		}
		return nil
	})
}

func buildValidatedBindings(accountID uint, entries []BindingEntry) ([]model.UserIdentityBinding, error) {
	if len(entries) == 0 {
		return nil, nil
	}

	client, err := headscaleServiceClient()
	if err != nil {
		return nil, err
	}

	ctx, cancel := withServiceTimeout(context.Background())
	defer cancel()

	resp, err := client.ListUsers(ctx, &v1.ListUsersRequest{})
	if err != nil {
		return nil, serializer.NewError(serializer.CodeThirdPartyServiceError, "failed to validate headscale users", err)
	}

	hsUserMap := make(map[string]*HeadscaleUser, len(resp.Users))
	for _, u := range resp.Users {
		name := strings.TrimSpace(u.Name)
		if name == "" {
			continue
		}
		hsUserMap[strings.ToLower(name)] = &HeadscaleUser{
			ID:          u.Id,
			Name:        name,
			DisplayName: u.DisplayName,
			Email:       u.Email,
			Provider:    u.Provider,
		}
	}

	seen := make(map[string]struct{}, len(entries))
	bindings := make([]model.UserIdentityBinding, 0, len(entries))
	for _, entry := range entries {
		headscaleName := strings.TrimSpace(entry.HeadscaleName)
		if headscaleName == "" {
			return nil, serializer.NewError(serializer.CodeParamErr, "headscale_name is required", nil)
		}
		key := strings.ToLower(headscaleName)
		if _, exists := seen[key]; exists {
			return nil, serializer.NewError(serializer.CodeParamErr, "duplicate network binding is not allowed", nil)
		}
		seen[key] = struct{}{}

		hsUser, ok := hsUserMap[key]
		if !ok {
			return nil, serializer.NewError(serializer.CodeParamErr, "headscale user not found: "+headscaleName, nil)
		}

		bindings = append(bindings, model.UserIdentityBinding{
			UserID:        accountID,
			HeadscaleID:   hsUser.ID,
			HeadscaleName: hsUser.Name,
			DisplayName:   hsUser.DisplayName,
			Email:         hsUser.Email,
			Provider:      hsUser.Provider,
			IsPrimary:     entry.IsPrimary,
		})
	}

	return bindings, nil
}

func pickPrimaryBindingName(entries []BindingEntry) string {
	for _, entry := range entries {
		if entry.IsPrimary {
			return strings.TrimSpace(entry.HeadscaleName)
		}
	}
	if len(entries) == 0 {
		return ""
	}
	return strings.TrimSpace(entries[0].HeadscaleName)
}
