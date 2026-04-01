import { useAuthStore } from '@/lib/store';
import { authAPI } from '@/lib/api';
import { useLocation } from 'wouter';
import { useEffect, useRef, ReactNode } from 'react';
import { redirectToLogin } from '@/lib/auth';
import { getDefaultRouteForUser, hasAnyPermission } from '@/lib/permissions';
import { UserRole } from '@/lib/enums';
import { isArray } from 'radashi';

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
  const pendingProfile =
    isAuthenticated &&
    (!user || !isArray(user.permissions) || !user.headscale_name);

  // Fetch fresh user info only when auth state lacks a persisted user profile.
  useEffect(() => {
    if (pendingProfile && !fetched.current) {
      fetched.current = true;
      authAPI.getUserInfo().then((data: any) => {
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

  if (pendingProfile || (requireAdmin || requiredPermissions?.length) && !user) {
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
