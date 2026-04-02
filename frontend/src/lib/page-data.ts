import {
  aclAPI,
  devicesAPI,
  headscaleConfigAPI,
  panelSettingsAPI,
  resourcesAPI,
  usersAPI,
} from './api';
import { isObject } from 'radashi';
import {
  normalizeACLPolicy,
  normalizeDeviceListResponse,
  normalizeHeadscaleUsers,
  normalizeHeadscaleUserOptions,
  normalizeOIDCForm,
  normalizeOIDCStatus,
  normalizePanelConnectionSettings,
  normalizeResources,
  type OIDCFormValues,
} from './normalizers';
export async function loadUsersPageData() {
  const [usersRes, policyRes, oidcStatusRes, onlineDevicesRes] = await Promise.all([
    usersAPI.list({ all: true }),
    aclAPI.getPolicy().catch(() => null),
    panelSettingsAPI.getOIDCStatus().catch(() => null),
    devicesAPI.list({ all: true, status: 'online' }).catch(() => null),
  ]);

  const devices = normalizeDeviceListResponse(onlineDevicesRes).list;
  const onlineUsers = new Set(
    devices.filter((device) => device.online && device.user?.name).map((device) => device.user!.name)
  );

  const hsUsers = normalizeHeadscaleUsers(usersRes);

  return {
    hsUsers,
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
