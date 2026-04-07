## **项目简介**

- **描述**: 本项目是一个轻量的 Gitee/Git webhook 处理服务（基于 Node.js + Express），用于接收仓库的 push / pull request 等事件并按 `config.json` 中配置执行对应脚本。
- **主要用途**: 自动触发构建/部署脚本、接收仓库事件并记录日志。

**先决条件**

- **Node.js**: 建议使用 Node.js 16+（本项目使用 ES 模块 `.mjs`）。
- **系统权限**: 若脚本在 `config.json` 中调用系统命令，请确保运行用户对相关脚本/目录有执行权限。

## **安装**

- 克隆或拷贝本项目后，在项目根目录运行:

```bash
npm install
```

## **配置说明**

- 配置文件: `config.json`（项目根）。主要字段说明：
  - `server.port`: 服务监听端口（默认 `8000`）。
  - `server.secret`: 与 Gitee 钩子配置的密码/密钥，对请求签名进行校验。
  - `server.allowIps`: 可选，允许访问的 IP 列表。
  - `projects`: 仓库列表，每项包含 `name`（仓库全名）、`branches`、`events`、`scripts`（按事件触发的命令数组，支持 `cmd` 和可选 `cwd`）。
  - `logging`: 日志配置，包含 `file`（默认 `./logs/webhook.log`）、`level` 等。

  示例见当前 `config.json`，按需添加或修改项目条目。

## **运行**

- 开发 / 生产启动:

```bash
npm start
# 或
node index.mjs
```

- 启动后，服务会在 `server.port` 指定的端口监听来自 Gitee 的 webhook 请求。

## **日志与目录**

- 日志默认写入到 `./logs/webhook.log`（可在 `config.json.logging.file` 中修改）。
- 主要源文件：
  - `index.mjs` — 程序入口。
  - `config.mjs` — 配置加载与合并逻辑（位于 `lib/`）。
  - `handlers.mjs` — 事件处理器实现（位于 `lib/`）。
  - `runner.mjs` — 外部命令执行器（位于 `lib/`）。
  - `logger.mjs` — 日志封装（位于 `lib/`）。

## **添加项目/脚本示例**

- 在 `config.json.projects` 中添加新对象，定义 `name`、目标 `branches`、要监听的 `events`，以及 `scripts` 列表，其中 `scripts` 中的每一项包含 `event`、可选的 `branch`、`cmd` 与可选 `cwd`。

## **安全说明**

- 请务必设置 `server.secret` 并在 Gitee 钩子配置中使用相同密码，以避免未授权请求触发脚本。
- 若对公网开放，请配合 `allowIps` 限制来源 IP 或放置在受控网络中。



## gitee webhook 钩子

来源：https://help.gitee.com/webhook/gitee-webhook-push-data-type

#### Push / Tag Hook 数据格式

```json
{
  hook_id: self.id,                    # 钩子 id。
  hook_url: hook_url,                  # 钩子路由。
  hook_name: String,                   # 钩子名，固定为 push_hooks/tag_push_hooks。
  password: String,                    # 钩子密码。eg：123456
  timestamp: Number,                   # 触发钩子的时间戳。eg: 1576754827988
  sign: String,                        # 钩子根据密钥计算的签名。eg: "rLEHLuZRIQHuTPeXMib9Czoq9dVXO4TsQcmQQHtjXHA="
  ref: String,                         # 推送的分支。eg：refs/heads/master
  before: String,                      # 推送前分支的 commit id。eg：5221c062df39e9e477ab015df22890b7bf13fbbd
  after: String,                       # 推送后分支的 commit id。eg：1cdcd819599cbb4099289dbbec762452f006cb40
  [total_commits_count: Number],       # 推送包含的 commit 总数。
  [commits_more_than_ten: Boolean],    # 推送包含的 commit 总数是否大于十二。
  created: Boolean,                    # 推送的是否是新分支。
  deleted: Boolean,                    # 推送的是否是删除分支。
  compare: String,                     # 推送的 commit 差异 url。eg：https://gitee.com/oschina/git-osc/compare/5221c062df39e9e477ab015df22890b7bf13fbbd...1cdcd819599cbb4099289dbbec762452f006cb40
  commits: [*commit] || null,          # 推送的全部 commit 信息。
  head_commit: commit,                 # 推送最前面的 commit 信息。
  repository: *project,                # 推送的目标仓库信息。
  project: *project,                   # 推送的目标仓库信息。
  user_id: Number,
  user_name: String,                   # 推送者的昵称。
  user: *user,                         # 推送者的用户信息。
  pusher: *user,                       # 推送者的用户信息。
  sender: *user,                       # 推送者的用户信息。
  enterprise: *enterprise || ull       # 推送的目标仓库所在的企业信息。
}
```

#### Pull Request Hook 数据格式



```json
{
  hook_id: self.id,                    # 钩子 id。
  hook_url: hook_url,                  # 钩子路由。
  hook_name: String,                   # 钩子名，固定为 merge_request_hooks。
  password: String,                    # 钩子密码。eg：123456
  timestamp: Number,                   # 触发钩子的时间戳。eg: 1576754827988
  sign: String,                        # 钩子根据密钥计算的签名。eg: "rLEHLuZRIQHuTPeXMib9Czoq9dVXO4TsQcmQQHtjXHA="
  action: String,                      # PR 状态。eg：open
  pull_request: *pull_request,         # PR 的信息。
  number: Number,                      # PR 的 id。
  iid: Number,                         # 与上面 number 一致。
  title: String,                       # PR 的标题。eg：这是一个 PR 标题
  body: String || nil,                 # PR 的内容。eg：升级服务...
  state: String,                       # PR 状态。eg：open
  merge_status: String,                # PR 的合并状态。eg：unchecked
  merge_commit_sha: String,            # PR 合并产生的 commit id。eg：51b1acb1b4044fcdb2ff8a75ad15a4b655101754
  url: String,                         # PR 在 Gitee 上 url。eg：https://gitee.com/oschina/pulls/1
  source_branch: String || null,       # PR 的源分支名。eg：fixbug
  source_repo: {
    project: *project,                 # PR 的源仓库信息。
    repository: *project               # PR 的源仓库信息。
  } || null,
  target_branch: String,               # PR 的目标分支名。master
  target_repo: {
    project: *project,                 # PR 的目标仓库信息。
    repository: *project               # PR 的目标仓库信息。
  },
  project: *project,                   # PR 的目标仓库信息。
  repository: *project,                # PR 的目标仓库信息。
  author: *user,                       # PR 的创建者信息。
  updated_by: *user,                   # PR 的更新者信息。
  sender: *user,                       # PR 的更新者信息。
  target_user: *user || null,          # 被委托处理 PR 的用户信息。
  enterprise: *enterprise || null      # PR 仓库所在的企业信息。
}
```

