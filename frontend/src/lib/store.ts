import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserRole } from './enums';

export interface User {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  headscale_name?: string;
  display_name?: string;
  avatar?: string;
  permissions?: string[];
}

export interface AuthSnapshot {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
}

interface AuthState extends AuthSnapshot {
  setAuth: (token: string, user: User) => void;
  updateUser: (user: User) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      setAuth: (token, user) => {
        set({ token, user, isAuthenticated: true });
      },
      updateUser: (user) => {
        set({ user });
      },
      clearAuth: () => {
        set({ token: null, user: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);

interface UIState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    }
  )
);
