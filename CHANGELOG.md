# Changelog

## 0.1.0 (unreleased)

- Original TypeScript implementation of the DSH ↔ OpenViking memory bundle.
- Agent hooks: session-start profile/inject + outbox replay, pre-step recall,
  session-event capture, threshold commit at turn end, flush commit.
- Self-contained minimal MCP stack (stdio server + streamable-HTTP upstream,
  stale-session re-init, tool-list change announce).
- REST client for `/api/v1` (sessions, messages, commit, context search,
  content read, fs ls) with typed envelope errors.
- `/memlearn` slash command: human lesson channel — secret redaction, semantic
  dedupe-merge into the closest existing memory (`search/find` +
  `content/write` append), honest no-match refusal, offline queueing through
  the outbox (`learn-append` items replay at session start).
- Offline-first durable outbox with content-hash dedupe, retry bump and TTL
  pruning.
- viking:// URI guard for local tools, isolated skill provider (`ov-memory`).
- Tests: unit + mock-server integration (`node --test`), GitHub Actions CI.
