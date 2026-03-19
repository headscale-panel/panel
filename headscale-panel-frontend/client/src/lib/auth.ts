import { useAuthStore, type AuthSnapshot, type User } from './store';

export const AUTH_STORAGE_KEY = 'auth-storage';

interface PersistedAuthValue {
  state?: Partial<AuthSnapshot>;
  version?: number;
}

function isUser(value: unknown): value is User {
  return typeof value === 'object' && value !== null && 'id' in value && 'username' in value;
}

export function parsePersistedAuthValue(raw: string | null): Partial<AuthSnapshot> | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PersistedAuthValue;
    const state = parsed?.state;
    if (!state || typeof state !== 'object') {
      return null;
    }

    return {
      token: typeof state.token === 'string' ? state.token : null,
      user: isUser(state.user) ? state.user : null,
      isAuthenticated: Boolean(state.isAuthenticated),
    };
  } catch {
    return null;
  }
}

export function getPersistedAuthSnapshot(): Partial<AuthSnapshot> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return parsePersistedAuthValue(window.localStorage.getItem(AUTH_STORAGE_KEY));
}

export function getAuthToken(): string | null {
  return useAuthStore.getState().token ?? getPersistedAuthSnapshot()?.token ?? null;
}

export function clearStoredAuthState() {
  useAuthStore.getState().clearAuth();

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}
