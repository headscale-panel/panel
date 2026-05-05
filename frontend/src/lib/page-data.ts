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
  normalizeHeadscaleUserOptions,
  normalizeHeadscaleUsers,
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
    devices.filter((device) => device.online && device.user?.name).map((device) => device.user!.name),
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
