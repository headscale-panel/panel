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
  const [usersRes, policyRes, onlineDevicesRes, allDevicesRes] = await Promise.all([
    headscaleUserApi.list({ all: true }),
    aclApi.getPolicy().catch(() => null),
    deviceApi.list({ all: true, status: 'online' }).catch(() => null),
    deviceApi.list({ all: true }).catch(() => null),
  ]);

  const devices = normalizeDeviceListResponse(onlineDevicesRes).list;
  const allDevices = normalizeDeviceListResponse(allDevicesRes).list;
  const onlineUsers = new Set(
    devices.filter((device) => device.online && device.user?.name).map((device) => device.user!.name)
  );
  const userDevicesByOwner = allDevices.reduce<Record<string, typeof allDevices>>((record, device) => {
    const ownerKey = device.user?.name?.trim().toLowerCase();
    if (!ownerKey) {
      return record;
    }
    if (!record[ownerKey]) {
      record[ownerKey] = [];
    }
    record[ownerKey].push(device);
    return record;
  }, {});

  const hsUsers = normalizeHeadscaleUsers(usersRes);

  return {
    hsUsers,
    aclPolicy: normalizeACLPolicy(policyRes),
    onlineUsers,
    userDevicesByOwner,
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
