export interface GetPolicyReq {}

export interface ACLRuleMeta {
  name?: string;
  open?: boolean;
}

export interface ACLRule {
  '#ha-meta'?: ACLRuleMeta;
  action: string;
  src: string[];
  dst: string[];
}

export interface ACLPolicy {
  groups?: Record<string, string[]>;
  hosts?: Record<string, string>;
  tagOwners?: Record<string, string[]>;
  acls?: ACLRule[];
}

export type GetPolicyRes = ACLPolicy;

export interface UpdatePolicyReq extends ACLPolicy {}

export type UpdatePolicyRes = ACLPolicy;

export interface SetPolicyRawReq {
  policy: string;
}

export type SetPolicyRawRes = { success: boolean; message?: string };

export interface GetParsedRulesReq {}

export interface ParsedRule {
  index: number;
  action: string;
  sources: string[];
  destinations: string[];
  name?: string;
  error?: string;
}

export type GetParsedRulesRes = ParsedRule[];

export interface SyncResourcesAsHostsReq {}

export type SyncResourcesAsHostsRes = { success: boolean; count: number };

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

export type DeleteRuleByIndexRes = { success: boolean };

export interface GenerateReq {}

export type GenerateRes = ACLPolicy;

export interface ListPoliciesReq {}

export interface PolicyItem {
  id: number;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export type ListPoliciesRes = PolicyItem[];

export interface ApplyReq {
  id: number;
}

export type ApplyRes = { success: boolean; message?: string };
