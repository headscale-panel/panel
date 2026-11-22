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
  DashboardTopologyACLRule,
  DashboardTopologyData,
  DashboardTopologyDevice,
  DashboardTopologyPolicy,
  DashboardTopologyUser,
} from './dashboard';
import type { UserProvider } from './enums';
import { isArray, isBoolean, isNumber, isObject, isString, toInt } from 'radashi';
import { ACLAction } from './enums';

export interface AuthPayload {
  token: string;
  user: Record<string, unknown>;
  permissions?: string[];
}

export interface NormalizedDeviceUser {
  id?: string;
  name: string;
  display_name: string;
  email: string;
}

export interface NormalizedDevice {
  id: string;
  ip_addresses: string[];
  name: string;
  given_name: string;
  user: NormalizedDeviceUser | null;
  /** Headscale user id owning the device; 0 when the owner is unknown. */
  owner_hs_user_id: number;
  owner_name: string;
  /**
   * True when headscale's synthetic tagged-devices owner holds the device.
   *
   * Applying a tag transfers ownership upstream, so a tagged device no longer
   * belongs to its previous human owner. The UI must render it as its own bucket
   * rather than show a username that has no account behind it.
   */
  owner_tagged: boolean;
  online: boolean;
  ephemeral: boolean;
  last_seen: string | null;
  expiry: string | null;
  created_at: string | null;
  register_method: string;
  tags: string[];
  approved_routes: string[];
  available_routes: string[];
  subnet_routes: string[];
  is_exit_node: boolean;
}

export interface DeviceListResult {
  list: NormalizedDevice[];
  total: number;
}

export interface HeadscaleUserOption {
  id: string;
  name: string;
}

export interface NormalizedGroup {
  ID: number;
  name: string;
  CreatedAt?: string;
}

export interface NormalizedSystemUser {
  ID: number;
  CreatedAt: string;
  UpdatedAt: string;
  username: string;
  email: string;
  display_name: string;
  headscale_name: string;
  group_id: number;
  group?: NormalizedGroup;
  is_active: boolean;
  profile_pic_url?: string;
  provider?: UserProvider;
  provider_id?: string;
}

export interface NormalizedHeadscaleUser {
  ID: number;
  CreatedAt: string;
  username: string;
  email: string;
  display_name: string;
  headscale_name: string;
  provider?: UserProvider;
  provider_id?: string;
  profile_pic_url?: string;
}

export interface NormalizedResource {
  id: number;
  name: string;
  ip_address: string;
  port?: string;
  description?: string;
}

export interface ACLPolicy {

  [key: string]: unknown;
  groups?: Record<string, string[]>;
  hosts?: Record<string, string>;
  tagOwners?: Record<string, string[]>;
  acls?: Array<{
    '#ha-meta'?: { name: string; open: boolean };
    'action': string;
    'proto'?: string;
    'src': string[];
    'dst': string[];
  }>;
  grants?: Array<{
    src: string[];
    dst: string[];
    ip?: string | string[];
    app?: Record<string, unknown>;
    via?: string[];
  }>;
  autoApprovers?: {
    routes?: Record<string, string[]>;
    exitNode?: string[];
  };
  ssh?: unknown[];
  tests?: Array<{ src: string; accept?: string[]; deny?: string[] }>;
  sshTests?: unknown[];
  nodeAttrs?: Array<{ target: string[]; attr: string[] }>;
  randomizeClientPort?: boolean;
}

export interface OIDCStatusData {
  oidc_enabled: boolean;
  third_party: boolean;
  builtin: boolean;
  password_required: boolean;
  mode: string;
}

export interface PanelConnectionSettings {
  api_addr: string;
  insecure: boolean;
  tls_skip_verify: boolean;
  tls_ca_cert: string;
  has_api_key: boolean;
  is_configured: boolean;
  legacy_grpc_addr: string;
}

export interface OIDCFormValues {
  enabled: boolean;
  only_start_if_oidc_is_available: boolean;
  issuer: string;
  client_id: string;
  client_secret: string;
  client_secret_path: string;
  scope: string[];
  email_verified_required: boolean;
  allowed_domains: string[];
  allowed_users: string[];
  allowed_groups: string[];
  strip_email_domain: boolean;
  expiry: string;
  use_expiry_from_token: boolean;
  pkce_enabled: boolean;
  pkce_method: string;
}

export const defaultOIDCFormValues: OIDCFormValues = {
  enabled: false,
  only_start_if_oidc_is_available: false,
  issuer: '',
  client_id: '',
  client_secret: '',
  client_secret_path: '',
  scope: ['openid', 'profile', 'email'],
  email_verified_required: false,
  allowed_domains: [],
  allowed_users: [],
  allowed_groups: [],
  strip_email_domain: false,
  expiry: '180d',
  use_expiry_from_token: false,
  pkce_enabled: true,
  pkce_method: 'S256',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return isObject(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown, fallback = ''): string {
  return isString(value) ? value : fallback;
}

function asIdentifier(value: unknown, fallback = ''): string {
  if (isString(value))
    return value;
  if (isNumber(value) && Number.isFinite(value))
    return String(value);
  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (isNumber(value) && Number.isFinite(value))
    return value;
  return toInt(value, fallback);
}

function asBoolean(value: unknown, fallback = false): boolean {
  return isBoolean(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return isArray(value) ? value.filter(isString) : [];
}

function extractListCandidate(value: unknown): unknown[] {
  if (isArray(value))
    return value;

  const record = asRecord(value);
  if (!record)
    return [];

  const directKeys = ['list', 'machines', 'users', 'items', 'records'];
  for (const key of directKeys) {
    if (isArray(record[key]))
      return record[key] as unknown[];
  }

  return [];
}

function normalizeDeviceUser(value: unknown): NormalizedDeviceUser | null {
  const user = asRecord(value);
  if (!user) {
    return null;
  }

  const name
    = asString(user.name)
      || asString(user.username)
      || asString(user.headscale_name)
      || asString(user.display_name);

  if (!name) {
    return null;
  }

  return {
    id: asIdentifier(user.id) || asIdentifier(user.ID) || undefined,
    name,
    display_name: asString(user.display_name),
    email: asString(user.email),
  };
}

function normalizeDevice(raw: unknown): NormalizedDevice {
  const device = asRecord(raw) ?? {};

  return {
    id: asIdentifier(device.id) || asIdentifier(device.ID) || asIdentifier(device.machineId),
    ip_addresses: asStringArray(device.ip_addresses ?? device.ipAddresses),
    name: asString(device.name),
    given_name: asString(device.given_name) || asString(device.givenName) || asString(device.name),
    user: normalizeDeviceUser(device.user),
    owner_hs_user_id: asNumber(device.owner_hs_user_id ?? device.hs_user_id),
    owner_name: asString(device.owner_name) || asString((asRecord(device.user) ?? {}).name),
    owner_tagged: asBoolean(device.owner_tagged),
    online: asBoolean(device.online),
    ephemeral: asBoolean(device.ephemeral),
    last_seen: asString(device.last_seen) || asString(device.lastSeen) || null,
    expiry: asString(device.expiry) || null,
    created_at: asString(device.created_at) || null,
    register_method: asString(device.register_method),
    tags: asStringArray(device.tags),
    approved_routes: asStringArray(device.approved_routes),
    available_routes: asStringArray(device.available_routes),
    subnet_routes: asStringArray(device.subnet_routes),
    is_exit_node: asBoolean(device.is_exit_node),
  };
}

export function normalizeDeviceListResponse(value: unknown): DeviceListResult {
  const record = asRecord(value);
  const listCandidate = extractListCandidate(value);
  const list = listCandidate.map(normalizeDevice).filter((device) => device.id);

  return {
    list,
    total: asNumber(record?.total, list.length),
  };
}

export function normalizeHeadscaleUserOptions(value: unknown): HeadscaleUserOption[] {
  return extractListCandidate(value)
    .map((item) => {
      const user = asRecord(item) ?? {};
      const name
        = asString(user.name)
          || asString(user.username)
          || asString(user.headscale_name);

      if (!name) {
        return null;
      }

      return {
        id: asIdentifier(user.id) || asIdentifier(user.ID) || name,
        name,
      };
    })
    .filter((user): user is HeadscaleUserOption => Boolean(user));
}

export function normalizeHeadscaleUsers(value: unknown): NormalizedHeadscaleUser[] {
  const normalizedUsers: NormalizedHeadscaleUser[] = [];

  for (const item of extractListCandidate(value)) {
    const user = asRecord(item) ?? {};
    const name
      = asString(user.name)
        || asString(user.username)
        || asString(user.headscale_name);

    if (!name) {
      continue;
    }

    normalizedUsers.push({
      ID: asNumber(user.ID ?? user.id),
      CreatedAt: asString(user.created_at) || asString(user.CreatedAt),
      username: name,
      email: asString(user.email),
      display_name: asString(user.display_name),
      headscale_name: name,
      provider: (asString(user.provider) || undefined) as UserProvider | undefined,
      provider_id: asString(user.provider_id) || undefined,
      profile_pic_url: asString(user.profile_pic_url) || undefined,
    });
  }

  return normalizedUsers;
}

function _normalizeSystemUsers(value: unknown): NormalizedSystemUser[] {
  const normalizedUsers: NormalizedSystemUser[] = [];

  for (const item of extractListCandidate(value)) {
    const user = asRecord(item) ?? {};
    const username = asString(user.username);
    if (!username) {
      continue;
    }

    const groupRecord = asRecord(user.group);

    normalizedUsers.push({
      ID: asNumber(user.ID ?? user.id),
      CreatedAt: asString(user.CreatedAt),
      UpdatedAt: asString(user.UpdatedAt),
      username,
      email: asString(user.email),
      display_name: asString(user.display_name),
      headscale_name: asString(user.headscale_name),
      group_id: asNumber(user.group_id),
      group: groupRecord
        ? {
            ID: asNumber(groupRecord.ID ?? groupRecord.id),
            name: asString(groupRecord.name),
            CreatedAt: asString(groupRecord.CreatedAt) || undefined,
          }
        : undefined,
      is_active: asBoolean(user.is_active, true),
      profile_pic_url: asString(user.profile_pic_url) || undefined,
      provider: (asString(user.provider) || undefined) as UserProvider | undefined,
      provider_id: asString(user.provider_id) || undefined,
    });
  }

  return normalizedUsers;
}

function _normalizeGroups(value: unknown): NormalizedGroup[] {
  const normalizedGroups: NormalizedGroup[] = [];

  for (const item of extractListCandidate(value)) {
    const group = asRecord(item) ?? {};
    const name = asString(group.name);
    if (!name) {
      continue;
    }

    normalizedGroups.push({
      ID: asNumber(group.ID ?? group.id),
      name,
      CreatedAt: asString(group.CreatedAt) || undefined,
    });
  }

  return normalizedGroups;
}

export function normalizeResources(value: unknown): NormalizedResource[] {
  const normalizedResources: NormalizedResource[] = [];

  for (const item of extractListCandidate(value)) {
    const resource = asRecord(item) ?? {};
    const name = asString(resource.name);
    const ipAddress = asString(resource.ip_address);
    if (!name || !ipAddress) {
      continue;
    }

    normalizedResources.push({
      id: asNumber(resource.id ?? resource.ID),
      name,
      ip_address: ipAddress,
      port: asString(resource.port) || undefined,
      description: asString(resource.description) || undefined,
    });
  }

  return normalizedResources;
}

export function normalizeACLPolicy(value: unknown): ACLPolicy | null {
  const root = asRecord(value);
  if (!root) {
    return null;
  }

  const nestedData = asRecord(root.data);
  const nestedNestedData = nestedData ? asRecord(nestedData.data) : null;
  let candidate = nestedNestedData ?? nestedData ?? root;

  // GET /policy answers {policy, updatedAt} so the client also receives the
  // optimistic-lock token. Unwrapping here keeps every caller working with a policy
  // object instead of each one needing to know about the envelope.
  const envelope = asRecord(candidate.policy);
  if (envelope) {
    candidate = envelope;
  }

  const groups = asRecord(candidate.groups);
  const hosts = asRecord(candidate.hosts);
  const tagOwners = asRecord(candidate.tagOwners);
  const acls = isArray(candidate.acls)
    ? candidate.acls.reduce<NonNullable<ACLPolicy['acls']>>((rules, acl) => {
        const rule = asRecord(acl);
        if (!rule) {
          return rules;
        }

        const action = asString(rule.action);
        if (!action) {
          return rules;
        }

        const meta = asRecord(rule['#ha-meta']);
        rules.push({
          '#ha-meta': meta
            ? {
                name: asString(meta.name),
                open: asBoolean(meta.open, true),
              }
            : undefined,
          action,
          'proto': asString(rule.proto) || undefined,
          'src': asStringArray(rule.src),
          'dst': asStringArray(rule.dst),
        });
        return rules;
      }, [])
    : undefined;

  const grants = isArray(candidate.grants)
    ? candidate.grants.reduce<NonNullable<ACLPolicy['grants']>>((result, value) => {
        const grant = asRecord(value);
        if (!grant)
          return result;
        const ip = isString(grant.ip) ? grant.ip : isArray(grant.ip) ? asStringArray(grant.ip) : undefined;
        result.push({
          src: asStringArray(grant.src),
          dst: asStringArray(grant.dst),
          ip,
          app: asRecord(grant.app) ?? undefined,
          via: asStringArray(grant.via).length ? asStringArray(grant.via) : undefined,
        });
        return result;
      }, [])
    : undefined;

  const nodeAttrs = isArray(candidate.nodeAttrs)
    ? candidate.nodeAttrs.reduce<NonNullable<ACLPolicy['nodeAttrs']>>((result, value) => {
        const rule = asRecord(value);
        if (rule)
          result.push({ target: asStringArray(rule.target), attr: asStringArray(rule.attr) });
        return result;
      }, [])
    : undefined;

  const autoApproversRecord = asRecord(candidate.autoApprovers);
  const routesRecord = autoApproversRecord ? asRecord(autoApproversRecord.routes) : null;

  return {

    ...candidate,
    groups: groups
      ? Object.fromEntries(
          Object.entries(groups).map(([key, item]) => [key, asStringArray(item)]),
        )
      : undefined,
    hosts: hosts
      ? Object.fromEntries(
          Object.entries(hosts).map(([key, item]) => [key, asString(item)]),
        )
      : undefined,
    tagOwners: tagOwners
      ? Object.fromEntries(
          Object.entries(tagOwners).map(([key, item]) => [key, asStringArray(item)]),
        )
      : undefined,
    acls,
    grants,
    nodeAttrs,
    autoApprovers: autoApproversRecord
      ? {
          routes: routesRecord
            ? Object.fromEntries(Object.entries(routesRecord).map(([key, item]) => [key, asStringArray(item)]))
            : undefined,
          exitNode: asStringArray(autoApproversRecord.exitNode),
        }
      : undefined,
    randomizeClientPort: isBoolean(candidate.randomizeClientPort) ? candidate.randomizeClientPort : undefined,
  };
}

export function normalizePanelConnectionSettings(value: unknown): PanelConnectionSettings {
  const data = asRecord(value) ?? {};

  return {
    api_addr: asString(data.api_addr),
    insecure: asBoolean(data.insecure),
    tls_skip_verify: asBoolean(data.tls_skip_verify),
    tls_ca_cert: asString(data.tls_ca_cert),
    has_api_key: asBoolean(data.has_api_key),
    is_configured: asBoolean(data.is_configured),
    legacy_grpc_addr: asString(data.legacy_grpc_addr),
  };
}

function normalizeOIDCFormFromSource(source: Record<string, unknown>): OIDCFormValues {
  const pkce = asRecord(source.pkce);

  return {
    enabled: asBoolean(source.enabled, Boolean(asString(source.issuer) || asString(source.client_id))),
    only_start_if_oidc_is_available: asBoolean(source.only_start_if_oidc_is_available),
    issuer: asString(source.issuer),
    client_id: asString(source.client_id),
    client_secret: asString(source.client_secret),
    client_secret_path: asString(source.client_secret_path),
    scope: asStringArray(source.scope).length ? asStringArray(source.scope) : [...defaultOIDCFormValues.scope],
    email_verified_required: asBoolean(source.email_verified_required),
    allowed_domains: asStringArray(source.allowed_domains),
    allowed_users: asStringArray(source.allowed_users),
    allowed_groups: asStringArray(source.allowed_groups),
    strip_email_domain: asBoolean(source.strip_email_domain),
    expiry: asString(source.expiry) || defaultOIDCFormValues.expiry,
    use_expiry_from_token: asBoolean(source.use_expiry_from_token),
    pkce_enabled: asBoolean(pkce?.enabled ?? source.pkce_enabled, true),
    pkce_method: asString(pkce?.method ?? source.pkce_method) || defaultOIDCFormValues.pkce_method,
  };
}

export function normalizeOIDCForm(savedValue: unknown): OIDCFormValues {
  const saved = asRecord(savedValue);
  if (saved) {
    return normalizeOIDCFormFromSource(saved);
  }

  return { ...defaultOIDCFormValues };
}

export function normalizeOverview(value: unknown): { dns_record_count: number } {
  const data = asRecord(value) ?? {};
  return {
    dns_record_count: asNumber(data.dns_record_count),
  };
}

export function normalizeTopology(value: unknown): DashboardTopologyData | null {
  const data = asRecord(value);
  if (!data) {
    return null;
  }

  const users = isArray(data.users)
    ? data.users
        .map((item) => {
          const user = asRecord(item);
          if (!user) {
            return null;
          }

          const normalizedUser: DashboardTopologyUser = {
            id: asString(user.id),
            name: asString(user.name),
            deviceCount: asNumber(user.deviceCount),
          };

          return normalizedUser.id && normalizedUser.name ? normalizedUser : null;
        })
        .filter((user): user is DashboardTopologyUser => Boolean(user))
    : [];

  const devices = isArray(data.devices)
    ? data.devices
        .map((item) => {
          const device = asRecord(item);
          if (!device) {
            return null;
          }

          const normalizedDevice: DashboardTopologyDevice = {
            id: asString(device.id),
            name: asString(device.name) || 'Unknown',
            user: asString(device.user) || 'unknown',
            online: asBoolean(device.online),
            ipAddresses: asStringArray(device.ipAddresses),
            lastSeen: asString(device.lastSeen) || new Date().toISOString(),
            tags: asStringArray(device.tags),
          };

          return normalizedDevice.id ? normalizedDevice : null;
        })
        .filter((device): device is DashboardTopologyDevice => Boolean(device))
    : [];

  const acl = isArray(data.acl)
    ? data.acl
        .map((item) => {
          const rule = asRecord(item);
          if (!rule) {
            return null;
          }

          const action = asString(rule.action) === ACLAction.Deny ? ACLAction.Deny : ACLAction.Accept;
          const normalizedRule: DashboardTopologyACLRule = {
            src: asString(rule.src),
            dst: asString(rule.dst),
            action,
          };

          return normalizedRule.src && normalizedRule.dst ? normalizedRule : null;
        })
        .filter((rule): rule is DashboardTopologyACLRule => Boolean(rule))
    : [];

  const policyRecord = asRecord(data.policy);
  const policy: DashboardTopologyPolicy | undefined = policyRecord
    ? {
        groups: asRecord(policyRecord.groups)
          ? Object.fromEntries(
              Object.entries(asRecord(policyRecord.groups) ?? {}).map(([key, item]) => [
                key,
                asStringArray(item),
              ]),
            )
          : undefined,
        hosts: asRecord(policyRecord.hosts)
          ? Object.fromEntries(
              Object.entries(asRecord(policyRecord.hosts) ?? {}).map(([key, item]) => [
                key,
                asString(item),
              ]),
            )
          : undefined,
        tagOwners: asRecord(policyRecord.tagOwners)
          ? Object.fromEntries(
              Object.entries(asRecord(policyRecord.tagOwners) ?? {}).map(([key, item]) => [
                key,
                asStringArray(item),
              ]),
            )
          : undefined,
      }
    : undefined;

  return {
    users,
    devices,
    acl,
    policy,
  };
}

// ─── New-contract projections ────────────────────────────────────────────────
//
// The panel now speaks to endpoints that already return well-shaped objects, so
// these helpers only need to default optional fields. They stay defensive because
// a headscale upgrade can add or drop fields at any time.

/** Coerce a device list response into an array. */
export function normalizeDevices(value: unknown): NormalizedDevice[] {
  const raw = Array.isArray(value)
    ? value
    : (value as Record<string, unknown> | null)?.list;
  if (!Array.isArray(raw)) {
    return [];
  }
  return normalizeDeviceListResponse({ list: raw }).list;
}

/** Network identities as selectable options for ACL and onboarding pickers. */
export interface IdentityOption {
  id: string;
  name: string;
  /** The alias ACL rules resolve against: email when present, else the name. */
  policyUsername: string;
}

export function normalizeIdentityOptions(value: unknown): IdentityOption[] {
  const raw = Array.isArray(value) ? value : [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      id: String(item.hs_user_id ?? ''),
      name: asString(item.name),
      policyUsername: asString(item.policy_username) || asString(item.name),
    }))
    .filter((option) => option.id !== '');
}

/** Panel SSO form state. */
export interface SSOFormValues {
  enabled: boolean;
  issuer: string;
  clientId: string;
  /** Always empty on read: the stored secret is never returned. */
  clientSecret: string;
  hasClientSecret: boolean;
  scopes: string[];
  emailVerifiedRequired: boolean;
  provisioning: '' | 'disabled' | 'jit';
  defaultRoleId: number;
}

export function normalizeSSOForm(value: unknown): SSOFormValues {
  const data = asRecord(value) ?? {};
  const provisioning = asString(data.provisioning);

  return {
    enabled: asBoolean(data.enabled),
    issuer: asString(data.issuer),
    clientId: asString(data.client_id),
    clientSecret: '',
    hasClientSecret: asBoolean(data.has_client_secret),
    scopes: Array.isArray(data.scopes)
      ? data.scopes.map((scope) => asString(scope)).filter(Boolean)
      : ['openid', 'profile', 'email'],
    emailVerifiedRequired: asBoolean(data.email_verified_required),
    provisioning: provisioning === 'disabled' || provisioning === 'jit' ? provisioning : '',
    defaultRoleId: asNumber(data.default_role_id),
  };
}

/** Alias so page-data talks about connection settings, not "panel connection". */
export const normalizeConnectionSettings = normalizePanelConnectionSettings;
