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

import type { User } from './store';
import { UserRole } from './enums';

export const PermissionCode = {
  DashboardView: 'dashboard:view',
  TopologyView: 'topology:view',
  TopologyACLView: 'topology:acl:view',
  NetworkIdentityList: 'network:identity:list',
  NetworkIdentityRead: 'network:identity:read',
  NetworkIdentityCreate: 'network:identity:create',
  NetworkIdentityUpdate: 'network:identity:update',
  NetworkIdentityDelete: 'network:identity:delete',
  NetworkBindingManage: 'network:binding:manage',
  NetworkDeviceList: 'network:device:list',
  NetworkDeviceRead: 'network:device:read',
  NetworkDeviceCreate: 'network:device:create',
  NetworkDeviceUpdate: 'network:device:update',
  NetworkDeviceDelete: 'network:device:delete',
  NetworkDeviceTags: 'network:device:tags',
  NetworkDeviceListSelf: 'network:device:list:self',
  NetworkDeviceCreateSelf: 'network:device:create:self',
  NetworkDeviceUpdateSelf: 'network:device:update:self',
  NetworkDeviceDeleteSelf: 'network:device:delete:self',
  NetworkRouteList: 'network:route:list',
  NetworkRouteUpdate: 'network:route:update',
  NetworkKeyList: 'network:key:list',
  NetworkKeyCreate: 'network:key:create',
  NetworkKeyCreateSelf: 'network:key:create:self',
  AccountList: 'account:list',
  AccountCreate: 'account:create',
  AccountDelete: 'account:delete',
  MetricsView: 'metrics:view',
} as const;

export const SELF_DEVICE_PERMISSIONS = [
  PermissionCode.NetworkDeviceList,
  PermissionCode.NetworkDeviceListSelf,
  PermissionCode.NetworkDeviceCreate,
  PermissionCode.NetworkDeviceCreateSelf,
] as const;

export const DASHBOARD_PERMISSIONS = [
  PermissionCode.DashboardView,
] as const;

export const METRICS_PERMISSIONS = [
  PermissionCode.MetricsView,
] as const;

export type AppSectionKey
  = | 'dashboard'
    | 'devices'
    | 'networkIdentities'
    | 'routes'
    | 'resources'
    | 'acl'
    | 'dns'
    | 'metrics'
    | 'accounts'
    | 'settings';

export type TourSectionKey = AppSectionKey | 'profile';

function getPermissionSet(user: User | null | undefined): Set<string> {
  return new Set(user?.permissions || []);
}

function isAdmin(user: User | null | undefined): boolean {
  return user?.role === UserRole.Admin;
}

/**
 * Checks one permission code.
 *
 * Holding the full form of a code implies its `:self` variant, mirroring the
 * server: a role that may manage every device may also manage its own. Without
 * this the UI hides actions the API would accept.
 */
export function hasPermission(user: User | null | undefined, permission: string): boolean {
  if (!user) {
    return false;
  }
  if (isAdmin(user)) {
    return true;
  }

  const codes = getPermissionSet(user);
  if (codes.has(permission)) {
    return true;
  }
  if (permission.endsWith(':self')) {
    return codes.has(permission.slice(0, -':self'.length));
  }
  return false;
}

export function hasAnyPermission(
  user: User | null | undefined,
  permissions: readonly string[],
): boolean {
  if (!user) {
    return false;
  }
  if (isAdmin(user)) {
    return true;
  }
  const codes = getPermissionSet(user);
  return permissions.some((permission) => codes.has(permission));
}

export function canAccessSection(user: User | null | undefined, section: AppSectionKey): boolean {
  switch (section) {
    case 'dashboard':
      return hasAnyPermission(user, DASHBOARD_PERMISSIONS);
    case 'devices':
      return !isAdmin(user) && hasAnyPermission(user, SELF_DEVICE_PERMISSIONS);
    case 'networkIdentities':
      return hasPermission(user, PermissionCode.NetworkIdentityList)
        || hasPermission(user, PermissionCode.NetworkDeviceListSelf);
    case 'routes':
      return hasPermission(user, PermissionCode.NetworkRouteList);
    case 'resources':
      return isAdmin(user);
    case 'acl':
      return isAdmin(user);
    case 'dns':
      return isAdmin(user);
    case 'metrics':
      return hasAnyPermission(user, METRICS_PERMISSIONS);
    case 'accounts':
      return hasPermission(user, PermissionCode.AccountList);
    case 'settings':
      return isAdmin(user);
    default:
      return false;
  }
}

export function canAccessTourSection(user: User | null | undefined, section: TourSectionKey): boolean {
  if (section === 'profile') {
    return Boolean(user);
  }
  return canAccessSection(user, section);
}

export function getDefaultRouteForUser(user: User | null | undefined): string {
  const orderedSections: AppSectionKey[] = [
    'dashboard',
    'devices',
    'routes',
    'metrics',
    'networkIdentities',
    'accounts',
    'resources',
    'acl',
    'dns',
    'settings',
  ];

  for (const section of orderedSections) {
    if (canAccessSection(user, section)) {
      switch (section) {
        case 'dashboard':
          return '/';
        case 'devices':
          return '/devices';
        case 'networkIdentities':
          return '/network-identities';
        case 'routes':
          return '/routes';
        case 'resources':
          return '/resources';
        case 'acl':
          return '/acl';
        case 'dns':
          return '/dns';
        case 'metrics':
          return '/metrics';
        case 'accounts':
          return '/accounts';
        case 'settings':
          return '/settings';
      }
    }
  }

  return '/unauthorized';
}
