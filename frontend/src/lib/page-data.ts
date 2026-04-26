import {
  aclApi,
  deviceApi,
  headscaleUserApi,
  panelSettingsApi,
  resourceApi,
} from '@/api';
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
    headscaleUserApi.list({ all: true }),
    aclApi.getPolicy().catch(() => null),
    deviceApi.list({ all: true, status: 'online' }).catch(() => null),
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
    aclApi.getPolicy().catch(() => null),
    deviceApi.list({ all: true }).catch(() => null),
    resourceApi.list({ all: true }).catch(() => null),
    headscaleUserApi.list({ all: true }).catch(() => null),
  ]);

  return {
    policy: normalizeACLPolicy(policyRes),
    devices: normalizeDeviceListResponse(devicesRes).list,
    resources: normalizeResources(resourcesRes),
    headscaleUsers: normalizeHeadscaleUserOptions(usersRes),
  };
}

export async function loadConnectionSettingsData() {
  const value = await panelSettingsApi.getConnection();
  return normalizePanelConnectionSettings(value);
}

export async function loadOIDCSettingsData(): Promise<{
  oidcForm: ReturnType<typeof normalizeOIDCForm>;
}> {
  const saved = await panelSettingsApi.getOIDCSettings().catch(() => null);

  return {
    oidcForm: normalizeOIDCForm(saved),
  };
}
