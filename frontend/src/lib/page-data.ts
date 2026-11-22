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

import type { Account, NetworkIdentity, Resource } from '@/api/entities';
import { accountApi, aclApi, connectionApi, deviceApi, networkIdentityApi, panelSSOApi, resourceApi, roleApi } from '@/api';
import {
  normalizeACLPolicy,
  normalizeConnectionSettings,
  normalizeDevices,
  normalizeIdentityOptions,
  normalizeResources,
  normalizeSSOForm,
} from './normalizers';

/**
 * Prefetch helpers used by the route-level loaders.
 *
 * Every list endpoint returns a bare array now: the panel filters and pages in
 * memory because headscale's own list endpoints have no paging. Fetching once and
 * shaping in the browser keeps those controls responsive.
 */

export interface NetworkIdentitiesPageData {
  identities: NetworkIdentity[];
  policy: ReturnType<typeof normalizeACLPolicy>;
  onlineOwnerIds: Set<number>;
  devicesByOwner: Record<number, ReturnType<typeof normalizeDevices>>;
  accounts: Account[];
}

export async function loadNetworkIdentitiesPageData(): Promise<NetworkIdentitiesPageData> {
  const [identitiesRes, policyRes, devicesRes, accountsRes] = await Promise.all([
    networkIdentityApi.list(),
    aclApi.getPolicy().catch(() => null),
    deviceApi.list().catch(() => null),
    accountApi.list().catch(() => null),
  ]);

  const identities = identitiesRes ?? [];
  const devices = normalizeDevices(devicesRes);

  const onlineOwnerIds = new Set<number>();
  const devicesByOwner: Record<number, typeof devices> = {};
  for (const device of devices) {
    if (device.online) {
      onlineOwnerIds.add(device.owner_hs_user_id);
    }
    if (!devicesByOwner[device.owner_hs_user_id]) {
      devicesByOwner[device.owner_hs_user_id] = [];
    }
    devicesByOwner[device.owner_hs_user_id].push(device);
  }

  return {
    identities,
    policy: normalizeACLPolicy(policyRes),
    onlineOwnerIds,
    devicesByOwner,
    accounts: accountsRes ?? [],
  };
}

export interface AccountsPageData {
  accounts: Account[];
  roles: Awaited<ReturnType<typeof roleApi.list>> | [];
  identities: NetworkIdentity[];
}

export async function loadAccountsPageData(): Promise<AccountsPageData> {
  const [accountsRes, rolesRes, identitiesRes] = await Promise.all([
    accountApi.list(),
    roleApi.list().catch(() => []),
    networkIdentityApi.list().catch(() => []),
  ]);

  return {
    accounts: accountsRes ?? [],
    roles: rolesRes ?? [],
    identities: identitiesRes ?? [],
  };
}

export interface ACLPageData {
  policy: ReturnType<typeof normalizeACLPolicy>;
  /* Optimistic-lock token for the policy as it was read. */
  policyUpdatedAt: string;
  devices: ReturnType<typeof normalizeDevices>;
  resources: Resource[];
  identities: ReturnType<typeof normalizeIdentityOptions>;
}

export async function loadACLPageData(): Promise<ACLPageData> {
  const [policyRes, devicesRes, resourcesRes, identitiesRes] = await Promise.all([
    aclApi.getPolicy().catch(() => null),
    deviceApi.list().catch(() => null),
    resourceApi.list().catch(() => null),
    networkIdentityApi.list().catch(() => null),
  ]);

  return {
    policy: normalizeACLPolicy(policyRes),
    policyUpdatedAt: policyRes?.updatedAt ?? '',
    devices: normalizeDevices(devicesRes),
    resources: normalizeResources(resourcesRes),
    identities: normalizeIdentityOptions(identitiesRes),
  };
}

export async function loadConnectionSettingsData() {
  const value = await connectionApi.get();
  return normalizeConnectionSettings(value);
}

export async function loadSSOSettingsData() {
  const saved = await panelSSOApi.get().catch(() => null);
  return { ssoForm: normalizeSSOForm(saved) };
}
