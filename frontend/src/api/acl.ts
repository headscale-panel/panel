import request, { RespType } from '@/lib/request';
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
  CheckACLAccessReq,
  CheckACLAccessRes,
} from './acl.types';

export const aclApi = {
  getPolicy: (_req?: GetPolicyReq) =>
    request<RespType<GetPolicyRes>>({
      url: '/headscale/acl/policy',
      method: 'GET',
    }),

  updatePolicy: (req: UpdatePolicyReq) =>
    request<RespType<UpdatePolicyRes>>({
      url: '/headscale/acl/policy',
      method: 'PUT',
      data: req,
    }),

  setPolicyRaw: (req: SetPolicyRawReq) =>
    request<RespType<SetPolicyRawRes>>({
      url: '/headscale/acl/policy/raw',
      method: 'POST',
      data: { policy: req.policy },
    }),

  getParsedRules: (_req?: GetParsedRulesReq) =>
    request<RespType<GetParsedRulesRes>>({
      url: '/headscale/acl/parsed-rules',
      method: 'GET',
    }),

  syncResourcesAsHosts: (_req?: SyncResourcesAsHostsReq) =>
    request<RespType<SyncResourcesAsHostsRes>>({
      url: '/headscale/acl/sync-resources',
      method: 'POST',
    }),

  addRule: (req: AddRuleReq) =>
    request<RespType<AddRuleRes>>({
      url: '/headscale/acl/add-rule',
      method: 'POST',
      data: {
        name: req.name,
        sources: req.sources,
        destinations: req.destinations,
        action: req.action,
      },
    }),

  updateRuleByIndex: (req: UpdateRuleByIndexReq) =>
    request<RespType<UpdateRuleByIndexRes>>({
      url: '/headscale/acl/update-rule',
      method: 'PUT',
      data: {
        index: req.index,
        name: req.name,
        sources: req.sources,
        destinations: req.destinations,
        action: req.action,
      },
    }),

  deleteRuleByIndex: (req: DeleteRuleByIndexReq) =>
    request<RespType<DeleteRuleByIndexRes>>({
      url: '/headscale/acl/delete-rule',
      method: 'DELETE',
      params: { index: req.index },
    }),

  generate: (_req?: GenerateReq) =>
    request<RespType<GenerateRes>>({
      url: '/headscale/acl/generate',
      method: 'POST',
    }),

  listPolicies: (_req?: ListPoliciesReq) =>
    request<RespType<ListPoliciesRes>>({
      url: '/headscale/acl/policies',
      method: 'GET',
    }),

  apply: (req: ApplyReq) =>
    request<RespType<ApplyRes>>({
      url: '/headscale/acl/apply',
      method: 'POST',
      data: { id: req.id },
    }),

  checkAccess: (_req?: CheckACLAccessReq) =>
    request<RespType<CheckACLAccessRes>>({
      url: '/headscale/acl/access',
      method: 'GET',
    }),
};