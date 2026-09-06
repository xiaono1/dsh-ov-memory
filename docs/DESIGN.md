# dsh-ov-memory — 设计文档

> 将 OpenViking 记忆接入 DeepSeek Harness（DSH）的独立实现插件。
> 仓库：github.com/xiaono1/dsh-ov-memory（公开）

## 1. 定位与声明

本插件**独立实现**（clean-room 风格）：以 DeepSeek Harness 官方插件
`@openviking/dsh-memory-plugin` 的行为规格与 volcengine 官方 OpenViking 文档为
**外部契约**，但代码、模块划分、命名与实现细节均为本项目原创。只对齐"做什么"，
不复制"怎么写"。

- 语言：**TypeScript**（构建产物 `lib/` 提交仓库，支持免构建安装，同时源码可读）。
- 运行时：ESM；Node `^22.19 || >=24`（开发机 22.14 仅用于测试，警告可忽略）。
- 依赖策略：**零运行时 npm 依赖**（复用 DSH profile 已装的 `@deepseek-ai/*`
  peer 包；MCP 协议与 REST 客户端均为自研最小实现）。
- 测试：`node --test`；契约测试用**自建模拟 OpenViking 服务器**；可选 e2e 对
  真实服务器（`OPENVIKING_E2E=1`）。

## 2. 功能规格（与官方对齐的等价面）

| 面 | 行为 |
| --- | --- |
| 会话建档 | `agent/session-start`：注入 OpenViking 用户画像 + 可用记忆索引（plugin source 的 user 消息） |
| 自动召回 | `agent/pre-step`：以当前步骤输入召回，压缩后注入同一步；budget/阈值可配 |
| 会话捕获 | `session/event`：user/assistant（+可选 tool）消息 → OpenViking 会话流 `dsh-<session-id>` |
| 阈值提交 | `turn/end`：pending_tokens ≥ 阈值（默认 20000）即 commit（keep_recent_count=10）；会话关闭兜底 |
| 离线出站 | 写失败进本地 pending 队列，下个会话启动时幂等重放（重试上限/TTL） |
| 模型工具面 | stdio MCP 代理子进程：DSH `dsh-mcp-client` ↔（MCP stdio）↔ 代理 ↔（MCP streamable HTTP）↔ OpenViking `/mcp`，工具名 `mcp__openviking__*`，服务器工具表变更自动同步 |
| 技能 | 独立 `ctx.skills` provider（isolated，includeDefaultRoots:false）提供 `ov-memory` 技能 |
| URI 保护 | `tools/pre-execute`：拦截 DSH fs/shell 工具把 `viking://` 当本地路径；引导用 `mcp__openviking__*` |
| 身份 | 每个会话按工作区 git 身份解析 actor peer（git origin 归一化，回退路径，仓库外不发）；`OPENVIKING_PEER_ID` 固定 |
| 配置 | schemastery schema；走 profile `cordis.patch.yml`（group isolate 于 `openvikingMemory`） |
| 隔离 | `skipSubagentSessions`（默认 false）、`syncTurns`（默认 true）语义对齐 |

## 3. 架构决策（自研取舍）

1. **自动化层走 REST，模型层走 MCP**：召回/画像/捕获/提交/pending 全部通过自研
   REST 客户端打 `/api/v1/*`（带 per-session peer 头）；给模型用的完整工具面走
   MCP 桥。理由同官方：自动层需要进程内逐会话控制，工具面需要服务器全量能力。
2. **代理是"一次进程 per profile"**：MCP 工具调用的 peer 在代理启动时解析
   （进程级），自动层的 peer 逐会话解析。
3. **最小 MCP 实现（自研）**：
   - 下行（代理 ↔ dsh-mcp-client）：stdio newline-delimited JSON-RPC；
     initialize/initialized/ping、tools/list、tools/call、`notifications/tools/list_changed` 上行推送。
   - 上行（代理 ↔ 服务器）：POST `/mcp` streamable HTTP，`Mcp-Session-Id`
     回显、会话失效重初始化；不做 GET SSE 长连。
   - 凭据：从 env → `~/.openviking/ovcli.conf` → `~/.openviking/ov.conf` 解析后
     经子进程 env 传给代理（DSH 会擦除凭据形 env，须显式注入）。
4. **注入用 pre-step user 消息而非 system prompt**：persona `complete:true` 会
   丢弃 system 贡献；且注入可回放、可见于压缩。
5. **状态文件只存消息 id**（不存正文/密钥），正文来自 DSH 会话历史，可从事件流重放。

## 4. 模块划分（TypeScript）

```
src/
  index.ts           插件入口：name/inject/Config/apply；装配各模块与 ctx.effect 清理
  config.ts          schemastery 配置 schema + 默认值 + 归一化
  credentials.ts     env → ovcli.conf → ov.conf 解析与优先级、header 构造
  peer.ts            git 工作区 → peer 解析（origin 归一化 / 路径回退 / none）
  client/            自研 REST 客户端（fetch，超时/重试/信封解包）
    index.ts         统一 request()（status/result/error 信封）
    sessions.ts      ensure/get/messages/commit/pending_tokens/tasks 轮询
    recall.ts        search(context/list)、find、read/list/tree/grep/glob 封装
  recall.ts          pre-step 召回编排：budget、去重、注入块组装
  profile.ts         session-start 画像/索引注入
  capture.ts         session/event → 会话流消息模型（含 tool 结果、剥离注入块）
  commit.ts          turn/end 阈值判定 + commit；teardown 兜底
  outbox.ts          pending 队列（原子写、dedupKey、重试上限、TTL、replay）
  mcp/               工具桥
    mount.ts         dsh-mcp-client 装配（stdio transport, serverName openviking）
    proxy-entry.ts   代理子进程入口（stdio MCP server）
    upstream.ts      到 /mcp 的 streamable HTTP MCP client（会话管理）
  guard.ts           tools/pre-execute URI 保护
  skills/ov-memory/SKILL.md   自带技能
cordis.patch.yml     profile 侧 group/isolate 声明（插件包内自带补丁片段）
test/                node:test 单测 + mock server 集成测试（node:http 自建）
```

## 5. 关键外部契约（实现依据，非复制对象）

- OpenViking REST：`/api/v1/*`，信封 `{status,result,error}`；`GET /health` 免鉴权。
- 鉴权头：`Authorization: Bearer` / `X-Api-Key`；身份头 `X-OpenViking-Account/User/Actor-Peer`。
- 凭据优先级：env → ovcli.conf → ov.conf；env 名 `OPENVIKING_URL/BASE_URL/API_KEY/BEARER_TOKEN/ACCOUNT/USER/PEER_ID/MCP_URL/...`。
- 会话：`GET /api/v1/sessions/{sid}` → `pending_tokens`；`POST .../commit {keep_recent_count}`；提交为两阶段（同步归档 + 异步抽取）。
- URI：`viking://~/memories` ≡ `viking://user/{uid}/memories`；peer 记忆在
  `viking://user/{uid}/peers/{peer}/memories`。
- DSH 钩子（ctx.on）：`agent/session-start`、`agent/pre-step`（waterfall，{prepend}）、
  `session/event`、`session/flush`、`tools/pre-execute`（waterfall allow/deny）。
- 注入：`agent.inject(createUserMessage({content, source:{kind:'plugin', plugin, form}}))`；
  form ∈ snapshot/instructions/catalog/notice/relay/recall。
- MCP 客户端：`@deepseek-ai/dsh-mcp-client` stdio transport（serverName `^[A-Za-z0-9_-]{1,32}$`），
  工具名 `mcp__<serverName>__<tool>`。

## 6. 工程与交付

- README（中/英）+ docs/DESIGN.md + LICENSE(MIT) + CHANGELOG。
- GitHub Actions：node 22/24 ×（typecheck + build + test）；契约测试 mock server 模式。
- 发布节奏：tag v0.1.0 → release notes。
- 真机验证：desktop profile 备份 → 替换官方插件 → 本机 OpenViking 服务器 e2e → 回滚预案。

## 7. 明确不做（v0.1）

- GUI 设置卡片（client-ui）与 `/` 斜杠命令（Rxiain 有，v0.1 不做，避免过度）。
- 多后端抽象、procedure lane、repo 上下文注入等增强。
- npm 发布（如需 `pnpm publish` 即可）。
