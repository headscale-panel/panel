import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  display_name?: string;
  avatar?: string;
  permissions?: string[];
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
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

interface TopologyData {
  nodes: any[];
  edges: any[];
}

interface AppState {
  sidebarCollapsed: boolean;
  topologyData: TopologyData | null;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTopologyData: (data: TopologyData) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  topologyData: null,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setTopologyData: (data) => set({ topologyData: data }),
}));
