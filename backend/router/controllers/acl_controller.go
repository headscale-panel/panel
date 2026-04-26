package controllers

import (
	"net/http"
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/model"
	"headscale-panel/router/services"

	"github.com/gin-gonic/gin"
)

type ACLController struct{}

func NewACLController() *ACLController {
	return &ACLController{}
}

// GetPolicy godoc
// @Summary Get the current ACL policy
// @Tags acl
// @Produce json
// @Success 200 {object} unifyerror.Response{data=model.ACLPolicyStructure}
// @Security BearerAuth
// @Router /headscale/acl/policy [get]
// GetPolicy retrieves the current ACL policy from Headscale
func (c *ACLController) GetPolicy(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	policy, err := services.ACLService.GetPolicyWithContext(ctx.Request.Context(), userID)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, policy)
}

// UpdatePolicy godoc
// @Summary Update the ACL policy
// @Tags acl
// @Accept json
// @Produce json
// @Param body body model.ACLPolicyStructure true "ACL policy"
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/acl/policy [put]
// UpdatePolicy updates the ACL policy in Headscale
func (c *ACLController) UpdatePolicy(ctx *gin.Context) {
	var policy model.ACLPolicyStructure
	if err := ctx.ShouldBindJSON(&policy); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.ACLService.UpdatePolicyWithContext(ctx.Request.Context(), userID, &policy); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, nil)
}

// SetPolicyRaw godoc
// @Summary Set ACL policy from raw JSON string
// @Tags acl
// @Accept json
// @Produce json
// @Param body body SetPolicyRawRequest true "Raw policy JSON"
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/acl/policy/raw [post]
// SetPolicyRaw sets the ACL policy from raw JSON
type SetPolicyRawRequest struct {
	Policy string `json:"policy" binding:"required"`
}

func (c *ACLController) SetPolicyRaw(ctx *gin.Context) {
	var req SetPolicyRawRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.ACLService.SetPolicyRawWithContext(ctx.Request.Context(), userID, req.Policy); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, nil)
}

// GetParsedRules godoc
// @Summary Get ACL rules with resolved groups and hosts
// @Tags acl
// @Produce json
// @Success 200 {object} unifyerror.Response{data=[]model.ParsedACLRule}
// @Security BearerAuth
// @Router /headscale/acl/parsed-rules [get]
// GetParsedRules returns ACL rules with resolved groups and hosts
func (c *ACLController) GetParsedRules(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	rules, err := services.ACLService.GetParsedRulesWithContext(ctx.Request.Context(), userID)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, rules)
}

// SyncResourcesAsHosts godoc
// @Summary Sync all resources to ACL hosts
// @Tags acl
// @Produce json
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/acl/sync-resources [post]
// SyncResourcesAsHosts syncs all resources to ACL hosts
func (c *ACLController) SyncResourcesAsHosts(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	if err := services.ACLService.SyncResourcesAsHostsWithContext(ctx.Request.Context(), userID); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, nil)
}

// AddRule godoc
// @Summary Add a new ACL rule
// @Tags acl
// @Accept json
// @Produce json
// @Param body body AddRuleRequest true "ACL rule"
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/acl/add-rule [post]
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
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.ACLService.AddRuleWithContext(ctx.Request.Context(), userID, req.Name, req.Sources, req.Destinations, req.Action); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, nil)
}

// UpdateRuleByIndex godoc
// @Summary Update an ACL rule by index
// @Tags acl
// @Accept json
// @Produce json
// @Param body body UpdateRuleByIndexRequest true "ACL rule update"
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/acl/update-rule [put]
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
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.ACLService.UpdateRuleByIndexWithContext(ctx.Request.Context(), userID, req.Index, req.Name, req.Sources, req.Destinations, req.Action); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, nil)
}

// DeleteRuleByIndexQuery is the query parameter struct for DeleteRuleByIndex.
type DeleteRuleByIndexQuery struct {
	Index int `form:"index" binding:"required"`
}

// DeleteRuleByIndex godoc
// @Summary Delete an ACL rule by index
// @Tags acl
// @Produce json
// @Param index query int true "Rule index"
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/acl/delete-rule [delete]
// DeleteRuleByIndex deletes an ACL rule by its index
func (c *ACLController) DeleteRuleByIndex(ctx *gin.Context) {
	var q DeleteRuleByIndexQuery
	if err := ctx.ShouldBindQuery(&q); err != nil {
		unifyerror.Fail(ctx, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "无效的索引"))
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.ACLService.DeleteRuleByIndexWithContext(ctx.Request.Context(), userID, q.Index); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, nil)
}

// ACL Policies (Version History)

// Generate godoc
// @Summary Generate an ACL policy from current settings
// @Tags acl
// @Produce json
// @Success 200 {object} unifyerror.Response{data=model.ACLPolicyStructure}
// @Security BearerAuth
// @Router /headscale/acl/generate [post]
func (c *ACLController) Generate(ctx *gin.Context) {
	userID := ctx.GetUint("userID")
	policy, err := services.ACLService.GenerateWithContext(ctx.Request.Context(), userID)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, policy)
}

// ListPolicies godoc
// @Summary List ACL policy versions
// @Tags acl
// @Produce json
// @Param page query int false "Page number" default(1)
// @Param page_size query int false "Page size" default(10)
// @Success 200 {object} unifyerror.Response{data=unifyerror.PaginatedData{list=[]model.ACLPolicy}}
// @Security BearerAuth
// @Router /headscale/acl/policies [get]
func (c *ACLController) ListPolicies(ctx *gin.Context) {
	var q unifyerror.PaginationQuery
	if err := ctx.ShouldBindQuery(&q); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}
	page, pageSize := q.Resolve()

	userID := ctx.GetUint("userID")
	policies, total, err := services.ACLService.ListPolicies(userID, page, pageSize)
	if err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.SuccessPage(ctx, policies, total, page, pageSize)
}

type ApplyPolicyRequest struct {
	ID uint `json:"id" binding:"required"`
}

// Apply godoc
// @Summary Apply a saved ACL policy version
// @Tags acl
// @Accept json
// @Produce json
// @Param body body ApplyPolicyRequest true "Policy ID"
// @Success 200 {object} unifyerror.Response
// @Failure 400 {object} unifyerror.Response
// @Security BearerAuth
// @Router /headscale/acl/apply [post]
func (c *ACLController) Apply(ctx *gin.Context) {
	var req ApplyPolicyRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(ctx, unifyerror.ErrBind)
		return
	}

	userID := ctx.GetUint("userID")
	if err := services.ACLService.ApplyWithContext(ctx.Request.Context(), userID, req.ID); err != nil {
		unifyerror.Fail(ctx, err)
		return
	}
	unifyerror.Success(ctx, nil)
}
