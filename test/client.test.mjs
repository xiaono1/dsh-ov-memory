import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { OpenVikingClient, OpenVikingApiError } from '../lib/client/openviking.js';

// --- fake OpenViking REST server -------------------------------------------
const sessions = new Map();
let searchBody = null;
let server;

function json(res, code, payload) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
  });
}

before(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    if (req.method === 'POST' && path === '/api/v1/sessions') {
      const body = await readBody(req);
      sessions.set(body.session_id, { session_id: body.session_id, pending_tokens: 10 });
      return json(res, 200, { status: 'ok', result: { session_id: body.session_id } });
    }
    const sessionMatch = /^\/api\/v1\/sessions\/([^/]+)$/.exec(path);
    if (req.method === 'GET' && sessionMatch) {
      const sid = decodeURIComponent(sessionMatch[1]);
      if (!sessions.has(sid)) return json(res, 404, { status: 'error', error: { code: 'NOT_FOUND', message: 'no' } });
      const s = sessions.get(sid);
      return json(res, 200, { status: 'ok', result: { ...s } });
    }
    const msgMatch = /^\/api\/v1\/sessions\/([^/]+)\/messages$/.exec(path);
    if (req.method === 'POST' && msgMatch) {
      const body = await readBody(req);
      assert.ok(body.role === 'user' || body.role === 'assistant');
      assert.equal(typeof body.content, 'string');
      const sid = decodeURIComponent(msgMatch[1]);
      const s = sessions.get(sid) ?? { session_id: sid, pending_tokens: 0 };
      s.pending_tokens += body.content.length;
      sessions.set(sid, s);
      return json(res, 200, { status: 'ok', result: { session_id: sid, message_count: 1 } });
    }
    const commitMatch = /^\/api\/v1\/sessions\/([^/]+)\/commit$/.exec(path);
    if (req.method === 'POST' && commitMatch) {
      const body = await readBody(req);
      const sid = decodeURIComponent(commitMatch[1]);
      const s = sessions.get(sid) ?? { session_id: sid };
      s.pending_tokens = body.keep_recent_count ?? 0;
      sessions.set(sid, s);
      return json(res, 200, { status: 'ok', result: { status: 'accepted', task_id: 'task-1' } });
    }
    if (req.method === 'POST' && path === '/api/v1/search/search') {
      searchBody = await readBody(req);
      return json(res, 200, {
        status: 'ok',
        result: {
          entries: [{ uri: 'viking://~/memories/preferences/x.md', category: 'preferences', text: 'likes iced tea', score: 0.9 }],
          rendered: '<memory uri="viking://~/memories/preferences/x.md" type="preferences" score="0.9">likes iced tea</memory>',
          digest: '',
          stats: { used_tokens: 120, rewrite: 'off', dedup: { skipped: 0 }, retrieval_errors: 0 },
        },
      });
    }
    if (req.method === 'GET' && path === '/api/v1/content/read') {
      return json(res, 200, { status: 'ok', result: '# Profile\nbuilder of things' });
    }
    if (req.method === 'GET' && path === '/api/v1/fs/ls') {
      return json(res, 200, {
        status: 'ok',
        result: [
          { name: 'preferences', size: 0, isDir: true, uri: 'viking://~/memories/preferences' },
          { name: 'entities', size: 0, isDir: true, uri: 'viking://~/memories/entities' },
        ],
      });
    }
    if (req.method === 'GET' && path === '/api/v1/denied') {
      return json(res, 403, { status: 'error', error: { code: 'PERMISSION_DENIED', message: 'no' } });
    }
    return json(res, 404, { status: 'error', error: { code: 'NOT_FOUND', message: `no route ${req.method} ${path}` } });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
});

after(() => server.close());

function makeClient() {
  const port = server.address().port;
  return new OpenVikingClient({
    restUrl: `http://127.0.0.1:${port}`,
    mcpUrl: `http://127.0.0.1:${port}/mcp`,
    credentials: { url: `http://127.0.0.1:${port}`, apiKey: 'test-key' },
    serverName: 'openviking',
    timeoutMs: 3000,
    mcpToolCallTimeoutMs: 5000,
    pinnedPeerId: '',
  });
}

describe('client session lifecycle', () => {
  it('creates, appends and commits a session with pending-token tracking', async () => {
    const client = makeClient();
    const base = new URL('http://x');
    void base;
    await client.ensureSession('dsh-s1');
    await client.addMessage('dsh-s1', { role: 'user', content: 'hello world' });
    const info = await client.getSession('dsh-s1');
    assert.equal(info.pending_tokens, 21); // 11 + 10 seed... see below
    await client.commitSession('dsh-s1', 3);
    const after = await client.getSession('dsh-s1');
    assert.equal(after.pending_tokens, 3);
  });
});

describe('client search context mode', () => {
  it('sends the documented body and returns injection-ready entries', async () => {
    const client = makeClient();
    const result = await client.contextSearch({
      query: 'what do I prefer?',
      sessionId: 'dsh-s2',
      purpose: 'chat',
      dedupTurns: 5,
      scoreThreshold: 0.2,
    });
    assert.equal(searchBody.mode, 'context');
    assert.equal(searchBody.query, 'what do I prefer?');
    assert.equal(searchBody.session_id, 'dsh-s2');
    assert.equal(searchBody.dedup_turns, 5);
    assert.equal(searchBody.score_threshold, 0.2);
    assert.ok(result.entries.length >= 1);
    assert.match(result.rendered, /iced tea/);
  });
});

describe('client errors', () => {
  it('returns undefined for a missing session (auto-create later handles it)', async () => {
    const client = makeClient();
    const missing = await client.getSession('nope-not-exist');
    assert.equal(missing, undefined);
  });

  it('maps envelope errors to typed failures with code and httpStatus', async () => {
    // exercise the shared request pipeline against an error envelope route
    const { requestJson, OpenVikingApiError } = await import('../lib/client/http.js');
    const client = makeClient();
    const port = server.address().port;
    await assert.rejects(
      () =>
        requestJson({
          baseUrl: `http://127.0.0.1:${port}`,
          path: '/api/v1/denied',
          timeoutMs: 2000,
        }),
      (err) => {
        assert.ok(err instanceof OpenVikingApiError);
        assert.equal(err.httpStatus, 403);
        assert.equal(err.isTransport, false);
        assert.equal(err.code, 'PERMISSION_DENIED');
        return true;
      },
    );
    assert.ok(client);
  });

  it('treats transport failures as retryable', async () => {
    const client = new OpenVikingClient({
      restUrl: 'http://127.0.0.1:1',
      mcpUrl: 'http://127.0.0.1:1/mcp',
      credentials: {},
      serverName: 'openviking',
      timeoutMs: 300,
      mcpToolCallTimeoutMs: 500,
      pinnedPeerId: '',
    });
    const err = await client.health().then(
      () => null,
      (e) => e,
    );
    assert.ok(err);
    assert.equal(client.isRetryable(err), true);
  });
});
