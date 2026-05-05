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

import type { I18nContextType } from './index';
import * as React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { LOCALE_STORAGE_KEY } from '@/lib/storage-keys';
import { defaultLocale, I18nContext, locales } from './index';

function getInitialLocale(): string {
  if (typeof window === 'undefined')
    return defaultLocale;
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored && locales[stored])
    return stored;
  // Try browser language
  const browserLang = navigator.language.split('-')[0];
  if (locales[browserLang])
    return browserLang;
  return defaultLocale;
}

interface I18nProviderProps {
  children: React.ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [locale, setLocaleState] = useState(getInitialLocale);

  const setLocale = useCallback((code: string) => {
    if (!locales[code])
      return;
    setLocaleState(code);
    localStorage.setItem(LOCALE_STORAGE_KEY, code);
    document.documentElement.lang = code;
  }, []);

  const value: I18nContextType = useMemo(
    () => ({
      locale,
      setLocale,
      t: locales[locale]?.translations ?? locales[defaultLocale].translations,
    }),
    [locale, setLocale],
  );

  return React.createElement(I18nContext.Provider, { value }, children);
}
