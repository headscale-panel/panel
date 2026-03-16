# Backend Agent Guide

适用目录：`/Users/xinyun/Project/headscale-panel-complete-final/headscale-panel-backend`

## 1. 技术栈与运行方式
- 语言/框架：Go 1.24 + Gin + GORM
- 数据库：SQLite（默认 `data.db`）
- 外部依赖：Headscale gRPC（必需），InfluxDB（可选）
- 启动命令：`go run main.go`
- 测试命令：`go test ./...`

## 2. 启动流程（真实代码路径）
1. `main.go` -> `application.NewServer()`
2. `conf.Init(".env")` 加载配置并校验安全项
3. `model.Init()` 自动迁移并初始化默认数据（权限、Admin 组、setup 状态）
4. `headscale.Init()` 初始化 gRPC 客户端
5. 可选初始化 InfluxDB 并启动指标采集
6. `services.OIDCService.Init()`
7. `router.InitRouter()` 注册所有路由与中间件

## 3. 目录职责
- `application/`：应用生命周期（启动/优雅关闭）
- `pkg/conf/`：配置读取与安全校验（含 `JWT_SECRET` 自动生成写回 `.env`）
- `model/`：GORM 模型、迁移、默认数据 seed
- `router/controllers/`：HTTP 入参绑定与响应输出（薄层）
- `router/services/`：业务逻辑（权限、Headscale 调用、setup、ACL 等）
- `router/middleware/`：鉴权、权限、限流、前端静态资源托管
- `pkg/utils/serializer/`：统一响应与错误码
- `pkg/headscale/`：Headscale gRPC 客户端

## 4. API 约定（必须遵守）
- 统一返回结构：
  - `{"code": number, "msg": string, "data": any, "error"?: string}`
- 成功码：`code = 0`
- HTTP 状态通常固定 `200`，业务错误放在 `code/msg`
- 控制器只做：
  - `ShouldBindJSON/Query`
  - 调 service
  - `serializer.Success/Fail`

## 5. 鉴权与权限链路
- JWT 鉴权中间件：`router/middleware/auth.go`
  - 从 `Authorization: Bearer <token>` 解析
  - 将 `userID/username/groupID` 写入 `gin.Context`
- 权限中间件：`router/middleware/permission.go`
  - 调 `services.RequirePermission(userID, code)`
- 权限码在 `model/init.go` seed；新增权限时需要：
  - 增加 seed 权限
  - 路由使用新权限码
  - 前端按需放开入口

## 6. Setup 初始化机制（高优先级注意）
- 公开接口在 `/api/v1/setup/*`
- 初始化前注册被禁用（`SetupStateService.CanRegister()`）
- 初始化流程依赖 setup token：
  - `X-Setup-Bootstrap-Token`（可选，若配置了 bootstrap）
  - `X-Setup-Init-Token`（`/setup/status` 下发，短时有效）
- 首个管理员通过 `/setup/init` 建立

## 7. Headscale 集成约定
- 全局客户端：`pkg/headscale.GlobalClient`
- service 层调用 gRPC 时使用 `withServiceTimeout()`（默认 30s）
- 修改 Headscale 交互逻辑优先放在 `router/services/*`

## 8. 前端静态托管（与部署强相关）
- `FrontendMiddleware` 只托管 `/panel` 路径
- 访问 `/` 会 302 到 `/panel/`
- API 前缀固定 `/api/v1`

## 9. 常见改动模板
1. 在 `router/services` 增加业务方法（含权限检查与错误包装）
2. 在 `router/controllers` 增加 handler（仅绑定参数和输出）
3. 在 `router/init.go` 注册路由并挂权限中间件
4. 如涉及新能力，更新 `model/init.go` 的权限 seed
5. 补测试（优先 service 层和安全边界）

## 10. 当前代码库已知事实（避免误判）
- WebSocket 处理函数 `services.HandleWebSocket` 已存在，但当前路由中未看到 `/api/v1/ws` 注册。
- 项目默认在非 release 模式下会在响应中带更多错误细节，release 会收敛敏感信息。
