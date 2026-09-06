---
name: ov-memory
description: >-
  Use this when working with OpenViking (the persistent context database behind
  this agent): searching what you know, recalling earlier sessions, storing
  durable facts, or reading viking:// memory/resource/skill content. Covers
  when to search vs. read, how to tell recall from stored knowledge, and the
  viking:// URI conventions used by the bridged mcp__openviking__* tools.
whenToUse: >-
  The user asks about something from an earlier session or shared history, or
  you need durable knowledge (preferences, decisions, project state) before
  answering; or you want to store something worth remembering, or a viking://
  path appears anywhere in the conversation.
---

# OpenViking Memory (dsh-ov-memory)

This plugin mirrors the session into OpenViking and bridges its full tool
surface under `mcp__openviking__*`. Remembered context is background
reference — the live conversation always wins on conflict.

## When to retrieve

- Before answering "do I know this already" questions, search first. Recalled
  memory is injected automatically at each step; if the injected block already
  answers, use it and skip an extra tool call.
- For a specific stored file, URI, or known string, read or grep the exact
  `viking://` target instead of doing a fuzzy search.
- Durable facts you learn now (preferences, decisions, outcomes) are captured
  automatically; you rarely need to store them by hand.

## viking:// URIs

`viking://` paths are virtual database paths — never local files:

- `viking://~/memories` — your own long-term memory space (preferences,
  entities, events, cases, trajectories, skills).
- `viking://~/resources` — imported documents, URLs, repos.
- `viking://user/<you>/peers/<peer>/memories` — memory scoped to one workspace
  identity ("peer", usually your git origin).

Bridged tools resolve these URIs. Local filesystem and shell tools cannot —
they are guarded and will refuse `viking://` targets.

## Tools

- `mcp__openviking__search` (mode `context`) — assemble a ready-to-use digest
  of what OpenViking knows about a topic; prefer for recall-style questions.
- `mcp__openviking__find` / `search` (list mode) — ranked raw hits to triage
  yourself.
- `mcp__openviking__read` / `list` / `tree` / `grep` / `glob` — browse stored
  content by URI.
- `mcp__openviking__remember` — explicitly store a message into long-term
  memory (server-side extraction runs asynchronously).
- `mcp__openviking__add_resource` — import a local file or URL as durable
  knowledge; ingestion is asynchronous.
- `mcp__openviking__forget` — permanently deletes content. Use it only when the
  user explicitly asks for deletion.
