/*
 * Copyright (C) 2026
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

/*
 * Sets the initial theme before the application bundle runs.
 *
 * It lives in a file rather than inline in index.html because the panel serves the
 * SPA with `script-src 'self'`, which blocks inline scripts. A file needs no CSP
 * exception and no hash that has to be recomputed on every edit.
 *
 * The storage key and the three-state resolution must match
 * src/contexts/ThemeContext.tsx. src/lib/theme-tokens.test.ts fails if they drift.
 */
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored === 'dark' || ((!stored || stored === 'system') && prefersDark);
    var root = document.documentElement;
    if (dark)
      root.classList.add('dark');
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.style.colorScheme = dark ? 'dark' : 'light';
  }
  catch (e) {
    // Storage can be blocked (private mode, policy). The app applies the theme once
    // it mounts, so the only cost is a possible flash.
  }
})();
