# dsh-ov-memory

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%5E22.19%20%7C%7C%20%3E%3D24-339933)](package.json)
[![Language](https://img.shields.io/badge/Language-TypeScript-3178C6)](https://www.typescriptlang.org/)

把 [OpenViking](https://github.com/volcengine/OpenViking) 持久记忆接入
[DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/)（DSH）的插件。
OpenViking 负责「记住」，本插件负责把记忆在合适的时候送进对话、把对话送回去沉淀。

简体中文 | [English](README_EN.md)

## 功能特性

- **自动召回** —— 每一步开始前，用当前输入在 OpenViking 中检索相关内容并注入对话（context 模式检索，服务端完成去重与 token 预算控制）
- **会话镜像** —— 把 user / assistant（可选 tool 结果）消息实时写入 OpenViking 的 `dsh-<会话id>` 会话流，供后台抽取为长期记忆
- **阈值提交** —— 服务端 `pending_tokens` 达到阈值自动 commit（保留最近 N 条为活跃消息）；会话关闭时兜底提交
- **离线出站队列（outbox）** —— OpenViking 不可达时写操作落盘持久化，下次会话启动时幂等重放（内容哈希去重、重试上限、TTL 清理）
- **完整工具面** —— 自研最小 MCP 实现（stdio 服务器 + streamable-HTTP 上游，无第三方 MCP SDK），把服务器全部工具以 `mcp__openviking__*` 暴露；服务器工具表变化自动同步
- **viking:// URI 守卫** —— 拦截本地 fs/shell 工具把 `viking://` 虚拟路径当成本地文件
- **自带技能** —— 独立 skill provider 提供 `ov-memory` 使用指南，不污染默认技能目录
- **零运行时依赖** —— 复用 DSH 已安装的 `@deepseek-ai/*` peer 包，无额外 npm 依赖

## 环境要求

- DeepSeek Harness：`@deepseek-ai/*` 0.1.x（≥ `0.1.0-rc.6`）release 线
- Node.js `^22.19.0` 或 `>=24`
- 一个可访问的 OpenViking 服务器（本地 `openviking-server`，或远程实例）

## 安装

```bash
# 从 GitHub 源码安装（lib/ 已预构建提交，无需本机构建）
dsh plugin --profile <profile> add github:xiaono1/dsh-ov-memory

# 本地开发安装
dsh plugin --profile <profile> add /path/to/dsh-ov-memory
```

插件通过自带的 `cordis.patch.yml` 注册为一个隔离的 cordis group（服务命名空间 `ovMemory`）。

> 从官方 `@openviking/dsh-memory-plugin` 迁移：请先从 profile 的 bundles 中移除官方插件再添加本插件，两者共用 `mcp__openviking__*` 命名空间，不能同时启用。

## 配置

默认连接 `http://127.0.0.1:1933`。凭据沿用 OpenViking 生态的统一解析顺序：
`OPENVIKING_*` 环境变量 → `~/.openviking/ovcli.conf` → `~/.openviking/ov.conf`。
如需显式覆盖，在 profile 的 `cordis.patch.yml` 中写入：

```yaml
- insert:
    - id: ov-memory
      config:
        - id: ov-memory-runtime
          config:
            endpoint: 'http://127.0.0.1:1933'   # REST base
            apiKey: 'your-user-key'              # 留空则走 env / ovcli.conf
            account: ''
            user: ''
            recall:
              enabled: true
              budgetTokens: 2000      # 每次召回的注入预算（服务端 context 模式）
              scoreFloor: 0.35        # 相关度下限
              refreshEverySteps: 0    # >0 时按步数周期强制刷新；0=仅查询变化时
            capture:
              toolResults: false      # 是否把工具结果也镜像进记忆流
              skipSubagentSessions: false
            commit:
              thresholdTokens: 20000  # pending_tokens 达到即提交
              keepRecentCount: 10     # 提交后保留为活跃的最近消息数
```

常用环境变量：

| 变量 | 作用 |
| --- | --- |
| `OPENVIKING_URL` / `OPENVIKING_BASE_URL` | 服务器地址 |
| `OPENVIKING_API_KEY` / `OPENVIKING_BEARER_TOKEN` | 鉴权凭据 |
| `OPENVIKING_ACCOUNT` / `OPENVIKING_USER` | 租户/用户（trusted 模式）|
| `OPENVIKING_PEER_ID` | 固定 actor peer |
| `OPENVIKING_MCP_URL` | MCP 端点覆盖（默认 `<url>/mcp`）|
| `OPENVIKING_PENDING_DIR` | outbox 目录（默认 `~/.openviking/pending`）|

## 工作原理

```
DSH agent 钩子                    本插件（进程内）                        OpenViking 服务器
─────────────────                ─────────────────                      ──────────────────
agent/session-start ──► 建档 + outbox 重放 ───────────► POST /api/v1/sessions
agent/pre-step     ──► 召回注入（plugin user 消息）──► POST /api/v1/search/search (mode=context)
session/event      ──► 会话镜像 ──服务器不可达──► outbox(本地持久化) ──重放──► POST .../messages
turn/end           ──► pending_tokens ≥ 阈值 → commit
session/flush      ──► 兜底提交
工具面 mcp__openviking__* ◄── dsh-mcp-client ◄── stdio ── 自研 MCP 代理 ──► POST /mcp (streamable HTTP)
```

设计决策与实现说明见 [docs/DESIGN.md](docs/DESIGN.md)，验证手册见 [docs/E2E.md](docs/E2E.md)。

## 与官方/社区版本的关系

本仓库是对官方 `@openviking/dsh-memory-plugin` 行为规格的**独立 TypeScript 实现**（不含其代码）。
自动化层（画像/召回/镜像/提交）直连 `/api/v1` REST，模型工具面通过**自研的最小 MCP 栈**
（stdio 服务器 + streamable-HTTP 上游）打通 `/mcp`。主要差异：

- TypeScript 源码 + 类型化模块划分；入口导出 schemastery `Config`（配置经 cordis 校验）
- 自研 MCP 协议实现，零运行时 npm 依赖
- outbox 对「投递成功但清理失败」与「其他插件遗留的异构条目」做了边界处理
- peer 依赖范围显式包含预发布分支，避免 npm 安装 ERESOLVE

## 开发

```bash
npm ci
npm run typecheck   # tsc --noEmit
npm run build       # TypeScript → lib/（已随仓库提交）
npm test            # node --test（内置 mock OpenViking 服务器，无需真实服务）
```

测试不依赖真实服务器：`test/*.test.mjs` 用自建 `node:http` 模拟 OpenViking REST 与 MCP 端点，
覆盖捕获/提交/outbox/凭据链/peer 解析/MCP 会话与工具调用/URI 守卫等路径。

可选真实服务器端到端验证见 [docs/E2E.md](docs/E2E.md)。

## License

[MIT](LICENSE)
