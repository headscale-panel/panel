import type { User } from './store';
import { UserRole } from './enums';

export const SELF_DEVICE_PERMISSIONS = [
  'headscale:machine:list',
  'headscale:machine:create',
  'headscale:machine:update',
  'headscale:machine:delete',
  'headscale:preauthkey:create',
] as const;

export const DASHBOARD_PERMISSIONS = [
  'dashboard:view',
  'topology:with_acl:view',
  'headscale:machine:list',
  'headscale:user:list',
] as const;

export const METRICS_PERMISSIONS = [
  'metrics:online_duration:view',
  'metrics:online_duration_stats:view',
  'metrics:device_status:view',
  'metrics:device_status_history:view',
  'metrics:traffic:view',
  'metrics:influxdb:view',
] as const;

export type AppSectionKey
  = | 'dashboard'
    | 'devices'
    | 'users'
    | 'routes'
    | 'resources'
    | 'acl'
    | 'dns'
    | 'metrics'
    | 'panelAccounts'
    | 'settings';

export type TourSectionKey = AppSectionKey | 'profile';

function getPermissionSet(user: User | null | undefined): Set<string> {
  return new Set(user?.permissions || []);
}

function isAdmin(user: User | null | undefined): boolean {
  return user?.role === UserRole.Admin;
}

export function hasPermission(user: User | null | undefined, permission: string): boolean {
  if (!user) {
    return false;
  }
  if (isAdmin(user)) {
    return true;
  }
  return getPermissionSet(user).has(permission);
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
    case 'users':
      return isAdmin(user);
    case 'routes':
      return hasPermission(user, 'headscale:route:list');
    case 'resources':
      return isAdmin(user);
    case 'acl':
      return isAdmin(user);
    case 'dns':
      return isAdmin(user);
    case 'metrics':
      return hasAnyPermission(user, METRICS_PERMISSIONS);
    case 'panelAccounts':
      return isAdmin(user);
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
    'users',
    'panelAccounts',
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
        case 'users':
          return '/users';
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
        case 'panelAccounts':
          return '/panel-accounts';
        case 'settings':
          return '/settings';
      }
    }
  }

  return '/';
}
