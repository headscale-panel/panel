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
