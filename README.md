# dsh-ov-memory

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%5E22.19%20%7C%7C%20%3E%3D24-339933)](package.json)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6)](https://www.typescriptlang.org/)
[![CI](https://github.com/xiaono1/dsh-ov-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/xiaono1/dsh-ov-memory/actions)

简体中文 | [English](README_EN.md)

把 [OpenViking](https://github.com/volcengine/OpenViking) 持久记忆接入
[DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/)（DSH）的插件。
**原创 TypeScript 实现**：行为规格对齐官方 `@openviking/dsh-memory-plugin`，代码与设计独立完成
（个人简历项目）。

- 自动召回：`agent/pre-step` 按当前步骤注入相关记忆（OpenViking context 模式，服务端去重/预算）
- 会话镜像：`session/event` 把 user/assistant（可选 tool）消息写入 `dsh-<session-id>` 会话流
- 阈值提交：`turn/end` 依据服务端 `pending_tokens` 阈值提交，`session/flush` 兜底
- 离线出站队列（outbox）：服务器不可达时写操作落盘，会话启动时幂等重放
- 模型工具面：**自研最小 MCP 实现**（stdio 服务器 ↔ streamable-HTTP 上游），工具以
  `mcp__openviking__*` 暴露，服务器工具表变更自动同步
- URI 保护：`tools/pre-execute` 拦截本地 fs/shell 工具误用 `viking://` 路径
- 技能：自带 `ov-memory` SKILL，独立 skill provider 提供，不污染默认目录
- 零运行时 npm 依赖（复用 DSH 已装的 `@deepseek-ai/*` peer 包）

## 安装

```bash
# 源码构建（生成 lib/，已随仓库提交，可跳过）
npm ci && npm run build

# 安装到 profile（本例：desktop）
dsh plugin --profile desktop add <本仓库绝对路径>
# 备份原 profile 的 package.json 后，把 "@openviking/dsh-memory-plugin" 替换为 "dsh-ov-memory"
```

插件通过自带的 `cordis.patch.yml` 注册为独立的 cordis group（隔离服务名 `ovMemory`）。

## 配置

配置默认直连 `http://127.0.0.1:1933`。凭据解析沿用 OpenViking 生态的统一顺序：
`OPENVIKING_*` 环境变量 → `~/.openviking/ovcli.conf` → `~/.openviking/ov.conf`。
也可在 profile 的 `cordis.patch.yml` 里显式覆盖：

```yaml
- insert:
    - id: ov-memory
      config:
        - id: ov-memory-runtime
          config:
            endpoint: 'http://127.0.0.1:1933'
            apiKey: 'your-user-key'        # 缺省时读 env / ovcli.conf
            recall:
              enabled: true
              budgetTokens: 2000           # 召回注入 token 预算
              scoreFloor: 0.35
              refreshEverySteps: 0
            capture:
              toolResults: false
              skipSubagentSessions: false
            commit:
              thresholdTokens: 20000       # pending_tokens 达到即提交
              keepRecentCount: 10
```

主要环境变量：`OPENVIKING_URL` / `OPENVIKING_API_KEY` / `OPENVIKING_BEARER_TOKEN` /
`OPENVIKING_ACCOUNT` / `OPENVIKING_USER` / `OPENVIKING_PEER_ID` / `OPENVIKING_MCP_URL` /
`OPENVIKING_PENDING_DIR`（outbox 目录，默认 `~/.openviking/pending`）。

## 架构

```
DSH agent 钩子                    MemoryRuntime(进程内)                OpenViking 服务器
─────────────                     ─────────────────                  ──────────────────
session-start ──replayOutbox──▶ outbox(本地JSON)◀──失败入队──capture / commit
     │              │                                            │
     └─ensure+画像─▶ REST 客户端 ──────────── POST /api/v1/sessions/*/messages|commit
pre-step ─────────▶ 召回编排 ────────────────── POST /api/v1/search/search mode=context
                                                    │
模型工具面 mcp__openviking__* ◀── dsh-mcp-client ◀──┴─ stdio JSON-RPC ─▶ 自研代理 ─▶ /mcp (streamable HTTP)
```

设计决策详见 [docs/DESIGN.md](docs/DESIGN.md)。与官方/社区版本的关键差异也在其中说明。

## 开发

```bash
npm run typecheck   # tsc --noEmit
npm run build       # TS → lib/（已提交）
npm test            # node --test（mock OpenViking 服务器 + 单测；CI 无服务器也可跑）
```

本地沙箱环境下若 `node --test` 的 runner 被限制，可逐个执行测试文件：
`node test/<file>.test.mjs`。

可选端到端（需要真实服务器）：

```bash
uv tool install openviking      # 或 pip install openviking
openviking-server init && openviking-server   # 默认 127.0.0.1:1933
OPENVIKING_E2E=1 node test/e2e.test.mjs       #（随仓库演进提供）
```

## License

[MIT](LICENSE)
