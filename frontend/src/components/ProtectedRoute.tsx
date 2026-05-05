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

import type { ReactNode } from 'react';
import { isArray } from 'radashi';
import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { authApi } from '@/api';
import { redirectToLogin } from '@/lib/auth';
import { UserRole } from '@/lib/enums';
import { getDefaultRouteForUser, hasAnyPermission } from '@/lib/permissions';
import { useAuthStore } from '@/lib/store';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requiredPermissions?: string[];
}

export default function ProtectedRoute({
  children,
  requireAdmin = false,
  requiredPermissions,
}: ProtectedRouteProps) {
  const { isAuthenticated, user, updateUser } = useAuthStore();
  const [, setLocation] = useLocation();
  const fetched = useRef(false);
  const pendingProfile
    = isAuthenticated
      && (!user || !isArray(user.permissions) || !user.headscale_name || typeof user.guide_tour_seen_at === 'undefined');

  // Fetch fresh user info only when auth state lacks a persisted user profile.
  useEffect(() => {
    if (pendingProfile && !fetched.current) {
      fetched.current = true;
      authApi.getUserInfo().then((data: any) => {
        if (data?.user) {
          const u = data.user;
          const role = u.group?.name?.toLowerCase() === UserRole.Admin ? UserRole.Admin : UserRole.User;
          updateUser({
            id: u.id,
            username: u.username,
            email: u.email,
            role,
            headscale_name: u.headscale_name || u.username,
            display_name: u.display_name,
            avatar: u.profile_pic_url,
            permissions: data.permissions,
            totp_enabled: u.totp_enabled,
            guide_tour_seen_at: u.guide_tour_seen_at ?? null,
          });
        }
      }).catch(() => {
        // Token invalid - interceptor handles 401 redirect
      });
    }
  }, [pendingProfile, updateUser]);

  useEffect(() => {
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }

    if (pendingProfile) {
      return;
    }

    // Wait until user profile is loaded before applying admin redirect.
    if (requireAdmin && user && user.role !== UserRole.Admin) {
      setLocation(getDefaultRouteForUser(user));
      return;
    }

    if (requiredPermissions?.length && user && !hasAnyPermission(user, requiredPermissions)) {
      setLocation(getDefaultRouteForUser(user));
    }
  }, [isAuthenticated, pendingProfile, user, requireAdmin, requiredPermissions, setLocation]);

  if (!isAuthenticated) {
    return null;
  }

  if (pendingProfile || ((requireAdmin || requiredPermissions?.length) && !user)) {
    return null;
  }

  if (requireAdmin && user?.role !== UserRole.Admin) {
    return null;
  }

  if (requiredPermissions?.length && !hasAnyPermission(user, requiredPermissions)) {
    return null;
  }

  return <>{children}</>;
}
