package controllers

import (
	"headscale-panel/model"
	"headscale-panel/pkg/utils/serializer"
	"headscale-panel/router/services"
	"strconv"

	"github.com/gin-gonic/gin"
)

type ACLController struct{}

func NewACLController() *ACLController {
	return &ACLController{}
}

// GetPolicy retrieves the current ACL policy from Headscale
func (c *ACLController) GetPolicy(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	policy, err := services.ACLService.GetPolicyWithContext(ctx.Request.Context(), userID)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, policy)
}

// UpdatePolicy updates the ACL policy in Headscale
func (c *ACLController) UpdatePolicy(ctx *gin.Context) {
	var policy model.ACLPolicyStructure
	if err := ctx.ShouldBindJSON(&policy); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.ACLService.UpdatePolicyWithContext(ctx.Request.Context(), userID, &policy); err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, nil)
}

// SetPolicyRaw sets the ACL policy from raw JSON
type SetPolicyRawRequest struct {
	Policy string `json:"policy" binding:"required"`
}

func (c *ACLController) SetPolicyRaw(ctx *gin.Context) {
	var req SetPolicyRawRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.ACLService.SetPolicyRawWithContext(ctx.Request.Context(), userID, req.Policy); err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, nil)
}

// GetParsedRules returns ACL rules with resolved groups and hosts
func (c *ACLController) GetParsedRules(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	rules, err := services.ACLService.GetParsedRulesWithContext(ctx.Request.Context(), userID)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, rules)
}

// SyncResourcesAsHosts syncs all resources to ACL hosts
func (c *ACLController) SyncResourcesAsHosts(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	if err := services.ACLService.SyncResourcesAsHostsWithContext(ctx.Request.Context(), userID); err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, nil)
}

// AddRule adds a new ACL rule
type AddRuleRequest struct {
	Name         string   `json:"name"`
	Sources      []string `json:"sources" binding:"required"`
	Destinations []string `json:"destinations" binding:"required"`
	Action       string   `json:"action" binding:"required"`
}

func (c *ACLController) AddRule(ctx *gin.Context) {
	var req AddRuleRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.ACLService.AddRuleWithContext(ctx.Request.Context(), userID, req.Name, req.Sources, req.Destinations, req.Action); err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, nil)
}

// UpdateRuleByIndex updates an ACL rule by its index
type UpdateRuleByIndexRequest struct {
	Index        int      `json:"index" binding:"required"`
	Name         string   `json:"name"`
	Sources      []string `json:"sources" binding:"required"`
	Destinations []string `json:"destinations" binding:"required"`
	Action       string   `json:"action" binding:"required"`
}

func (c *ACLController) UpdateRuleByIndex(ctx *gin.Context) {
	var req UpdateRuleByIndexRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.ACLService.UpdateRuleByIndexWithContext(ctx.Request.Context(), userID, req.Index, req.Name, req.Sources, req.Destinations, req.Action); err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, nil)
}

// DeleteRuleByIndex deletes an ACL rule by its index
func (c *ACLController) DeleteRuleByIndex(ctx *gin.Context) {
	indexStr := ctx.Query("index")
	index, err := strconv.Atoi(indexStr)
	if err != nil {
		serializer.FailWithCode(ctx, serializer.CodeParamErr, "无效的索引")
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.ACLService.DeleteRuleByIndexWithContext(ctx.Request.Context(), userID, index); err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, nil)
}

// ACL Policies (Version History)

func (c *ACLController) Generate(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	policy, err := services.ACLService.GenerateWithContext(ctx.Request.Context(), userID)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, policy)
}

func (c *ACLController) ListPolicies(ctx *gin.Context) {
	page, pageSize := serializer.ParsePaginationQuery(ctx)

	userID := ctx.GetUint("userID")
	policies, total, err := services.ACLService.ListPolicies(userID, page, pageSize)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.SuccessPage(ctx, policies, total, page, pageSize)
}

type ApplyPolicyRequest struct {
	ID uint `json:"id" binding:"required"`
}

func (c *ACLController) Apply(ctx *gin.Context) {
	var req ApplyPolicyRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		serializer.Fail(ctx, serializer.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.ACLService.ApplyWithContext(ctx.Request.Context(), userID, req.ID); err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, nil)
}
