import { defineConfig, presetWind } from 'unocss';

export default defineConfig({
  presets: [presetWind()],
  shortcuts: {
    // ── Page structure ─────────────────────────────────────────────────────────
    'app-page-stack': 'flex flex-col gap-6',
    'app-page-stack-tight': 'flex flex-col gap-5',
    'page-header-row': 'flex justify-between items-center flex-wrap gap-3',
    'page-title': 'm-0!',
    'page-desc': 'block text-secondary',
    'page-title-with-icon': 'm-0! flex items-center gap-2',
    'header-actions-wrap': 'flex flex-wrap gap-2',

    // ── Auth / setup pages ──────────────────────────────────────────────────────
    'auth-page': 'min-h-screen flex items-center justify-center',
    'auth-card': 'w-full max-w-95',
    'auth-header': 'text-center mb-6',
    'lang-switcher': 'fixed top-4 right-4',

    // ── Loading states ──────────────────────────────────────────────────────────
    'centered-loading': 'flex justify-center items-center p-20',
    'spin-page': 'flex justify-center items-center p-20',

    // ── Table / filter bar ──────────────────────────────────────────────────────
    'table-filter-row': 'flex flex-wrap gap-3 mb-4',
    'table-search-input': 'flex-1 min-w-50 max-w-90',
    'select-fixed-sm': 'w-32',
    'filter-input': 'max-w-90',

    // ── Cards & containers ──────────────────────────────────────────────────────
    'full-width': 'w-full',
    'card-stack': 'w-full flex flex-col gap-4',
    'empty-state-box': 'text-center p-12',
    'scroll-area': 'max-h-64 overflow-auto',
    'card-header': 'flex justify-between items-center mb-4',
    'info-row': 'flex justify-between items-center',

    // ── Modal / drawer ──────────────────────────────────────────────────────────
    'modal-desc': 'block mb-4',

    // ── Forms ────────────────────────────────────────────────────────────────────
    'form-stack': 'w-full mt-4 flex flex-col gap-4',
    'form-grid-row': 'grid grid-cols-[100px_1fr] gap-3 items-center',
    'form-label': 'text-13px block mb-1',
    'form-hint': 'text-12px',
    'form-setting-row': 'flex items-center justify-between py-1',
    'field-block': 'w-full',
    'field-label': 'block mb-1 text-sm',
    'field-hint-error': 'text-12px text-red-500',
    'field-grid-2': 'grid grid-cols-1 md:grid-cols-2 gap-4',
    'actions-split': 'w-full flex gap-2',
    'action-grow': 'flex-1',

    // ── Section typography ───────────────────────────────────────────────────────
    'section-title': 'text-15px font-500',
    'section-title-block': 'text-15px font-500 block mb-4',

    // ── List / tree rows ─────────────────────────────────────────────────────────
    'item-row': 'flex items-center gap-2',
    'item-row-between': 'flex items-center justify-between',
    'truncate-flex': 'flex-1 min-w-0 truncate',
    'icon-badge': 'flex items-center justify-center flex-shrink-0',

    // ── Stat cards ────────────────────────────────────────────────────────────────
    'stat-card': 'p-1 relative overflow-hidden',
    'stat-watermark': 'absolute right-2 bottom--1 text-48px font-900 opacity-4 tracking--2 leading-none pointer-events-none select-none',
    'stat-content': 'relative flex justify-between items-center',
    'stat-label': 'text-13px',
    'stat-value': 'text-24px font-700 mt-1',
    'stat-subtext': 'text-12px',
    'stat-icon-primary': 'text-28px text-#1677ff',
    'stat-icon-success': 'text-28px text-#52c41a',
    'stat-icon-accent': 'text-28px text-#722ed1',
    'stat-icon-warn': 'text-28px text-#fa8c16',
    'stat-icon-cyan': 'text-28px text-#13c2c2',
    'stat-icon-muted': 'text-28px text-#8c8c8c',

    // ── Metrics ───────────────────────────────────────────────────────────────────
    'metric-chart-grid': 'grid gap-4 grid-cols-[repeat(auto-fill,minmax(400px,1fr))]',
    'chart-box': 'h-300px w-full',

    // ── Grid layouts ──────────────────────────────────────────────────────────────
    'grid-2col': 'grid grid-cols-2 gap-4',

    // ── Monospace ─────────────────────────────────────────────────────────────────
    'mono-text': 'font-mono',
    'mono-cell': 'font-mono text-13px',
  },
});
