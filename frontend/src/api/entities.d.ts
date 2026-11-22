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

import type { DNSRecordType } from '@/lib/enums';

// ─── Core response wrappers ───────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
  request?: string;
  request_id?: string;
}

export interface PaginatedData<T = unknown> {
  list: T[];
  total: number;
  page: number;
  page_size: number;
  page_count?: number;
}

// ─── Panel account (internal/account) ────────────────────────────────────────

export type AccountStatus = 'active' | 'disabled';

export interface Account {
  id: number;
  username: string;
  display_name?: string;
  email?: string;
  status: AccountStatus;
  must_change_password?: boolean;
  /** Derived: whether a password credential exists. The hash itself is never sent. */
  has_password?: boolean;
  totp_enabled?: boolean;
  profile_pic_url?: string;
  guide_tour_seen_at?: string | null;
  role_id: number;
  role?: Role;
  created_at?: string;
  updated_at?: string;
}

// ─── Role and permission (internal/account) ──────────────────────────────────

export interface Permission {
  id: number;
  code: string;
  name: string;
  type?: string;
}

export interface Role {
  id: number;
  name: string;
  description?: string;
  is_system_admin: boolean;
  permissions?: Permission[];
  created_at?: string;
  updated_at?: string;
}

/** Result of GET /me. Permissions are already expanded for admins. */
export interface MeView {
  id: number;
  username: string;
  display_name?: string;
  email?: string;
  status: AccountStatus;
  role_id: number;
  role_name?: string;
  is_system_admin: boolean;
  permissions: string[];
  profile_pic_url?: string;
  totp_enabled: boolean;
  has_password: boolean;
  guide_tour_seen: boolean;
}

// ─── Network identity (internal/network) ─────────────────────────────────────

/**
 * How a headscale user came into existence.
 *
 * `manual` means someone created it through the panel or the CLI; `panel_idp`
 * means the panel's own identity provider minted it; `external_idp` means a
 * third-party IdP did.
 */
export type IdentityOrigin = 'manual' | 'panel_idp' | 'external_idp' | 'unknown';

export interface IdentityBinding {
  id: number;
  account_id: number;
  is_primary: boolean;
}

export interface NetworkIdentity {
  hs_user_id: number;
  name: string;
  /** The alias ACL rules resolve against: email when present, else the name. */
  policy_username: string;
  display_name?: string;
  email?: string;
  profile_pic_url?: string;
  provider?: string;
  provider_id?: string;
  origin: IdentityOrigin;
  origin_issuer?: string;
  origin_account_id?: number;
  device_count: number;
  device_online: number;
  /** True for headscale's synthetic owner of tagged devices. */
  tagged: boolean;
  account_id?: number;
  binding_id?: number;
  is_primary?: boolean;
}

export interface Binding {
  id: number;
  account_id: number;
  hs_user_id: number;
  is_primary: boolean;
  hs_cached_name?: string;
  hs_cached_email?: string;
  hs_cached_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ReconcileResult {
  scanned: number;
  bound: number[] | null;
  skipped: number[] | null;
  failed: number[] | null;
}

// ─── Device (internal/network projection of a headscale node) ────────────────

export interface Device {
  /** Headscale node id, as a decimal string. */
  id: string;
  name: string;
  given_name?: string;
  owner_hs_user_id: number;
  owner_name?: string;
  /** True when this device belongs to the synthetic tagged-devices owner. */
  owner_tagged: boolean;
  user_id?: string;
  online: boolean;
  ephemeral?: boolean;
  ip_addresses?: string[];
  last_seen?: string | null;
  expiry?: string | null;
  created_at?: string;
  tags?: string[];
  approved_routes?: string[];
  available_routes?: string[];
  subnet_routes?: string[];
  is_exit_node: boolean;
}

export interface PreAuthKey {
  id: string;
  key: string;
  reusable: boolean;
  ephemeral: boolean;
  used: boolean;
  expiration: string | null;
  createdAt: string;
  aclTags?: string[] | null;
  user?: {
    id: string;
    name: string;
  } | null;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export interface Route {
  id: string;
  machine_id: number;
  machine_name: string;
  user_name: string;
  destination: string;
  advertised: boolean;
  enabled: boolean;
  is_exit_node: boolean;
}

// ─── ACL policy ──────────────────────────────────────────────────────────────

export type ACLAction = 'accept';

export interface ACLRuleMeta {
  name?: string;
  open?: boolean;
}

export interface ACLRule {
  '#ha-meta'?: ACLRuleMeta;
  'action': string;
  'proto'?: string;
  'src': string[];
  'dst': string[];
}

export interface ACLTest {
  src: string;
  accept?: string[];
  deny?: string[];
}

export interface GrantRule {
  src: string[];
  dst: string[];
  ip?: string | string[];
  app?: Record<string, unknown>;
  via?: string[];
}

export interface ACLNodeAttrRule {
  target: string[];
  attr: string[];
}

export interface ACLAutoApprovers {
  routes?: Record<string, string[]>;
  exitNode?: string[];
}

export interface ACLPolicy {
  [key: string]: unknown;
  groups?: Record<string, string[]>;
  hosts?: Record<string, string>;
  tagOwners?: Record<string, string[]>;
  acls?: ACLRule[];
  grants?: GrantRule[];
  autoApprovers?: ACLAutoApprovers;
  ssh?: unknown[];
  tests?: ACLTest[];
  sshTests?: unknown[];
  nodeAttrs?: ACLNodeAttrRule[];
  randomizeClientPort?: boolean;
}

export interface ParsedACLRule {
  id: number;
  name?: string;
  action: string;
  sources: string[];
  destinations: string[];
  resolved_sources?: string[];
  resolved_dests?: string[];
}

export interface ACLRevision {
  id: number;
  content?: string;
  version?: number;
  created_by?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Resources (ACL host aliases) ────────────────────────────────────────────

export interface Resource {
  id: number;
  name: string;
  ip_address: string;
  port?: string;
  description?: string;
  creator_id?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

// ─── DNS ─────────────────────────────────────────────────────────────────────

export interface DNSRecord {
  id: number;
  name: string;
  type: DNSRecordType;
  value: string;
  comment?: string;
  created_at?: string;
  updated_at?: string;
}

// ─── Topology and dashboard ──────────────────────────────────────────────────

export interface TopologyUser {
  id: string;
  name: string;
  email?: string;
  provider?: string;
  deviceCount: number;
}

export interface TopologyDevice {
  id: string;
  name: string;
  user: string;
  online: boolean;
  ipAddresses: string[];
  lastSeen?: string;
  tags?: string[];
}

export interface TopologyACL {
  src: string;
  dst: string;
  action: string;
}

export interface TopologyResponse {
  users: TopologyUser[];
  devices: TopologyDevice[];
  acl: TopologyACL[];
  policy?: {
    groups?: Record<string, string[]>;
    hosts?: Record<string, string>;
    tagOwners?: Record<string, string[]>;
  };
}

export interface DashboardOverview {
  account_count: number;
  role_count: number;
  resource_count: number;
  identity_count: number;
  device_count: number;
  online_device_count: number;
  dns_record_count: number;
}
