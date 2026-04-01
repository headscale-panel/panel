/**
 * Lightweight i18n module — zero dependencies.
 *
 * How to add a new language:
 *   1. Create a file under `./locales/`, e.g. `ja.ts`
 *   2. Export a default object that satisfies the `Translations` type
 *   3. Register it in the `locales` map below
 *
 * That's it — the language will appear in the language switcher automatically.
 */

import { createContext, useContext } from 'react';
import zh from './locales/zh';
import en from './locales/en';
import { LOCALE_STORAGE_KEY } from '@/lib/storage-keys';

// ── Types ──────────────────────────────────────────────

/** The full translation tree type is inferred from the Chinese (source) locale. */
export type Translations = typeof zh;

/** Locale metadata shown in the switcher */
export interface LocaleMeta {
  /** Native name, e.g. "中文" */
  label: string;
  /** The full translation object */
  translations: Translations;
}

// ── Registry ───────────────────────────────────────────
// Add new languages here. The key is the BCP-47 code.

export const locales: Record<string, LocaleMeta> = {
  zh: { label: '中文', translations: zh },
  en: { label: 'English', translations: en },
};

export const defaultLocale = 'zh';

/** All available locale codes */
export const availableLocales = Object.keys(locales);

// ── Context ────────────────────────────────────────────

export interface I18nContextType {
  locale: string;
  setLocale: (locale: string) => void;
  t: Translations;
}

export const I18nContext = createContext<I18nContextType | undefined>(undefined);

/** Hook to access translations and locale switcher */
export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/** Shortcut — returns just the translation object */
export function useTranslation(): Translations {
  return useI18n().t;
}

/**
 * Get translations outside of React components (e.g. in API interceptors).
 * Reads the current locale from localStorage.
 */
export function getTranslations(): Translations {
  const stored = typeof window !== 'undefined' ? localStorage.getItem(LOCALE_STORAGE_KEY) : null;
  const code = stored && locales[stored] ? stored : defaultLocale;
  return locales[code].translations;
}
