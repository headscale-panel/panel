package services

import (
	"context"
	"headscale-panel/model"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/headscale"
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"headscale-panel/pkg/unifyerror"
	"net/http"
	"strings"
)

type actorScope struct {
	isAdmin       bool
	headscaleName string
}

func headscaleServiceClient() (v1.HeadscaleServiceClient, error) {
	client, err := headscale.GetOrRefreshClient()
	if err != nil {
		return nil, unifyerror.GRPCError(err)
	}
	if client == nil || client.Service == nil {
		return nil, unifyerror.New(http.StatusBadGateway, unifyerror.CodeGRPCErr, "headscale service is unavailable")
	}
	return client.Service, nil
}

func normalizePagination(page, pageSize int) (int, int) {
	if pageSize < 0 {
		return 1, -1 // all mode
	}
	if page < 1 {
		page = constants.DefaultPage
	}
	if pageSize < 1 {
		pageSize = constants.DefaultPageSize
	}
	if pageSize > constants.MaxPageSize {
		pageSize = constants.MaxPageSize
	}
	return page, pageSize
}

func loadActorScope(actorUserID uint) (*actorScope, error) {
	var user model.User
	if err := model.DB.Preload("Group").First(&user, actorUserID).Error; err != nil {
		return nil, unifyerror.Forbidden()
	}

	headscaleName := strings.TrimSpace(user.HeadscaleName)
	if headscaleName == "" {
		headscaleName = strings.TrimSpace(user.Username)
	}

	return &actorScope{
		isAdmin:       IsAdminGroupName(user.Group.Name),
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
		return unifyerror.Forbidden()
	}
	return nil
}

func actorCanAccessHeadscaleUser(scope *actorScope, headscaleName string) bool {
	if scope == nil {
		return false
	}
	if scope.isAdmin {
		return true
	}
	return strings.EqualFold(strings.TrimSpace(scope.headscaleName), strings.TrimSpace(headscaleName))
}

func ensureActorCanAccessHeadscaleUserName(actorUserID uint, headscaleName string) error {
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return err
	}
	if !actorCanAccessHeadscaleUser(scope, headscaleName) {
		return unifyerror.Forbidden()
	}
	return nil
}

func resolveHeadscaleUserNameByID(ctx context.Context, userID uint64) (string, error) {
	client, err := headscaleServiceClient()
	if err != nil {
		return "", err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, err := client.ListUsers(queryCtx, &v1.ListUsersRequest{})
	if err != nil {
		return "", unifyerror.New(http.StatusBadGateway, unifyerror.CodeGRPCErr, "failed to list headscale users")
	}

	for _, user := range resp.Users {
		if user.Id == userID {
			return strings.TrimSpace(user.Name), nil
		}
	}

	return "", unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound, "headscale user not found")
}

func ensureActorCanAccessHeadscaleUserID(ctx context.Context, actorUserID uint, userID uint64) error {
	headscaleName, err := resolveHeadscaleUserNameByID(ctx, userID)
	if err != nil {
		return err
	}
	return ensureActorCanAccessHeadscaleUserName(actorUserID, headscaleName)
}

func resolvePanelUserHeadscaleName(userID uint) (string, error) {
	var user model.User
	if err := model.DB.First(&user, userID).Error; err != nil {
		return "", unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound, "user not found")
	}

	headscaleName := strings.TrimSpace(user.HeadscaleName)
	if headscaleName == "" {
		headscaleName = strings.TrimSpace(user.Username)
	}
	if headscaleName == "" {
		return "", unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "target user has no Headscale identity")
	}
	return headscaleName, nil
}

func ensureActorCanAccessPanelUser(actorUserID uint, targetUserID uint) error {
	headscaleName, err := resolvePanelUserHeadscaleName(targetUserID)
	if err != nil {
		return err
	}
	return ensureActorCanAccessHeadscaleUserName(actorUserID, headscaleName)
}

func listAccessibleNodes(ctx context.Context, actorUserID uint) ([]*v1.Node, *actorScope, error) {
	client, err := headscaleServiceClient()
	if err != nil {
		return nil, nil, err
	}
	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	resp, err := client.ListNodes(queryCtx, &v1.ListNodesRequest{})
	if err != nil {
		return nil, nil, unifyerror.New(http.StatusBadGateway, unifyerror.CodeGRPCErr, "failed to list nodes from Headscale")
	}

	nodes := make([]*v1.Node, 0, len(resp.Nodes))
	for _, node := range resp.Nodes {
		if actorCanAccessNode(scope, node) {
			nodes = append(nodes, node)
		}
	}

	return nodes, scope, nil
}
