import { useAuthStore } from '@/lib/store';
import { authAPI } from '@/lib/api';
import { useLocation } from 'wouter';
import { useEffect, useRef, ReactNode } from 'react';
import { redirectToLoginWithNotice } from '@/lib/auth';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { isAuthenticated, user, updateUser } = useAuthStore();
  const [, setLocation] = useLocation();
  const fetched = useRef(false);

  // Fetch fresh user info on mount (once per session)
  useEffect(() => {
    if (isAuthenticated && !fetched.current) {
      fetched.current = true;
      authAPI.getUserInfo().then((data: any) => {
        if (data?.user) {
          const u = data.user;
          const role = u.group?.name?.toLowerCase() === 'admin' ? 'admin' : 'user';
          updateUser({
            id: u.id,
            username: u.username,
            email: u.email,
            role,
            display_name: u.display_name,
            avatar: u.profile_pic_url,
            permissions: data.permissions,
          });
        }
      }).catch(() => {
        // Token invalid - interceptor handles 401 redirect
      });
    }
  }, [isAuthenticated, updateUser]);

  useEffect(() => {
    if (!isAuthenticated) {
      redirectToLoginWithNotice('sessionExpired');
      return;
    }

    // Wait until user profile is loaded before applying admin redirect.
    if (requireAdmin && user && user.role !== 'admin') {
      setLocation('/');
    }
  }, [isAuthenticated, user, requireAdmin, setLocation]);

  if (!isAuthenticated) {
    return null;
  }

  if (requireAdmin && !user) {
    return null;
  }

  if (requireAdmin && user?.role !== 'admin') {
    return null;
  }

  return <>{children}</>;
}
