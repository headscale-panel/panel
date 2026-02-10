# Headscale Panel

[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
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