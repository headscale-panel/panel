import { theme as antdTheme, ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import * as React from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ThemeMode } from '@/lib/enums';
import { THEME_STORAGE_KEY } from '@/lib/storage-keys';

const SYSTEM_SANS_FONT_FAMILY = '\'PingFang SC\', \'Hiragino Sans GB\', \'Microsoft YaHei\', \'Noto Sans CJK SC\', \'Source Han Sans SC\', \'WenQuanYi Micro Hei\', -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif';

type ResolvedTheme = ThemeMode.Light | ThemeMode.Dark;

interface ThemeContextType {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultMode?: ThemeMode;
  locale?: string;
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined')
    return ThemeMode.Light;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? ThemeMode.Dark : ThemeMode.Light;
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === ThemeMode.System)
    return getSystemTheme();
  return mode;
}

export function ThemeProvider({ children, defaultMode = ThemeMode.System, locale = 'zh' }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
    if (stored && Object.values(ThemeMode).includes(stored)) {
      return stored;
    }
    return defaultMode;
  });

  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());
  const resolvedTheme: ResolvedTheme = mode === ThemeMode.System ? systemTheme : mode;

  const applyTheme = useCallback((theme: ResolvedTheme) => {
    const root = document.documentElement;
    if (theme === ThemeMode.Dark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem(THEME_STORAGE_KEY, newMode);
    if (newMode === ThemeMode.System) {
      setSystemTheme(getSystemTheme());
    }
    applyTheme(resolveTheme(newMode));
  }, [applyTheme]);

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme, applyTheme]);

  useEffect(() => {
    if (mode !== ThemeMode.System)
      return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? ThemeMode.Dark : ThemeMode.Light);
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [mode]);

  const isDark = resolvedTheme === ThemeMode.Dark;
  const antdLocale = locale === 'zh' ? zhCN : enUS;

  return (
    <ThemeContext.Provider value={{ mode, resolvedTheme, setMode }}>
      <ConfigProvider
        locale={antdLocale}
        theme={{
          algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: '#1677ff',
            borderRadius: 8,
            fontFamily: SYSTEM_SANS_FONT_FAMILY,
          },
          components: {
            Layout: {
              siderBg: 'transparent',
              headerBg: 'transparent',
            },
            Menu: {
              itemBg: 'transparent',
              subMenuItemBg: 'transparent',
            },
          },
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
