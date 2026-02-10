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
	policy, err := services.ACLService.GetPolicy()
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

	if err := services.ACLService.UpdatePolicy(&policy); err != nil {
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

	if err := services.ACLService.SetPolicyRaw(req.Policy); err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, nil)
}

// GetParsedRules returns ACL rules with resolved groups and hosts
func (c *ACLController) GetParsedRules(ctx *gin.Context) {
	rules, err := services.ACLService.GetParsedRules()
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, rules)
}

// SyncResourcesAsHosts syncs all resources to ACL hosts
func (c *ACLController) SyncResourcesAsHosts(ctx *gin.Context) {
	if err := services.ACLService.SyncResourcesAsHosts(); err != nil {
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

	if err := services.ACLService.AddRule(req.Name, req.Sources, req.Destinations, req.Action); err != nil {
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

	if err := services.ACLService.UpdateRuleByIndex(req.Index, req.Name, req.Sources, req.Destinations, req.Action); err != nil {
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

	if err := services.ACLService.DeleteRuleByIndex(index); err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, nil)
}

// ACL Policies (Version History)

func (c *ACLController) Generate(ctx *gin.Context) {
	userID, _ := ctx.Get("userID")
	policy, err := services.ACLService.Generate(userID.(uint))
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, policy)
}

func (c *ACLController) ListPolicies(ctx *gin.Context) {
	page, _ := strconv.Atoi(ctx.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(ctx.DefaultQuery("page_size", "10"))

	policies, total, err := services.ACLService.ListPolicies(page, pageSize)
	if err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, gin.H{
		"list":  policies,
		"total": total,
	})
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

	if err := services.ACLService.Apply(req.ID); err != nil {
		serializer.Fail(ctx, err)
		return
	}
	serializer.Success(ctx, nil)
}
