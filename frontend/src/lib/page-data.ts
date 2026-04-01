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
import { isObject } from 'radashi';
import {
  normalizeACLPolicy,
  normalizeDeviceListResponse,
  normalizeGroups,
  normalizeHeadscaleUserOptions,
  normalizeOIDCForm,
  normalizeOIDCStatus,
  normalizePanelConnectionSettings,
  normalizeResources,
  normalizeSystemUsers,
  type OIDCFormValues,
} from './normalizers';
import { UserProvider } from './enums';

export async function loadUsersPageData() {
  const [usersRes, groupsRes, policyRes, oidcStatusRes, onlineDevicesRes] = await Promise.all([
    systemUsersAPI.list({ all: true }),
    groupsAPI.list({ all: true }),
    aclAPI.getPolicy().catch(() => null),
    panelSettingsAPI.getOIDCStatus().catch(() => null),
    devicesAPI.list({ all: true, status: 'online' }).catch(() => null),
  ]);

  const devices = normalizeDeviceListResponse(onlineDevicesRes).list;
  const onlineUsers = new Set(
    devices.filter((device) => device.online && device.user?.name).map((device) => device.user!.name)
  );

  const users = normalizeSystemUsers(usersRes);

  return {
    users,
    hsUsers: users.filter((u) => u.provider === UserProvider.Headscale),
    groups: normalizeGroups(groupsRes),
    aclPolicy: normalizeACLPolicy(policyRes),
    oidcStatus: normalizeOIDCStatus(oidcStatusRes),
    onlineUsers,
  };
}

export async function loadACLPageData() {
  const [policyRes, devicesRes, resourcesRes, usersRes] = await Promise.all([
    aclAPI.getPolicy().catch(() => null),
    devicesAPI.list({ all: true }).catch(() => null),
    resourcesAPI.list({ all: true }).catch(() => null),
    usersAPI.list({ all: true }).catch(() => null),
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
      isObject(headscaleConfig)
        ? (headscaleConfig as unknown as Record<string, unknown>)
        : null,
  };
}
