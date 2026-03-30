import {
  aclAPI,
  devicesAPI,
  groupsAPI,
  headscaleConfigAPI,
  panelSettingsAPI,
  resourcesAPI,
  systemUsersAPI,
  usersAPI,
} from './api';
import type { ACLPolicy } from './normalizers';
import {
  normalizeACLPolicy,
  normalizeDeviceListResponse,
  normalizeGroups,
  normalizeHeadscaleServerUrl,
  normalizeHeadscaleUserOptions,
  normalizeOIDCForm,
  normalizeOIDCStatus,
  normalizePanelConnectionSettings,
  normalizeResources,
  normalizeSystemUsers,
  type OIDCFormValues,
} from './normalizers';

export async function loadDevicesPageData() {
  const [devicesRes, usersRes, configRes] = await Promise.all([
    devicesAPI.list(),
    usersAPI.list({ pageSize: 100 }).catch(() => null),
    headscaleConfigAPI.get().catch(() => null),
  ]);

  const { list } = normalizeDeviceListResponse(devicesRes);

  return {
    devices: list,
    headscaleUsers: normalizeHeadscaleUserOptions(usersRes),
    serverUrl: normalizeHeadscaleServerUrl(configRes),
  };
}

export async function loadUsersPageData() {
  const [usersRes, groupsRes, policyRes, oidcStatusRes, devicesRes] = await Promise.all([
    systemUsersAPI.list({ pageSize: 1000 }),
    groupsAPI.list({ pageSize: 100 }),
    aclAPI.getPolicy().catch(() => null),
    panelSettingsAPI.getOIDCStatus().catch(() => null),
    devicesAPI.list({ pageSize: 1000 }).catch(() => null),
  ]);

  const devices = normalizeDeviceListResponse(devicesRes).list;
  const onlineUsers = new Set(
    devices.filter((device) => device.online && device.user?.name).map((device) => device.user!.name)
  );

  return {
    users: normalizeSystemUsers(usersRes),
    groups: normalizeGroups(groupsRes),
    aclPolicy: normalizeACLPolicy(policyRes),
    oidcStatus: normalizeOIDCStatus(oidcStatusRes),
    onlineUsers,
  };
}

export async function loadACLPageData() {
  const [policyRes, devicesRes, resourcesRes, usersRes] = await Promise.all([
    aclAPI.getPolicy().catch(() => null),
    devicesAPI.list({ page: 1, pageSize: 1000 }).catch(() => null),
    resourcesAPI.list({ page: 1, pageSize: 1000 }).catch(() => null),
    usersAPI.list({ page: 1, pageSize: 1000 }).catch(() => null),
  ]);

  return {
    policy: normalizeACLPolicy(policyRes),
    devices: normalizeDeviceListResponse(devicesRes).list,
    resources: normalizeResources(resourcesRes),
    headscaleUsers: normalizeHeadscaleUserOptions(usersRes),
  };
}

export async function loadConnectionSettingsData() {
  const value = await panelSettingsAPI.getConnection();
  return normalizePanelConnectionSettings(value);
}

export async function loadOIDCSettingsData(): Promise<{
  oidcForm: OIDCFormValues;
  fullConfig: Record<string, unknown> | null;
}> {
  const saved = await panelSettingsAPI.getOIDCSettings().catch(() => null);
  const headscaleConfig = saved ? null : await headscaleConfigAPI.get().catch(() => null);

  return {
    oidcForm: normalizeOIDCForm(saved, headscaleConfig),
    fullConfig:
      typeof headscaleConfig === 'object' && headscaleConfig !== null
        ? (headscaleConfig as unknown as Record<string, unknown>)
        : null,
  };
}

export function extractAclGroups(policy: ACLPolicy | null): Record<string, string[]> {
  return policy?.groups || {};
}
