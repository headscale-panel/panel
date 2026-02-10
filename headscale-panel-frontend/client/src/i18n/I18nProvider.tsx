import React, { useState, useCallback, useMemo } from 'react';
import { I18nContext, locales, defaultLocale } from './index';
import type { I18nContextType } from './index';

const STORAGE_KEY = 'locale';

function getInitialLocale(): string {
  if (typeof window === 'undefined') return defaultLocale;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && locales[stored]) return stored;
  // Try browser language
  const browserLang = navigator.language.split('-')[0];
  if (locales[browserLang]) return browserLang;
  return defaultLocale;
}

interface I18nProviderProps {
  children: React.ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [locale, setLocaleState] = useState(getInitialLocale);

  const setLocale = useCallback((code: string) => {
    if (!locales[code]) return;
    setLocaleState(code);
    localStorage.setItem(STORAGE_KEY, code);
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
