package services

import (
	"headscale-panel/model"
	"headscale-panel/pkg/headscale"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"headscale-panel/pkg/utils/serializer"
	"strings"
)

const (
	defaultPage     = 1
	defaultPageSize = 20
	maxPageSize     = 200
)

type actorScope struct {
	isAdmin       bool
	headscaleName string
}

func headscaleServiceClient() (v1.HeadscaleServiceClient, error) {
	if headscale.GlobalClient == nil || headscale.GlobalClient.Service == nil {
		return nil, serializer.NewError(serializer.CodeThirdPartyServiceError, "headscale service is unavailable", nil)
	}
	return headscale.GlobalClient.Service, nil
}

func normalizePagination(page, pageSize int) (int, int) {
	if page < 1 {
		page = defaultPage
	}
	if pageSize < 1 {
		pageSize = defaultPageSize
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}
	return page, pageSize
}

func loadActorScope(actorUserID uint) (*actorScope, error) {
	var user model.User
	if err := model.DB.Preload("Group").First(&user, actorUserID).Error; err != nil {
		return nil, serializer.ErrPermissionDenied
	}

	headscaleName := strings.TrimSpace(user.HeadscaleName)
	if headscaleName == "" {
		headscaleName = strings.TrimSpace(user.Username)
	}

	return &actorScope{
		isAdmin:       strings.EqualFold(strings.TrimSpace(user.Group.Name), "admin"),
		headscaleName: headscaleName,
	}, nil
}

func actorCanAccessNode(scope *actorScope, node *v1.Node) bool {
	if scope == nil || node == nil {
		return false
	}
	if scope.isAdmin {
		return true
	}
	if node.User == nil {
		return false
	}
	if scope.headscaleName == "" {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(node.User.Name), scope.headscaleName)
}

func ensureActorCanAccessNode(actorUserID uint, node *v1.Node) error {
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return err
	}
	if !actorCanAccessNode(scope, node) {
		return serializer.ErrPermissionDenied
	}
	return nil
}
