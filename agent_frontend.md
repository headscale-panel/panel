# Frontend Agent Guide

适用目录：`/Users/xinyun/Project/headscale-panel-complete-final/headscale-panel-frontend`

## 1. 技术栈与运行方式
- React 19 + TypeScript + Vite
- 路由：`wouter`
- 状态管理：`zustand`（`persist`）
- UI：Tailwind CSS v4 + Radix UI 组件 + 自定义主题变量
- 启动命令：`pnpm dev`
- 构建命令：`pnpm build`
- 类型检查：`pnpm check`

## 2. 路由与部署基路径（最重要）
- Vite `base`：`/panel/`
- Wouter `base`：`/panel`
- 后端静态托管也在 `/panel`（与后端 `FrontendMiddleware` 对齐）
- 站内跳转使用相对应用路由（如 `/login`、`/users`），不要写成完整 `/panel/...`（除非 `window.location.href` 这种硬跳转场景）

## 3. 目录职责
- `client/src/App.tsx`：全局 Provider、路由表、SetupGuard
- `client/src/pages/`：页面级业务
- `client/src/components/`：通用布局与业务组件
- `client/src/components/ui/`：UI 基础组件（Radix 封装）
- `client/src/lib/api.ts`：Axios 实例 + 全部 API 封装 + wsManager
- `client/src/lib/store.ts`：`useAuthStore`、`useAppStore`
- `client/src/i18n/`：多语言（zh/en）
- `client/src/contexts/ThemeContext.tsx`：明暗主题与 system 跟随

## 4. API 调用约定（必须遵守）
- `api.ts` 响应拦截器会把后端 envelope 解包：
  - 后端返回 `{code,msg,data}` -> 前端拿到的是 `data`
- 所以页面代码通常直接把 `await xxxAPI.list()` 当业务数据用，不是 AxiosResponse。
- 登录过期（401）会清理本地鉴权并跳转 `/panel/login`。

## 5. 鉴权与权限前端规则
- `useAuthStore` 持久化键：`auth-storage`
- `ProtectedRoute`：
  - 未登录跳 `/login`
  - `requireAdmin` 依赖 `user.role === "admin"`
- 页面是否可见由 Sidebar 与路由共同控制（前端仅做体验层限制，最终权限以后端为准）

## 6. Setup 首次初始化流程
- `SetupGuard` 先调 `/setup/status`，未初始化强制进 `/setup`
- `SetupWelcome.tsx` 负责连接检测与初始化
- 初始化请求会带 setup 头（bootstrap/init token），不要随意移除

## 7. 样式与主题约定
- 全局样式入口：`client/src/index.css`
- 主题变量使用 CSS 变量（`--background`、`--primary` 等）
- 主题状态保存在 localStorage 的 `theme`
- 国际化状态保存在 localStorage 的 `locale`

## 8. 环境变量（已在代码中使用）
- `VITE_API_URL`：默认 `/api/v1`
- `VITE_WS_URL`：WebSocket Host（默认当前域名）
- `VITE_OAUTH_PORTAL_URL`、`VITE_APP_ID`
- `VITE_FRONTEND_FORGE_API_KEY`、`VITE_FRONTEND_FORGE_API_URL`

## 9. 常见改动模板
1. 在 `lib/api.ts` 增加 API 封装方法
2. 在 `pages/` 新建页面，优先复用 `DashboardLayout`
3. 在 `App.tsx` 注册路由
4. 如为菜单入口，更新 `components/Sidebar.tsx`
5. 补齐中英文文案：`i18n/locales/zh.ts`、`i18n/locales/en.ts`

## 10. 当前代码库已知事实（避免误判）
- 前端 WebSocket 默认连 `/api/v1/ws`；但后端路由当前未看到该路径注册，实时状态可能保持断开。
- 多处页面对接口返回做了兼容性兜底（`any` + 多分支数据路径），改接口时要同步清理这些 fallback，避免新旧结构混用。
