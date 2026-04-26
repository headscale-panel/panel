import { useAuthStore, type AuthSnapshot, type User } from './store';
import { isString, isObject } from 'radashi';
import { AUTH_STORAGE_KEY, AUTH_NOTICE_STORAGE_KEY } from './storage-keys';

export { AUTH_STORAGE_KEY, AUTH_NOTICE_STORAGE_KEY };
export const PANEL_BASE_PATH = '/panel';
export const PANEL_LOGIN_PATH = `${PANEL_BASE_PATH}/login`;
export const OIDC_CREATE_HEADSCALE_USER_INTENT_KEY = 'oidc-create-headscale-user-intent';

export type AuthNoticeKey = 'sessionExpired';

interface PersistedAuthValue {
  state?: Partial<AuthSnapshot>;
  version?: number;
}

function isUser(value: unknown): value is User {
  return isObject(value) && 'id' in value && 'username' in value;
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
      token: isString(state.token) ? state.token : null,
      user: isUser(state.user) ? state.user : null,
      isAuthenticated: Boolean(state.isAuthenticated),
    };
  } catch {
    return null;
  }
}

function getPersistedAuthSnapshot(): Partial<AuthSnapshot> | null {
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

function setAuthNotice(notice: AuthNoticeKey) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(AUTH_NOTICE_STORAGE_KEY, notice);
}

export function consumeAuthNotice(): AuthNoticeKey | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const notice = window.sessionStorage.getItem(AUTH_NOTICE_STORAGE_KEY);
  if (!notice) {
    return null;
  }

  window.sessionStorage.removeItem(AUTH_NOTICE_STORAGE_KEY);
  return notice as AuthNoticeKey;
}

export function normalizeLoginReturnUrl(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  const value = raw.trim();
  if (!value || value.startsWith('//')) {
    return null;
  }

  if (value.startsWith('/panel/')) {
    return value;
  }

  if (value.startsWith('/')) {
    return `${PANEL_BASE_PATH}${value}`;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) {
      return null;
    }

    if (url.pathname.startsWith(PANEL_BASE_PATH + '/')) {
      return `${url.pathname}${url.search}${url.hash}`;
    }

    if (url.pathname.startsWith('/')) {
      return `${PANEL_BASE_PATH}${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return null;
  }

  return null;
}

export function setOidcCreateHeadscaleUserIntent() {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(OIDC_CREATE_HEADSCALE_USER_INTENT_KEY, '1');
}

export function hasOidcCreateHeadscaleUserIntent(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.sessionStorage.getItem(OIDC_CREATE_HEADSCALE_USER_INTENT_KEY) === '1';
}

export function clearOidcCreateHeadscaleUserIntent() {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(OIDC_CREATE_HEADSCALE_USER_INTENT_KEY);
}

export function redirectToLogin() {
  clearStoredAuthState();

  if (typeof window === 'undefined') {
    return;
  }

  if (window.location.pathname !== PANEL_LOGIN_PATH) {
    window.location.assign(PANEL_LOGIN_PATH);
  }
}

export function redirectToLoginWithNotice(notice: AuthNoticeKey = 'sessionExpired') {
  setAuthNotice(notice);
  redirectToLogin();
}
