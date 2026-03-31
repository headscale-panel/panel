import request from '@/lib/request';
import type {
  GetPolicyReq,
  GetPolicyRes,
  UpdatePolicyReq,
  UpdatePolicyRes,
  SetPolicyRawReq,
  SetPolicyRawRes,
  GetParsedRulesReq,
  GetParsedRulesRes,
  SyncResourcesAsHostsReq,
  SyncResourcesAsHostsRes,
  AddRuleReq,
  AddRuleRes,
  UpdateRuleByIndexReq,
  UpdateRuleByIndexRes,
  DeleteRuleByIndexReq,
  DeleteRuleByIndexRes,
  GenerateReq,
  GenerateRes,
  ListPoliciesReq,
  ListPoliciesRes,
  ApplyReq,
  ApplyRes,
} from './acl.types';

export const aclApi = {
  getPolicy: (req?: GetPolicyReq) =>
    request.get<any, GetPolicyRes>('/headscale/acl/policy'),

  updatePolicy: (req: UpdatePolicyReq) =>
    request.put<any, UpdatePolicyRes>('/headscale/acl/policy', req),

  setPolicyRaw: (req: SetPolicyRawReq) =>
    request.post<any, SetPolicyRawRes>('/headscale/acl/policy/raw', {
      policy: req.policy,
    }),

  getParsedRules: (req?: GetParsedRulesReq) =>
    request.get<any, GetParsedRulesRes>('/headscale/acl/parsed-rules'),

  syncResourcesAsHosts: (req?: SyncResourcesAsHostsReq) =>
    request.post<any, SyncResourcesAsHostsRes>('/headscale/acl/sync-resources'),

  addRule: (req: AddRuleReq) =>
    request.post<any, AddRuleRes>('/headscale/acl/add-rule', {
      name: req.name,
      sources: req.sources,
      destinations: req.destinations,
      action: req.action,
    }),

  updateRuleByIndex: (req: UpdateRuleByIndexReq) =>
    request.put<any, UpdateRuleByIndexRes>('/headscale/acl/update-rule', {
      index: req.index,
      name: req.name,
      sources: req.sources,
      destinations: req.destinations,
      action: req.action,
    }),

  deleteRuleByIndex: (req: DeleteRuleByIndexReq) =>
    request.delete<any, DeleteRuleByIndexRes>('/headscale/acl/delete-rule', {
      params: { index: req.index },
    }),

  generate: (req?: GenerateReq) =>
    request.post<any, GenerateRes>('/headscale/acl/generate'),

  listPolicies: (req?: ListPoliciesReq) =>
    request.get<any, ListPoliciesRes>('/headscale/acl/policies'),

  apply: (req: ApplyReq) =>
    request.post<any, ApplyRes>('/headscale/acl/apply', {
      id: req.id,
    }),
};
