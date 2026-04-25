import {
  aclAPI,
  devicesAPI,
  panelSettingsAPI,
  resourcesAPI,
  usersAPI,
} from './api';
import {
  normalizeACLPolicy,
  normalizeDeviceListResponse,
  normalizeHeadscaleUsers,
  normalizeHeadscaleUserOptions,
  normalizeOIDCForm,
  normalizePanelConnectionSettings,
  normalizeResources,
} from './normalizers';
export async function loadUsersPageData() {
  const [usersRes, policyRes, onlineDevicesRes] = await Promise.all([
    usersAPI.list({ all: true }),
    aclAPI.getPolicy().catch(() => null),
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
  oidcForm: ReturnType<typeof normalizeOIDCForm>;
}> {
  const saved = await panelSettingsAPI.getOIDCSettings().catch(() => null);

  return {
    oidcForm: normalizeOIDCForm(saved),
  };
}
