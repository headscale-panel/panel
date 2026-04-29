import { describe, expect, it } from 'vitest';
import { UserRole } from './enums';
import {
  canAccessSection,
  DASHBOARD_PERMISSIONS,
  getDefaultRouteForUser,
  hasAnyPermission,
  hasPermission,
  METRICS_PERMISSIONS,
  SELF_DEVICE_PERMISSIONS,
} from './permissions';

describe('permissions helpers', () => {
  it('treats admins as globally authorized', () => {
    const admin = {
      id: 1,
      username: 'admin',
      email: 'admin@example.com',
      role: UserRole.Admin,
      permissions: [],
    };

    expect(hasPermission(admin, 'metrics:device_status:view')).toBe(true);
    expect(canAccessSection(admin, 'users')).toBe(true);
    expect(canAccessSection(admin, 'settings')).toBe(true);
  });

  it('grants self-service devices and metrics based on explicit permissions', () => {
    const user = {
      id: 2,
      username: 'alice',
      email: 'alice@example.com',
      role: UserRole.User,
      permissions: [
        SELF_DEVICE_PERMISSIONS[0],
        METRICS_PERMISSIONS[1],
      ],
    };

    expect(hasAnyPermission(user, SELF_DEVICE_PERMISSIONS)).toBe(true);
    expect(canAccessSection(user, 'devices')).toBe(true);
    expect(canAccessSection(user, 'metrics')).toBe(true);
    expect(canAccessSection(user, 'users')).toBe(false);
  });

  it('selects the first accessible landing page', () => {
    const user = {
      id: 3,
      username: 'bob',
      email: 'bob@example.com',
      role: UserRole.User,
      permissions: ['headscale:route:list'],
    };

    expect(getDefaultRouteForUser(user)).toBe('/routes');
    expect(canAccessSection(user, 'dashboard')).toBe(false);
    expect(hasAnyPermission(user, DASHBOARD_PERMISSIONS)).toBe(false);
  });
});
