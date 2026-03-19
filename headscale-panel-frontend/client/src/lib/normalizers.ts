import type {
  DashboardTopologyACLRule,
  DashboardTopologyData,
  DashboardTopologyPolicy,
  DashboardTopologyUser,
  DashboardTopologyDevice,
} from './dashboard';

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
  machine_key: string;
  node_key: string;
  disco_key: string;
  ip_addresses: string[];
  name: string;
  given_name: string;
  user: NormalizedDeviceUser | null;
  online: boolean;
  last_seen: string | null;
  expiry: string | null;
  created_at: string | null;
  register_method: string;
  tags: string[];
  approved_routes: string[];
  available_routes: string[];
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
  provider?: string;
}

export interface NormalizedResource {
  id: number;
  name: string;
  ip_address: string;
  port?: string;
  description?: string;
}

export interface ACLPolicy {
  groups?: Record<string, string[]>;
  hosts?: Record<string, string>;
  tagOwners?: Record<string, string[]>;
  acls?: Array<{
    '#ha-meta'?: { name: string; open: boolean };
    action: string;
    src: string[];
    dst: string[];
  }>;
}

export interface OIDCStatusData {
  oidc_enabled: boolean;
  third_party: boolean;
  builtin: boolean;
  password_required: boolean;
}

export interface PanelConnectionSettings {
  grpc_addr: string;
  insecure: boolean;
  has_api_key: boolean;
  is_connected: boolean;
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
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function extractListCandidate(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  const directKeys = ['list', 'machines', 'users', 'items', 'records'];
  for (const key of directKeys) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }

  return [];
}

function normalizeDeviceUser(value: unknown): NormalizedDeviceUser | null {
  const user = asRecord(value);
  if (!user) {
    return null;
  }

  const name =
    asString(user.name) ||
    asString(user.username) ||
    asString(user.headscale_name) ||
    asString(user.display_name);

  if (!name) {
    return null;
  }

  return {
    id: asString(user.id) || asString(user.ID) || undefined,
    name,
    display_name: asString(user.display_name),
    email: asString(user.email),
  };
}

export function normalizeDevice(raw: unknown): NormalizedDevice {
  const device = asRecord(raw) ?? {};

  return {
    id: asString(device.id) || asString(device.ID) || asString(device.machineId),
    machine_key: asString(device.machine_key),
    node_key: asString(device.node_key),
    disco_key: asString(device.disco_key),
    ip_addresses: asStringArray(device.ip_addresses ?? device.ipAddresses),
    name: asString(device.name),
    given_name: asString(device.given_name) || asString(device.givenName) || asString(device.name),
    user: normalizeDeviceUser(device.user),
    online: asBoolean(device.online),
    last_seen: asString(device.last_seen) || asString(device.lastSeen) || null,
    expiry: asString(device.expiry) || null,
    created_at: asString(device.created_at) || null,
    register_method: asString(device.register_method),
    tags: asStringArray(device.tags),
    approved_routes: asStringArray(device.approved_routes),
    available_routes: asStringArray(device.available_routes),
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
      const name =
        asString(user.name) ||
        asString(user.username) ||
        asString(user.headscale_name);

      if (!name) {
        return null;
      }

      return {
        id: asString(user.id) || asString(user.ID) || name,
        name,
      };
    })
    .filter((user): user is HeadscaleUserOption => Boolean(user));
}

export function normalizeSystemUsers(value: unknown): NormalizedSystemUser[] {
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
      headscale_name: asString(user.headscale_name) || username,
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
      provider: asString(user.provider) || undefined,
    });
  }

  return normalizedUsers;
}

export function normalizeGroups(value: unknown): NormalizedGroup[] {
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
  const candidate = nestedNestedData ?? nestedData ?? root;

  const groups = asRecord(candidate.groups);
  const hosts = asRecord(candidate.hosts);
  const tagOwners = asRecord(candidate.tagOwners);
  const acls = Array.isArray(candidate.acls)
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
          src: asStringArray(rule.src),
          dst: asStringArray(rule.dst),
        });
        return rules;
      }, [])
    : undefined;

  return {
    groups: groups
      ? Object.fromEntries(
          Object.entries(groups).map(([key, item]) => [key, asStringArray(item)])
        )
      : undefined,
    hosts: hosts
      ? Object.fromEntries(
          Object.entries(hosts).map(([key, item]) => [key, asString(item)])
        )
      : undefined,
    tagOwners: tagOwners
      ? Object.fromEntries(
          Object.entries(tagOwners).map(([key, item]) => [key, asStringArray(item)])
        )
      : undefined,
    acls,
  };
}

export function normalizeOIDCStatus(value: unknown): OIDCStatusData {
  const data = asRecord(value) ?? {};

  return {
    oidc_enabled: asBoolean(data.oidc_enabled),
    third_party: asBoolean(data.third_party),
    builtin: asBoolean(data.builtin),
    password_required: asBoolean(data.password_required, true),
  };
}

export function normalizePanelConnectionSettings(value: unknown): PanelConnectionSettings {
  const data = asRecord(value) ?? {};

  return {
    grpc_addr: asString(data.grpc_addr),
    insecure: asBoolean(data.insecure),
    has_api_key: asBoolean(data.has_api_key),
    is_connected: asBoolean(data.is_connected),
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

export function normalizeOIDCForm(
  savedValue: unknown,
  headscaleConfigValue?: unknown
): OIDCFormValues {
  const saved = asRecord(savedValue);
  if (saved) {
    return normalizeOIDCFormFromSource(saved);
  }

  const config = asRecord(headscaleConfigValue);
  const oidc = config ? asRecord(config.oidc) : null;
  if (oidc) {
    return normalizeOIDCFormFromSource(oidc);
  }

  return { ...defaultOIDCFormValues };
}

export function normalizeHeadscaleServerUrl(value: unknown): string {
  const data = asRecord(value);
  return asString(data?.server_url);
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

  const users = Array.isArray(data.users)
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

  const devices = Array.isArray(data.devices)
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
          };

          return normalizedDevice.id ? normalizedDevice : null;
        })
        .filter((device): device is DashboardTopologyDevice => Boolean(device))
    : [];

  const acl = Array.isArray(data.acl)
    ? data.acl
        .map((item) => {
          const rule = asRecord(item);
          if (!rule) {
            return null;
          }

          const action = asString(rule.action) === 'deny' ? 'deny' : 'accept';
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
              ])
            )
          : undefined,
        hosts: asRecord(policyRecord.hosts)
          ? Object.fromEntries(
              Object.entries(asRecord(policyRecord.hosts) ?? {}).map(([key, item]) => [
                key,
                asString(item),
              ])
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
