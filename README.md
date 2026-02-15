# Headscale Panel

[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.24-blue.svg)](https://golang.org)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://reactjs.org)

一个现代化的 Headscale 管理面板，提供类似 UniFi 风格的用户界面，支持设备管理、用户管理、ACL 可视化、路由发布、在线时长统计等功能。

![Dashboard Preview](docs/images/dashboard.png)

## ✨ 核心功能

### 🎨 现代化 UI
- **UniFi 风格设计**：浅色主题，蓝色主色调，科技感十足
- **响应式布局**：支持桌面端和移动端
- **流畅动画**：平滑过渡和微交互效果
- **网络拓扑可视化**：实时展示设备连接关系

### 📊 监控统计
- **在线时长统计**：基于 InfluxDB 的精确时长记录
- **设备状态监控**：实时显示设备在线/离线状态
- **流量统计**：设备流量趋势分析（预留功能）
- **数据可视化**：Recharts 图表展示

### 🛠️ 设备管理
- **设备列表**：查看所有连接的设备
- **设备操作**：重命名、删除、添加标签
- **批量操作**：批量删除、批量添加标签
- **筛选搜索**：按用户、状态、标签筛选

### 👥 用户管理
- **用户 CRUD**：创建、编辑、删除用户
- **用户组管理**：组织用户到不同的组
- **权限分配**：基于 RBAC 的权限系统
- **2FA 支持**：TOTP 两步验证

### 🔒 ACL 管理
- **可视化编辑**：图形化 ACL 规则编辑器
- **快捷管理**：用户组 <-> 用户 <-> 设备快捷绑定
- **HuJSON 支持**：解析和生成 HuJSON 格式
- **一键应用**：直接应用到 Headscale

### 🛣️ 路由管理
- **路由发布**：便捷发布子网路由
- **路由列表**：查看所有已发布的路由
- **启用/禁用**：快速控制路由状态
- **Headscale 同步**：自动同步路由信息

### 🔗 快速连接
- **多平台支持**：Linux, macOS, Windows, iOS, Android
- **命令生成**：自动生成连接命令
- **一键复制**：快速复制到剪贴板
- **PreAuthKey**：生成预授权密钥

### 📦 资源中心
- **资源发布**：发布内部资源（如知识库、代码仓库）
- **资源浏览**：工作台展示所有可访问资源
- **权限控制**：基于用户组的资源访问控制

### 🆔 OIDC Provider
- **内置 OIDC**：可作为 Headscale 的认证提供者
- **OAuth2 客户端**：管理第三方应用接入
- **统一认证**：一套账号管理所有服务

---

## 🚀 快速开始

### 使用 Docker（推荐）

```bash
# 构建镜像
docker build -t headscale-panel .

# 运行容器
docker run -d \
  --name headscale-panel \
  -p 8080:8080 \
  -v $(pwd)/data:/app/data \
  -e SYSTEM_BASE_URL=https://myvpn.example.com \
  -e HEADSCALE_GRPC_ADDR=127.0.0.1:50443 \
  -e HEADSCALE_INSECURE=true \
  headscale-panel
```

首次启动后访问 `http://localhost:8080`，进入初始化向导配置 gRPC 连接和管理员账户。

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `SYSTEM_PORT` | 面板监听端口 | `:8080` |
| `SYSTEM_BASE_URL` | 面板外部访问地址（用于 OIDC 回调等） | `http://localhost:8080` |
| `SYSTEM_SETUP_BOOTSTRAP_TOKEN` | 初始化引导令牌（≥32 字符，留空则不启用） | — |
| `DB_PATH` | SQLite 数据库路径 | `data.db` |
| `JWT_SECRET` | JWT 签名密钥（≥32 字符，留空自动生成） | 自动生成 |
| `JWT_EXPIRE` | JWT 过期时间（小时） | `24` |
| `HEADSCALE_GRPC_ADDR` | Headscale gRPC 地址 | `localhost:50443` |
| `HEADSCALE_API_KEY` | Headscale API Key | — |
| `HEADSCALE_INSECURE` | gRPC 是否跳过 TLS 验证 | `false` |
| `FRONTEND_DIR` | 前端静态文件目录（Docker 中已内置） | `./frontend` |

---

## 🏗️ 架构说明

```
┌───────────────┐      HTTPS       ┌──────────────────┐
│  浏览器/客户端  │ ◄──────────────► │  反向代理 (Nginx) │
└───────────────┘                  └────────┬─────────┘
                                           │
                        ┌──────────────────┼──────────────────┐
                        │                  │                  │
                        ▼                  ▼                  ▼
                  ┌───────────┐     ┌────────────┐    ┌──────────────┐
                  │ Panel     │     │ Headscale  │    │ Headscale    │
                  │ :8080     │     │ HTTP :8080 │    │ gRPC :50443  │
                  │ (UI+API)  │     │ (控制平面)  │    │ (API)        │
                  └───────────┘     └────────────┘    └──────────────┘
                        │                                     ▲
                        │           gRPC (内网)                │
                        └─────────────────────────────────────┘
```

- **Headscale Panel**（本项目）：管理面板，提供 Web UI 和 REST API，通过 gRPC 连接 Headscale
- **Headscale**：VPN 控制平面，Tailscale 客户端直接连接此服务
- 面板和 Headscale 之间通过 gRPC 通信，通常部署在同一台服务器或内网

---

## 🌐 反向代理配置

假设域名为 `myvpn.example.com`，需要反代以下服务：

| 路径/流量 | 目标 | 说明 |
|-----------|------|------|
| `/web/` | Panel `:8080` | 管理面板 UI + REST API |
| `/` (默认) | Headscale `:8080` | Headscale 控制平面（Tailscale 客户端连接） |
| gRPC `:50443` | Headscale gRPC | 面板内网直连，**无需反代** |

> **关键点**：Tailscale 客户端会直接连接 `myvpn.example.com`，所以根路径 `/` 必须指向 Headscale。管理面板放在 `/web/` 子路径下。

### Nginx 配置

```nginx
server {
    listen 443 ssl http2;
    server_name myvpn.example.com;

    ssl_certificate     /etc/letsencrypt/live/myvpn.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/myvpn.example.com/privkey.pem;

    # --- 管理面板（UI + API）---
    # 面板前端和 API 统一挂载在 /web/ 下
    location /web/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;

        # WebSocket 支持（如有需要）
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # --- 面板 OIDC Discovery（.well-known 放在根路径）---
    # 如果启用内置 OIDC，Headscale 需要访问此端点
    location /.well-known/openid-configuration {
        proxy_pass http://127.0.0.1:8080/.well-known/openid-configuration;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # --- Headscale 控制平面（默认，Tailscale 客户端连接）---
    location / {
        proxy_pass http://127.0.0.1:8080;  # Headscale 的 HTTP 端口
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Headscale 长连接需要较长超时
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}

# HTTP → HTTPS 重定向
server {
    listen 80;
    server_name myvpn.example.com;
    return 301 https://$host$request_uri;
}
```

> **注意**：上面 `location /` 的 `proxy_pass` 地址应填 Headscale 实际的 HTTP 监听端口。如果 Headscale 和面板不在同一端口，请修改对应地址：
> - 面板默认监听 `:8080`
> - Headscale 默认监听 `:8080`（HTTP）和 `:50443`（gRPC）
>
> 如果两者端口冲突，可将面板改为其他端口，如 `SYSTEM_PORT=:8090`。

### Caddy 配置

```caddyfile
myvpn.example.com {
    # 面板 UI + API
    handle_path /web/* {
        reverse_proxy 127.0.0.1:8080
    }

    # 面板 OIDC Discovery
    handle /.well-known/openid-configuration {
        reverse_proxy 127.0.0.1:8080
    }

    # 面板 OIDC 端点
    handle /api/v1/oidc/* {
        reverse_proxy 127.0.0.1:8080
    }

    # Headscale 控制平面（默认路由）
    handle {
        reverse_proxy 127.0.0.1:8080  # Headscale HTTP 端口
    }
}
```

### 同端口部署（面板和 Headscale 共用端口）

如果面板和 Headscale 都监听 `:8080`，会端口冲突。推荐方案：

```bash
# 面板使用 8090 端口
docker run -d \
  --name headscale-panel \
  -p 8090:8080 \
  -e SYSTEM_PORT=:8080 \
  -e SYSTEM_BASE_URL=https://myvpn.example.com/web \
  headscale-panel

# Headscale 使用默认 8080 端口
# （按 Headscale 官方文档配置）
```

然后 Nginx 配置中：
- `location /web/` → `proxy_pass http://127.0.0.1:8090/;`
- `location /` → `proxy_pass http://127.0.0.1:8080;`（Headscale）

### 面板内置 OIDC 配置

如果使用面板内置 OIDC 作为 Headscale 认证提供者，需确保：

1. 设置环境变量 `SYSTEM_BASE_URL=https://myvpn.example.com/web`
2. 在面板「设置 → OIDC」中启用内置 OIDC，复制生成的配置
3. 在 Headscale 的 `config.yaml` 中填写：

```yaml
oidc:
  issuer: "https://myvpn.example.com/web"
  client_id: "headscale-builtin"
  client_secret: "<面板生成的密钥>"
  scope: ["openid", "profile", "email"]
```

4. 确保反代配置中 `/.well-known/openid-configuration` 和 `/api/v1/oidc/*` 能正确到达面板

### 独立域名部署（推荐）

如果有多个域名，最简单的方式是：

- `myvpn.example.com` → Headscale（Tailscale 客户端连接）
- `panel.myvpn.example.com` → Panel（管理面板）

```nginx
# Headscale
server {
    listen 443 ssl http2;
    server_name myvpn.example.com;
    # ... SSL 配置 ...

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}

# Panel
server {
    listen 443 ssl http2;
    server_name panel.myvpn.example.com;
    # ... SSL 配置 ...

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # OIDC Discovery 也在面板上
    location /.well-known/ {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

此时 `SYSTEM_BASE_URL=https://panel.myvpn.example.com`，Headscale OIDC issuer 设为 `https://panel.myvpn.example.com`。

---

## 🔧 开发指南

### 前置要求

- Go 1.24+
- Node.js 20+ / pnpm
- Headscale 实例（gRPC 可达）

### 本地开发

```bash
# 后端
cd headscale-panel-backend
cp ../env.example .env  # 编辑 .env 填写配置
go run main.go

# 前端（另一个终端）
cd headscale-panel-frontend
pnpm install
pnpm run dev
```

### 构建 Docker 镜像

```bash
docker build -t headscale-panel .
```

---

## 📄 License

MIT
