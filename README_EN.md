# dsh-ov-memory

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%5E22.19%20%7C%7C%20%3E%3D24-339933)](package.json)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6)](https://www.typescriptlang.org/)
[![CI](https://github.com/xiaono1/dsh-ov-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/xiaono1/dsh-ov-memory/actions)

[简体中文](README.md) | English

A DeepSeek Harness (DSH) bundle that connects persistent memory from
[OpenViking](https://github.com/volcengine/OpenViking) to your agents.
**Original TypeScript implementation** — behaviorally equivalent to the official
`@openviking/dsh-memory-plugin`, with fully independent code and design
(personal portfolio project).

Highlights:

- **Auto recall** — injects relevant memory at every `agent/pre-step` using the
  OpenViking context-mode search (server-side de-dupe & token budget).
- **Session mirroring** — `session/event` streams user/assistant (optionally
  tool) messages into an `dsh-<session-id>` OpenViking session.
- **Threshold commits** — commits at `turn/end` when the server reports
  `pending_tokens >= threshold`, plus a teardown commit on `session/flush`.
- **Offline-first outbox** — writes that fail while the server is down are
  persisted locally and replayed idempotently at the next session start.
- **Model tool surface** — a hand-written minimal MCP stack (stdio server ↔
  streamable-HTTP upstream) exposes the server's full tools as
  `mcp__openviking__*`, auto-syncing on tool-list changes.
- **viking:// URI guard** — `tools/pre-execute` stops local fs/shell tools from
  touching `viking://` virtual paths.
- **Zero runtime npm deps** — reuses the `@deepseek-ai/*` peers DSH already
  installs.

## Install

```bash
npm ci && npm run build        # lib/ is committed, so this is optional
dsh plugin --profile desktop add <absolute path to this repo>
```

The bundle registers itself through its own `cordis.patch.yml` as an isolated
cordis group (service realm `ovMemory`).

## Configuration

Defaults point at `http://127.0.0.1:1933`. Credentials follow the usual
OpenViking precedence: `OPENVIKING_*` env → `~/.openviking/ovcli.conf` →
`~/.openviking/ov.conf`. Override in the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: ov-memory
      config:
        - id: ov-memory-runtime
          config:
            endpoint: 'http://127.0.0.1:1933'
            apiKey: 'your-user-key'
            recall: { enabled: true, budgetTokens: 2000, scoreFloor: 0.35 }
            capture: { toolResults: false, skipSubagentSessions: false }
            commit: { thresholdTokens: 20000, keepRecentCount: 10 }
```

Env vars: `OPENVIKING_URL`, `OPENVIKING_API_KEY`, `OPENVIKING_BEARER_TOKEN`,
`OPENVIKING_ACCOUNT`, `OPENVIKING_USER`, `OPENVIKING_PEER_ID`,
`OPENVIKING_MCP_URL`, `OPENVIKING_PENDING_DIR`.

## Architecture

See [docs/DESIGN.md](docs/DESIGN.md) for the full design notes and the
differences vs. the official/community implementations.

## Development

```bash
npm run typecheck
npm run build
npm test               # node --test with a mock OpenViking server; server-less CI
```

Optional end-to-end against a real server:

```bash
uv tool install openviking
openviking-server init && openviking-server   # 127.0.0.1:1933
```

## License

[MIT](LICENSE)
