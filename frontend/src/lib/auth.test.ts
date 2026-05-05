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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AUTH_STORAGE_KEY, getAuthToken, normalizeLoginReturnUrl, parsePersistedAuthValue } from './auth';
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
        location: {
          origin: 'https://panel.example.com',
        },
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
        }),
      ),
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
      }),
    );

    expect(getAuthToken()).toBe('persisted-token');
  });

  it('only accepts same-origin return urls inside the panel base path', () => {
    expect(normalizeLoginReturnUrl('/users')).toBe('/panel/users');
    expect(normalizeLoginReturnUrl('/panel/routes?user=alice')).toBe('/panel/routes?user=alice');
    expect(normalizeLoginReturnUrl('https://panel.example.com/panel/settings')).toBe('/panel/settings');
    expect(normalizeLoginReturnUrl('https://evil.example.com/panel/users')).toBeNull();
    expect(normalizeLoginReturnUrl('//evil.example.com')).toBeNull();
  });
});
