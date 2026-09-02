# WebHook Server

基于配置驱动的自动化任务执行系统

基于 Node.js + Express 的 WebHook 服务，支持接收 Gitee WebHook 请求并按配置触发脚本。附带 Vue 3 前端管理控制台。

## 技术栈

| 层级     | 技术                                      |
| -------- | ----------------------------------------- |
| 后端     | Node.js + Express 5 (ESM)                 |
| 前端     | Vue 3 + TypeScript + Vite + Element Plus  |
| 状态管理 | Pinia                                     |
| 路由     | Vue Router                                 |
| 日志     | Winston                                    |
| 包管理   | pnpm (Monorepo)                            |

## 环境要求

- **Node.js** >= 18（建议 20+）
- **pnpm** >= 8

安装 pnpm：

```bash
npm install -g pnpm
```

## 快速开始

### 一键初始化

```bash
pnpm setup
```

该命令会自动安装所有依赖并构建前端。

### 一键启动（生产模式）

```bash
pnpm start
```

启动后访问：
- **管理控制台**：http://127.0.0.1:18000/
- **健康检查**：http://localhost:8000/health
- **WebHook 端点**：http://localhost:8000/webHook

### 开发模式

```bash
pnpm dev
```

同时启动后端（端口 8000/18000）和前端 Vite 开发服务器（默认端口 5173，带 HMR 热更新）。

## 目录结构

```
webHookServer/
├── package.json              # 根工作区配置（Monorepo 脚本）
├── pnpm-workspace.yaml       # pnpm 工作区声明
├── pnpm-lock.yaml
├── setup.mjs                 # 一键初始化脚本
├── start.mjs                 # 一键生产启动脚本
├── dist/                     # 前端构建产物（由 build 生成）
├── apps/
│   ├── backend/              # @webhook/server
│   │   ├── index.mjs         # 入口：启动 Express 双端口服务
│   │   ├── package.json
│   │   ├── lib/              # 核心模块
│   │   │   ├── config.mjs    # 配置加载 / 校验
│   │   │   ├── logger.mjs    # Winston 日志
│   │   │   ├── runner.mjs    # 命令执行器
│   │   │   ├── handlers.mjs  # WebHook 处理逻辑
│   │   │   ├── storage-paths.mjs  # 平台路径检测
│   │   │   └── api-utils.mjs # 共享工具
│   │   └── router/
│   │       ├── control.mjs   # 控制 API（配置 / 日志 / 触发）+ 前端静态文件
│   │       └── public.mjs    # 公共路由（健康检查 / WebHook）
│   └── frontend/             # @webhook/frontend
│       ├── vite.config.ts    # Vite 构建配置
│       ├── package.json
│       └── src/
│           ├── main.ts       # 应用入口
│           ├── App.vue       # 根组件
│           ├── views/        # 页面组件
│           │   ├── HomeView.vue    # 仪表盘
│           │   ├── ConfigView.vue  # 配置编辑
│           │   └── LogsView.vue    # 日志查看
│           ├── api/          # Axios API 封装
│           ├── types/        # TypeScript 类型定义
│           ├── router/       # 路由配置
│           └── stores/       # Pinia 状态
```

## 可用脚本

| 命令                  | 说明                                           |
| --------------------- | ---------------------------------------------- |
| `pnpm setup`          | 一键初始化：安装依赖 + 构建前端                 |
| `pnpm start`          | 一键启动（自动构建前端并启动后端）              |
| `pnpm dev`            | 开发模式：并行启动后端 + 前端 Vite 开发服务器    |
| `pnpm dev:server`     | 仅启动后端（开发模式）                          |
| `pnpm dev:frontend`   | 仅启动前端 Vite 开发服务器                      |
| `pnpm build`          | 构建前端到根目录 `dist/`                        |
| `pnpm start:server`   | 仅启动后端（生产模式）                          |

## 架构说明

### 双端口设计

| 端口          | 绑定地址      | 用途                              |
| ------------- | ------------- | --------------------------------- |
| `8000`        | `0.0.0.0`     | 公网 WebHook + 健康检查            |
| `18000`       | `127.0.0.1`   | 控制 API（配置 / 日志 / 触发）+ 前端 |

控制端口仅监听本地回环地址，确保管理接口不被外部访问。

可通过环境变量修改端口：

```bash
# 修改控制端口
CONTROL_API_PORT=19000 pnpm start

# WebHook 端口在 config.json 中配置 server.port 字段
```

## 配置说明

### 首次启动

首次启动时，服务会自动在系统目录创建配置文件：

| 平台    | 配置目录                                  | 日志目录                                |
| ------- | ----------------------------------------- | --------------------------------------- |
| Linux   | `/etc/webhookserver/config.json`          | `/var/log/webhookserver/webhook.log`    |
| Windows | `%USERPROFILE%/.webhookserver/config.json` | `%LOCALAPPDATA%/webhookserver/webhook.log` |

### config.json 关键字段

```json
{
  "server": {
    "port": 8000,
    "secret": "你的 WebHook 密钥（必填）",
    "allowIps": []
  },
  "logging": {
    "level": "info",
    "file": "日志文件路径"
  },
  "projects": [
    {
      "name": "项目名称",
      "branches": ["main", "develop"],
      "events": ["push", "pull_request_merge"],
      "scripts": [
        {
          "event": "push",
          "branch": "main",
          "cmd": "要执行的命令",
          "cwd": "工作目录"
        }
      ]
    }
  ]
}
```

配置保存后会自动热更新，无需重启服务。

## 后端 API 参考

### 公共接口（端口 8000）

| 方法   | 路径          | 说明         |
| ------ | ------------- | ------------ |
| GET    | `/health`     | 健康检查     |
| POST   | `/webHook`    | 接收 WebHook |

### 控制接口（端口 18000，仅限本地访问）

| 方法   | 路径                  | 说明               |
| ------ | --------------------- | ------------------ |
| GET    | `/api/summary`        | 控制台汇总信息     |
| GET    | `/api/projects`       | 项目与脚本详情     |
| POST   | `/api/jobs/trigger`   | 手动触发任务       |
| GET    | `/api/config`         | 读取当前配置       |
| PUT    | `/api/config`         | 保存配置并热更新   |
| GET    | `/api/logs?limit=200` | 读取日志           |
| GET    | `/api/config/export`  | 导出配置文件       |
| GET    | `/api/logs/export`    | 导出日志文件       |
| GET    | `/`                   | 前端管理控制台     |

## 前端页面

| 路由      | 页面       | 功能                                         |
| --------- | ---------- | -------------------------------------------- |
| `/`       | 仪表盘     | 项目概览、统计信息、手动触发任务             |
| `/config` | 配置编辑   | 表单编辑 / 原始 JSON 编辑、配置导出          |
| `/logs`   | 日志查看   | 按级别过滤、JSON 格式化展示                  |

## 目前支持的事件

- `push`
- `pull_request_merge`

## 安全建议

1. **必须设置 `server.secret`**，确保 WebHook 请求经过密钥校验
2. 公网部署时配置 `server.allowIps` 限制来源 IP
3. 不要在配置中写入敏感的明文信息
4. 控制端口仅绑定 `127.0.0.1`，不要暴露到公网
5. 建议在反向代理（Nginx / Caddy）后面运行，启用 HTTPS
