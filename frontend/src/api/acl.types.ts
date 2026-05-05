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

import type { ACLPolicyRecord, ACLPolicyStructure, ACLRule, ParsedACLRule } from './entities';

export interface GetPolicyReq {}
export type GetPolicyRes = ACLPolicyStructure;

export interface UpdatePolicyReq extends ACLPolicyStructure {}
export type UpdatePolicyRes = ACLPolicyStructure;

export interface SetPolicyRawReq {
  policy: string;
}
export interface SetPolicyRawRes { success: boolean; message?: string }

export interface GetParsedRulesReq {}
export type GetParsedRulesRes = ParsedACLRule[];

export interface SyncResourcesAsHostsReq {}
export interface SyncResourcesAsHostsRes { success: boolean; count: number }

export interface AddRuleReq {
  name: string;
  sources: string[];
  destinations: string[];
  action: string;
}
export type AddRuleRes = ACLRule;

export interface UpdateRuleByIndexReq {
  index: number;
  name: string;
  sources: string[];
  destinations: string[];
  action: string;
}
export type UpdateRuleByIndexRes = ACLRule;

export interface DeleteRuleByIndexReq {
  index: number;
}
export interface DeleteRuleByIndexRes { success: boolean }

export interface GenerateReq {}
export type GenerateRes = ACLPolicyStructure;

export interface ListPoliciesReq {}
export type ListPoliciesRes = ACLPolicyRecord[];

export interface ApplyReq {
  id: number;
}
export interface ApplyRes { success: boolean; message?: string }

export interface CheckACLAccessReq {}
export interface ACLAccessResult {
  src: string;
  dst: string;
  port: string;
  allowed: boolean;
}
export type CheckACLAccessRes = ACLAccessResult[];
