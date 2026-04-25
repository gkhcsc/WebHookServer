# WebHook Server 使用教程

## 项目说明

这是一个基于 Node.js + Express 的 WebHook 服务，支持：

1. 接收 Gitee/Git WebHook 请求并按配置触发脚本
2. 提供前端控制台（Vue3 + TypeScript + Element Plus）
3. 在控制台中进行手动触发、配置编辑、日志查看

## 目录结构

1. `index.mjs`：后端服务入口
2. `config.json`：核心配置文件
3. `lib/`：配置加载、日志、脚本执行、hook 处理模块
4. `frontend/`：前端管理页面

## 环境要求

1. Node.js 18+（建议 20+）
2. npm 9+

## 快速开始

### 1. 安装依赖

在项目根目录执行：

```bash
npm install
cd frontend && npm install
```

### 2. 启动后端

在项目根目录执行：

```bash
node index.mjs
```

默认端口读取 `config.json` 中的 `server.port`（默认 8000）。

当前版本采用双端口策略：

1. 公网业务端口（默认 `8000`）：仅用于 `webHook` 与健康检查
2. 本地控制端口（默认 `18000`）：用于前端控制 API（配置读写、日志、手动触发等）

可通过环境变量修改控制端口：

```bash
CONTROL_API_PORT=19000 node index.mjs
```

### 3. 启动前端

在 `frontend` 目录执行：

```bash
npm run dev
```

默认访问地址：`http://localhost:5173`

前端已配置开发代理：

1. `/api` -> `http://localhost:18000`（本地控制 API）
2. `/health`、`/webHook` -> `http://localhost:8000`（公网业务端口）

## 前端使用教程

### 1. 控制台页

路径：`/`

功能：

1. 查看项目概览、事件、分支、脚本映射
2. 手动选择项目/事件/分支触发任务
3. 查看触发结果

### 2. 配置编辑页

路径：`/config`

功能：

1. 从后端读取当前 `config.json`
2. 直接编辑 JSON 配置
3. 一键格式化 JSON
4. 保存后由后端校验并热更新（校验失败会返回错误）

建议流程：

1. 点击“重新加载”获取最新配置
2. 修改 JSON
3. 点击“格式化”检查结构
4. 点击“保存配置”提交

### 3. 日志查看页

路径：`/logs`

功能：

1. 读取后端日志文件
2. 每条日志按 JSON 格式展示
3. 支持按级别过滤（all/error/warn/info/debug）
4. 支持按条数加载（最大 1000）

## 后端 API 说明

### 业务接口

1. `POST /webHook`：接收 WebHook
2. `GET /health`：健康检查
3. `GET /health`：健康检查

### 配置与日志接口

以下控制接口运行在本地控制端口（默认 `127.0.0.1:18000`）：

1. `GET /api/summary`：控制台汇总信息
2. `GET /api/projects`：项目与脚本详情
3. `POST /api/jobs/trigger`：手动触发任务
4. `GET /api/config`：读取当前配置
5. `PUT /api/config`：保存配置并热更新
6. `GET /api/logs?limit=200`：读取日志（每条日志为一条 JSON）

## config.json 关键字段

1. `server.port`：服务端口
2. `server.secret`：WebHook 密钥（必填）
3. `server.allowIps`：允许 IP 列表
4. `projects`：项目配置列表
5. `projects[].scripts[]`：触发脚本映射（event/branch/cmd/cwd）
6. `logging.file`：日志文件路径

## 常见问题

### 1. 后端启动报错 “server.secret 未配置”

请在 `config.json` 中补充：

```json
{
  "server": {
    "secret": "你的密钥"
  }
}
```

### 2. 手动触发成功但脚本没执行

请检查：

1. `projects[].scripts[]` 是否匹配到对应 event/branch
2. `cmd` 和 `cwd` 是否正确
3. 当前运行账号是否有脚本执行权限

### 3. 日志页面无数据

请检查：

1. `logging.file` 路径是否正确
2. 服务是否有写日志权限
3. 是否已产生请求日志

## 安全建议

1. 必须设置 `server.secret`
2. 对公网部署时建议配置 `allowIps`
3. 不要在配置中写入不必要的敏感命令

