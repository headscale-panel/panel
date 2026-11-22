# 从零启动本地开发环境手册

本文档说明本仓库如何通过根目录单一 **`mise`** 配置管理全部工具链与脚本，并提供一套从 0 启动本地完整开发与验证环境的操作指南。

> [!NOTE]
> 本手册默认以 **Linux** 开发机为前提编写（所有脚本、Docker 挂载与 `/dev/net/tun` 均基于 Linux 环境）。如使用 macOS 或 Windows（WSL2），请自行适配相应环境。

---

## 1. `mise` 在本项目中负责什么

1. **运行时工具链（`[tools]`）**
   - 统一锁定并安装 Go、Node.js 与 pnpm，具体版本以根目录 [`mise.toml`](../mise.toml) 中的 `[tools]` 定义为准。
2. **统一环境变量（`[env]`）**
   - 自动注入 `PROJECT_ROOT`、`BACKEND_DIR`、`FRONTEND_DIR`、`SHELL_DIR`、`DEV_DATA_DIR`（根目录 `dev-data/`，已纳入 `.gitignore`）与 `HS_REPO_URL`。
3. **模块化任务编排（`[tasks.*]`）**
   - 所有 Shell 脚本已拆分为单一职责的功能模块存放于 `shell/{lib,dev,hs,certs}`，统一由 `mise run <任务名>` 编排调用。

### 核心任务一览

| 分组 | 常用任务 | 用途说明 |
| --- | --- | --- |
| **后端开发** | `backend:dev`、`backend:build`、`backend:vet`、`backend:tidy` | 运行、编译、静态检查与整理 Go 后端依赖 |
| **前端开发** | `frontend:install`、`frontend:dev`、`frontend:build`、`frontend:check`、`frontend:lint`、`frontend:lint:fix` | 安装依赖、启动 Vite 热重载、类型检查、Lint 与构建 |
| **全量门禁与构建** | `check`、`build`、`build:docker` | 一键运行前后端全部检查 + Headscale 漂移检测，或构建二进制/生产镜像 |
| **开发栈（正式镜像模式）** | `dev:up`、`dev:up:host`、`dev:up:fresh` | **默认设计模式**：直接拉取并运行最新正式版 Headscale 镜像（如 `ghcr.io/juanfont/headscale:0.30.0`） |
| **开发栈（源码构建模式）** | `dev:up:source`、`dev:up:host:source`、`dev:up:fresh:source` | **临时过渡模式**：在 Headscale `0.30.0` 尚未正式发版前，自动按 `AdaptedHeadscaleCommit` 拉取源码通过 Docker 构建本地镜像并启动 |
| **开发栈运维** | `dev:verify`、`dev:logs`、`dev:down`、`dev:down:volumes`、`dev:reset` | 端到端网络隔离/路由断言、查看日志、停止环境或彻底清空 `dev-data/` 与卷 |
| **开发栈子模块** | `dev:check-deps`、`dev:prepare`、`dev:clean-hs-state`、`dev:ensure-hs-image`、`dev:build-panel`、`dev:start`、`dev:bootstrap:{apikey,identities,clients,panel}` | 可独立运行的底层模块脚本，由上层 `dev:up*` 按序组合 |
| **Headscale 上游维护** | `hs:diff`、`hs:vendor-spec`、`hs:check-drift`、`hs:build-image` | 对比上游 API/配置差异、生成降级 OpenAPI 3.0.3 规范、校验基线一致性与构建源码镜像 |
| **TLS 证书工具** | `certs:self-signed`、`certs:private-ca` | 生成自签名证书或私有 CA 签发证书，输出至 `dev-data/cert/` |

---

## 2. 本地开发环境数据目录（`dev-data/`）

所有本地开发产生的运行期数据均集中在项目根目录的 **`dev-data/`** 下：

```text
dev-data/
├── headscale/
│   ├── etc/config.yaml         # 首次由 shell/docker/dev/headscale/config.main.yaml.tpl 初始化
│   └── lib/                    # Headscale SQLite 数据库、密钥与 extra-records.json
├── panel/                      # Panel SQLite 数据库与 RS256 签名密钥
├── influxdb/                   # InfluxDB 2 时序数据
├── state/                      # bootstrap 生成的 api-key.env 与 preauth.env
└── cert/                       # mise run certs:* 生成的本地开发证书
```

执行 `mise run dev:reset` 即可一键销毁全部容器、Docker 卷与 `dev-data/` 目录。

---

## 3. 从 0 启动本地开发环境操作步骤

### 第 1 步：准备宿主机依赖
- **Docker**（20.10+，含 `docker compose` 插件）且具备 `/dev/net/tun`。
- **`mise`**：按官方文档安装并接入 Shell（https://mise.jdx.dev/getting-started.html）。
- **`jq`** 与 **`openssl`**（供 `dev:verify` 与 `certs:*` 使用）。

### 第 2 步：信任配置并安装工具链与依赖
```bash
git clone <repo-url> headscale-panel
cd headscale-panel
mise trust mise.toml
mise install
mise run frontend:install
```

### 第 3 步：运行基础质量检查
```bash
mise run check
```

### 第 4 步：启动本地开发 Tailnet 栈

根据上游 Headscale 是否已发布 `0.30.0` 正式镜像选择模式：

#### 模式 A：正式镜像模式（默认设计）
```bash
mise run dev:up
```

#### 模式 B：源码构建模式（当前 0.30.0-dev 临时过渡）
```bash
mise run dev:up:source
```
该命令会自动完成：检查依赖 → 初始化 `dev-data/` → 按 `AdaptedHeadscaleCommit` 构建本地 Headscale 镜像 → 构建 Panel 镜像 → 启动 Headscale / InfluxDB / `client-a` / `client-b` / `target-a` / `target-b` / Panel → 签发 API Key → 创建 `alice` 与 `bob` → 自动登录两台 Tailscale 客户端 → 自动初始化面板管理员（`admin` / `dev-admin-password-1234`）。

#### 模式 C：宿主机前后端热重载模式（日常改代码推荐）
```bash
# 终端 1：仅启动基础设施与客户端容器
mise run dev:up:host:source   # 正式版发布后改用 mise run dev:up:host

# 终端 2：启动 Go 后端
mise run backend:dev

# 终端 3：启动 Vite 前端热重载
mise run frontend:dev
```

### 第 5 步：验证网络连通并打开浏览器
```bash
mise run dev:verify
```
6 项断言全部通过后，即可访问：
- **面板界面（容器模式）**：`http://localhost:8090/panel`
- **面板界面（宿主机 Vite 模式）**：`http://localhost:5173/panel`
- **Headscale HTTP API**：`http://localhost:5080`
- **默认管理员账号**：`admin` / `dev-admin-password-1234`（可在 `shell/docker/dev/.env` 中修改）

### 第 6 步：常用运维命令
```bash
mise run dev:logs          # 实时查看容器日志
mise run dev:down          # 停止容器（保留 dev-data/ 与卷）
mise run dev:reset         # 彻底清理容器、卷与 dev-data/
```
