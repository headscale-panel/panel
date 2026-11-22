/*
 * Copyright (C) 2026
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import type {
  AddRuleReq,
  AddRuleRes,
  ApplyReq,
  ApplyRes,
  CheckACLAccessReq,
  CheckACLAccessRes,
  CheckPolicyReq,
  CheckPolicyRes,
  DeleteRuleByIndexReq,
  DeleteRuleByIndexRes,
  GenerateReq,
  GenerateRes,
  GetParsedRulesReq,
  GetParsedRulesRes,
  GetPolicyReq,
  GetPolicyRes,
  ListPoliciesReq,
  ListPoliciesRes,
  SetPolicyRawReq,
  SetPolicyRawRes,
  SyncResourcesAsHostsReq,
  SyncResourcesAsHostsRes,
  UpdatePolicyReq,
  UpdatePolicyRes,
  UpdateRuleByIndexReq,
  UpdateRuleByIndexRes,
} from './acl.types';
import type { RespType } from '@/lib/request';
import request from '@/lib/request';

export const aclApi = {
  getPolicy: (_req?: GetPolicyReq) =>
    request<RespType<GetPolicyRes>>({
      url: '/policy',
      method: 'GET',
    }),

  updatePolicy: (req: UpdatePolicyReq) => {
    // The token must travel beside the policy, not inside it: headscale parses the
    // policy body strictly and rejects `expectedUpdatedAt` as an unknown field.
    const { expectedUpdatedAt, ...policy } = req;
    return request<RespType<UpdatePolicyRes>>({
      url: '/policy',
      method: 'PUT',
      data: { policy, expectedUpdatedAt },
    });
  },

  setPolicyRaw: (req: SetPolicyRawReq) =>
    request<RespType<SetPolicyRawRes>>({
      url: '/policy/raw',
      method: 'POST',
      data: { policy: req.policy, expectedUpdatedAt: req.expectedUpdatedAt },
    }),

  checkPolicy: (req: CheckPolicyReq) =>
    request<RespType<CheckPolicyRes>>({
      url: '/policy/check',
      method: 'POST',
      data: { policy: req.policy },
    }),

  getParsedRules: (_req?: GetParsedRulesReq) =>
    request<RespType<GetParsedRulesRes>>({
      url: '/policy/rules',
      method: 'GET',
    }),

  syncResourcesAsHosts: (_req?: SyncResourcesAsHostsReq) =>
    request<RespType<SyncResourcesAsHostsRes>>({
      url: '/policy/sync-resources',
      method: 'POST',
    }),

  addRule: (req: AddRuleReq) =>
    request<RespType<AddRuleRes>>({
      url: '/policy/rules',
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
      url: '/policy/rules',
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
      url: '/policy/rules',
      method: 'DELETE',
      params: { index: req.index },
    }),

  generate: (_req?: GenerateReq) =>
    request<RespType<GenerateRes>>({
      url: '/policy/generate',
      method: 'POST',
    }),

  listPolicies: (_req?: ListPoliciesReq) =>
    request<RespType<ListPoliciesRes>>({
      url: '/policy/revisions',
      method: 'GET',
    }),

  apply: (req: ApplyReq) =>
    request<RespType<ApplyRes>>({
      url: `/policy/revisions/${String(req.id)}/apply`,
      method: 'POST',
      data: { id: req.id },
    }),

  checkAccess: (_req?: CheckACLAccessReq) =>
    request<RespType<CheckACLAccessRes>>({
      url: '/policy/access-check',
      method: 'GET',
    }),
};
