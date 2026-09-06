import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { OpenVikingClient } from '../lib/client/openviking.js';
import { MemoryRuntime } from '../lib/runtime.js';
import { normalizeConfig } from '../lib/config.js';
import { Outbox } from '../lib/outbox.js';

// Minimal fake server mirroring the REST routes the runtime uses.
let server;
const store = new Map();

before(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    const read = () =>
      new Promise((resolve) => {
        let data = '';
        req.on('data', (c) => (data += c));
        req.on('end', () => resolve(data ? JSON.parse(data) : {}));
      });
    const ok = (result) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', result }));
    };
    if (req.method === 'POST' && path === '/api/v1/sessions') {
      const b = await read();
      store.set(b.session_id, { session_id: b.session_id, pending_tokens: 0 });
      return ok({ session_id: b.session_id });
    }
    const m = /^\/api\/v1\/sessions\/([^/]+)$/.exec(path);
    if (req.method === 'GET' && m) {
      const s = store.get(decodeURIComponent(m[1]));
      if (!s) {
        res.writeHead(404, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ status: 'error', error: { code: 'NOT_FOUND', message: 'x' } }));
      }
      return ok({ ...s });
    }
    const a = /^\/api\/v1\/sessions\/([^/]+)\/messages$/.exec(path);
    if (req.method === 'POST' && a) {
      const b = await read();
      const sid = decodeURIComponent(a[1]);
      const s = store.get(sid) ?? { session_id: sid, pending_tokens: 0 };
      s.pending_tokens += b.content.length;
      store.set(sid, s);
      return ok({ session_id: sid, message_count: 1 });
    }
    const c = /^\/api\/v1\/sessions\/([^/]+)\/commit$/.exec(path);
    if (req.method === 'POST' && c) {
      const b = await read();
      const sid = decodeURIComponent(c[1]);
      const s = store.get(sid) ?? { session_id: sid };
      s.pending_tokens = b.keep_recent_count ?? 0;
      store.set(sid, s);
      return ok({ status: 'accepted', task_id: 't' });
    }
    res.writeHead(404);
    res.end('{}');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
});
after(() => server.close());
beforeEach(() => store.clear());

function liveSettings() {
  return {
    restUrl: `http://127.0.0.1:${server.address().port}`,
    mcpUrl: `http://127.0.0.1:${server.address().port}/mcp`,
    credentials: {},
    serverName: 'openviking',
    timeoutMs: 2000,
    mcpToolCallTimeoutMs: 5000,
    pinnedPeerId: '',
  };
}

function deadSettings() {
  return {
    restUrl: 'http://127.0.0.1:1',
    mcpUrl: 'http://127.0.0.1:1/mcp',
    credentials: {},
    serverName: 'openviking',
    timeoutMs: 300,
    mcpToolCallTimeoutMs: 500,
    pinnedPeerId: '',
  };
}

const SESSION = { id: 'sess-a' };
const LONG_TEXT = `remember that I like tea\n${'x'.repeat(1200)}`;
const USER_EVENT = {
  type: 'user/message',
  data: { id: 'm1', role: 'user', content: [{ type: 'text', text: LONG_TEXT }] },
};

describe('runtime capture + commit', () => {
  it('captures a message into the mirror session and commits past threshold', async () => {
    const config = normalizeConfig({
      commit: { thresholdTokens: 1000, keepRecentCount: 2 },
    });
    const runtime = new MemoryRuntime({
      config,
      settings: liveSettings(),
      client: new OpenVikingClient(liveSettings()),
      logger: console,
    });
    await runtime.ensureSession('sess-a');
    const captured = await runtime.captureEvent(SESSION, USER_EVENT);
    assert.ok(captured);
    assert.equal(captured.role, 'user');
    const before = store.get('dsh-sess-a');
    assert.ok(before.pending_tokens >= 24);
    await runtime.maybeCommit(SESSION);
    const after = store.get('dsh-sess-a');
    assert.equal(after.pending_tokens, 2);
    runtime.dispose();
  });

  it('queues writes to the outbox when the server is unreachable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-runtime-'));
    const outbox = new Outbox({ dir, maxRetries: 2 });
    const runtime = new MemoryRuntime({
      config: normalizeConfig({}),
      settings: deadSettings(),
      client: new OpenVikingClient(deadSettings()),
      outbox,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
    const captured = await runtime.captureEvent(SESSION, USER_EVENT);
    assert.ok(captured);
    assert.equal(outbox.list().length, 1);
    assert.equal(outbox.list()[0].type, 'add-message');
    runtime.dispose();
  });

  it('replays the outbox against a live server', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-runtime2-'));
    const outbox = new Outbox({ dir, maxRetries: 2 });
    const dead = new MemoryRuntime({
      config: normalizeConfig({}),
      settings: deadSettings(),
      client: new OpenVikingClient(deadSettings()),
      outbox,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
    await dead.captureEvent(SESSION, USER_EVENT);
    assert.equal(outbox.list().length, 1);
    dead.dispose();

    const live = new MemoryRuntime({
      config: normalizeConfig({}),
      settings: liveSettings(),
      client: new OpenVikingClient(liveSettings()),
      outbox,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
    await live.replayOutbox();
    assert.equal(outbox.list().length, 0);
    const s = store.get('dsh-sess-a');
    assert.ok(s && s.pending_tokens > 0);
    live.dispose();
  });

  it('skips subagent sessions when configured', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-runtime3-'));
    const outbox = new Outbox({ dir });
    const runtime = new MemoryRuntime({
      config: normalizeConfig({ capture: { skipSubagentSessions: true } }),
      settings: liveSettings(),
      client: new OpenVikingClient(liveSettings()),
      outbox,
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
    const subagent = { id: 'sub-1', header: { origin: 'subagent' } };
    const captured = await runtime.captureEvent(subagent, USER_EVENT);
    assert.equal(captured, null);
    assert.equal(outbox.list().length, 0);
    runtime.dispose();
  });
});
