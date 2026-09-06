# dsh-ov-memory

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%5E22.19%20%7C%7C%20%3E%3D24-339933)](package.json)
[![Language](https://img.shields.io/badge/Language-TypeScript-3178C6)](https://www.typescriptlang.org/)

Persistent memory for [DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/) (DSH) backed by [OpenViking](https://github.com/volcengine/OpenViking). OpenViking does the remembering; this bundle decides when to bring memory into a conversation and when to send the conversation back for digestion.

[简体中文](README.md) | English

## Features

- **Auto recall** — before each agent step, retrieves relevant context from OpenViking with the current input and injects it as an attributed plugin message (context-mode search; de-dupe and token budgeting happen server-side).
- **Session mirroring** — streams user/assistant messages (optionally tool results) into an `dsh-<session-id>` OpenViking session in real time for background extraction.
- **Threshold commits** — commits when the server reports `pending_tokens >= threshold` (keeping the newest N messages live), with a teardown commit at session flush.
- **Offline-first outbox** — writes that fail while the server is unreachable are persisted locally and replayed idempotently at the next session start (content-hash dedupe, retry cap, TTL pruning).
- **Full tool surface** — a self-contained minimal MCP implementation (stdio server + streamable-HTTP upstream, no third-party MCP SDK) exposes every server tool as `mcp__openviking__*`, re-syncing when the server's tool list changes.
- **viking:// URI guard** — keeps local fs/shell tools from treating `viking://` virtual paths as local files.
- **Bundled skill** — ships an `ov-memory` skill through an isolated skill provider, without shadowing the default skill roots.
- **Zero runtime npm dependencies** — reuses the `@deepseek-ai/*` peer packages DSH already installs.

## Requirements

- DeepSeek Harness on the `@deepseek-ai/*` 0.1.x line (`>= 0.1.0-rc.6`)
- Node.js `^22.19.0` or `>=24`
- A reachable OpenViking server (local `openviking-server`, or a remote instance)

## Install

```bash
# From GitHub (lib/ is committed prebuilt, no local build needed)
dsh plugin --profile <profile> add github:xiaono1/dsh-ov-memory

# Local development install
dsh plugin --profile <profile> add /path/to/dsh-ov-memory
```

The bundle registers itself through its own `cordis.patch.yml` as an isolated cordis group (service realm `ovMemory`).

> Migrating from the official `@openviking/dsh-memory-plugin`? Remove it from the profile's bundles first — both publish under the same `mcp__openviking__*` namespace and must not run together.

## Configuration

Defaults point at `http://127.0.0.1:1933`. Credentials follow the standard OpenViking precedence: `OPENVIKING_*` env → `~/.openviking/ovcli.conf` → `~/.openviking/ov.conf`. To override explicitly, put this in the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: ov-memory
      config:
        - id: ov-memory-runtime
          config:
            endpoint: 'http://127.0.0.1:1933'
            apiKey: 'your-user-key'      # leave empty to use env / ovcli.conf
            account: ''
            user: ''
            recall:
              enabled: true
              budgetTokens: 2000
              scoreFloor: 0.35
              refreshEverySteps: 0
            capture:
              toolResults: false
              skipSubagentSessions: false
            commit:
              thresholdTokens: 20000
              keepRecentCount: 10
```

Common environment variables: `OPENVIKING_URL`, `OPENVIKING_BASE_URL`, `OPENVIKING_API_KEY`, `OPENVIKING_BEARER_TOKEN`, `OPENVIKING_ACCOUNT`, `OPENVIKING_USER`, `OPENVIKING_PEER_ID`, `OPENVIKING_MCP_URL`, `OPENVIKING_PENDING_DIR`.

## How it works

```
DSH agent hooks                  This bundle (in-process)                OpenViking server
─────────────────                ─────────────────                      ──────────────────
agent/session-start ──► ensure session + outbox replay ───► POST /api/v1/sessions
agent/pre-step     ──► recall injection (plugin user msg) ─► POST /api/v1/search/search (mode=context)
session/event      ──► mirror messages ──unreachable──► outbox (persisted) ─replay──► POST .../messages
turn/end           ──► pending_tokens >= threshold → commit
session/flush      ──► teardown commit
Tools mcp__openviking__* ◄── dsh-mcp-client ◄── stdio ── self-written MCP proxy ──► POST /mcp (streamable HTTP)
```

Design notes: [docs/DESIGN.md](docs/DESIGN.md) · Verification cookbook: [docs/E2E.md](docs/E2E.md)

## Relationship to official/community plugins

An independent TypeScript implementation of the behaviour specified by the official `@openviking/dsh-memory-plugin` (no shared code). The automated layers talk to `/api/v1` REST directly; the model-facing tool surface goes through a self-contained minimal MCP stack (stdio server + streamable-HTTP upstream) to `/mcp`. Notable differences:

- TypeScript source with typed modules; the entry exports a schemastery `Config` validated by cordis
- Hand-written minimal MCP implementation; zero runtime npm dependencies
- Outbox handles "delivered but cleanup failed" and foreign queue entries left by other plugins
- Peer ranges include an explicit prerelease branch, so `npm install` never hits a silent ERESOLVE

## Development

```bash
npm ci
npm run typecheck
npm run build       # TypeScript → lib/ (committed)
npm test            # node --test against built-in mock OpenViking servers
```

Tests need no real server: `test/*.test.mjs` spins up in-process `node:http` mocks of the OpenViking REST and MCP endpoints and covers capture, commits, outbox, credential resolution, peer parsing, MCP session/tool calls, and the URI guard.

## License

[MIT](LICENSE)
