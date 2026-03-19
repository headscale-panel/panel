import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AUTH_STORAGE_KEY, getAuthToken, parsePersistedAuthValue } from './auth';
import { useAuthStore } from './store';

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  removeItem(key: string) {
    this.store.delete(key);
  }
}

describe('auth helpers', () => {
  const storage = new MemoryStorage();

  beforeEach(() => {
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
    });

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: storage,
      },
    });
  });

  afterEach(() => {
    storage.removeItem(AUTH_STORAGE_KEY);
  });

  it('parses the persisted zustand auth payload', () => {
    expect(
      parsePersistedAuthValue(
        JSON.stringify({
          state: {
            token: 'persisted-token',
            isAuthenticated: true,
          },
        })
      )
    ).toEqual({
      token: 'persisted-token',
      user: null,
      isAuthenticated: true,
    });
  });

  it('falls back to persisted auth storage when the in-memory store is empty', () => {
    storage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        state: {
          token: 'persisted-token',
          isAuthenticated: true,
        },
      })
    );

    expect(getAuthToken()).toBe('persisted-token');
  });
});
