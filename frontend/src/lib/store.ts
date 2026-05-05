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

import type { UserRole } from './enums';
import type { SystemStatus } from '@/api/status.types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  headscale_name?: string;
  display_name?: string;
  avatar?: string;
  permissions?: string[];
  totp_enabled?: boolean;
  guide_tour_seen_at?: string | null;
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
    },
  ),
);

interface UIState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  guideTourOpen: boolean;
  setGuideTourOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      guideTourOpen: false,
      setGuideTourOpen: (open) => set({ guideTourOpen: open }),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);

// ─── System Status ────────────────────────────────────────────────────────────

interface SystemStatusState {
  status: SystemStatus | null;
  loading: boolean;
  lastFetchedAt: number | null;
  setStatus: (status: SystemStatus) => void;
  setLoading: (loading: boolean) => void;
}

export const useSystemStatusStore = create<SystemStatusState>()((set) => ({
  status: null,
  loading: false,
  lastFetchedAt: null,
  setStatus: (status) => set({ status, lastFetchedAt: Date.now() }),
  setLoading: (loading) => set({ loading }),
}));
