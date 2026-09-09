import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { OpenVikingClient } from '../lib/client/openviking.js';
import { MemoryRuntime } from '../lib/runtime.js';
import { normalizeConfig } from '../lib/config.js';
import { Outbox } from '../lib/outbox.js';
import { prepareLesson, learnLesson, LEARN_MEMORIES_ROOT } from '../lib/learn.js';
import { MEMLEARN_USAGE, formatMemlearnResult, registerMemlearnCommand } from '../lib/commands.js';

// --- fake OpenViking REST server (find + content/write) --------------------
let server;
let findBody = null;
let findResponse = { memories: [], resources: [], skills: [], total: 0 };
const writes = [];

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
    if (req.method === 'POST' && path === '/api/v1/search/find') {
      findBody = await read();
      return ok(findResponse);
    }
    if (req.method === 'POST' && path === '/api/v1/content/write') {
      const body = await read();
      writes.push(body);
      return ok({ uri: body.uri, mode: body.mode, written_bytes: body.content.length });
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', error: { code: 'NOT_FOUND', message: `no route ${path}` } }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
});
after(() => server.close());
beforeEach(() => {
  findBody = null;
  findResponse = { memories: [], resources: [], skills: [], total: 0 };
  writes.length = 0;
});

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

const DEAD_SETTINGS = {
  restUrl: 'http://127.0.0.1:1',
  mcpUrl: 'http://127.0.0.1:1/mcp',
  credentials: {},
  serverName: 'openviking',
  timeoutMs: 300,
  mcpToolCallTimeoutMs: 500,
  pinnedPeerId: '',
};

describe('learn prepareLesson', () => {
  it('redacts common secret shapes and counts them', () => {
    const prepared = prepareLesson(
      [
        'key is Bearer abcdef0123456789def012',
        'and sk-abcdefghijklmnopqrst123',
        'and ghp_abcdefghijklmnopqrstuv',
        'and AKIAIOSFODNN7EXAMPLE',
        'and xoxb-1234567890abcdefAB',
        '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----',
      ].join('\n'),
    );
    assert.equal(prepared.redacted, 6);
    assert.ok(!prepared.text.includes('Bearer abc'));
    assert.ok(!prepared.text.includes('sk-abc'));
    assert.ok(!prepared.text.includes('ghp_abc'));
    assert.ok(!prepared.text.includes('AKIA'));
    assert.ok(!prepared.text.includes('xoxb'));
    assert.ok(!prepared.text.includes('PRIVATE KEY'));
    assert.ok(prepared.text.includes('[redacted]'));
  });

  it('rejects empty and oversized lessons', () => {
    assert.throws(() => prepareLesson('   '), /empty/);
    assert.throws(() => prepareLesson('x'.repeat(8001)), /8000/);
  });
});

describe('learn learnLesson', () => {
  it('merges into the closest memory above the floor', async () => {
    findResponse = {
      memories: [
        { uri: 'viking://~/memories/deploy.md', score: 0.4 },
        { uri: 'viking://~/memories/deploy-checklist.md', score: 0.82 },
      ],
      resources: [],
      skills: [],
    };
    const client = new OpenVikingClient(liveSettings());
    const attempt = await learnLesson(client, {
      lesson: 'deploy needs a fake server first',
      minScore: 0.5,
    });
    assert.equal(attempt.action, 'merged');
    assert.equal(attempt.uri, 'viking://~/memories/deploy-checklist.md');
    assert.equal(attempt.score, 0.82);
    assert.equal(findBody.target_uri, LEARN_MEMORIES_ROOT);
    assert.equal(findBody.limit, 5);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].uri, 'viking://~/memories/deploy-checklist.md');
    assert.equal(writes[0].content, 'deploy needs a fake server first');
    assert.equal(writes[0].mode, 'append');
  });

  it('writes nothing and reports honestly when no memory is close enough', async () => {
    findResponse = {
      memories: [{ uri: 'viking://~/memories/unrelated.md', score: 0.2 }],
      resources: [],
      skills: [],
    };
    const client = new OpenVikingClient(liveSettings());
    const attempt = await learnLesson(client, { lesson: 'brand new topic', minScore: 0.5 });
    assert.equal(attempt.action, 'no-match');
    assert.equal(writes.length, 0);
    assert.match(attempt.message, /No existing memory/);
  });
});

describe('learn runtime integration', () => {
  it('persists online and reports redaction', async () => {
    findResponse = {
      memories: [{ uri: 'viking://~/memories/k.md', score: 0.9 }],
      resources: [],
      skills: [],
    };
    const runtime = new MemoryRuntime({
      config: normalizeConfig({}),
      settings: liveSettings(),
      client: new OpenVikingClient(liveSettings()),
      logger: console,
    });
    const result = await runtime.learn('the api key sk-abcdefghijklmnopqrst never works');
    assert.equal(result.action, 'merged');
    assert.equal(result.redacted, 1);
    assert.ok(writes[0].content.includes('[redacted]'));
    assert.ok(!writes[0].content.includes('sk-abc'));
  });

  it('queues offline, dedupes repeats and replays at session start', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-learn-'));
    try {
      const offline = new MemoryRuntime({
        config: normalizeConfig({}),
        settings: DEAD_SETTINGS,
        client: new OpenVikingClient(DEAD_SETTINGS),
        outbox: new Outbox({ dir }),
        logger: console,
      });
      const first = await offline.learn('lesson learned while offline');
      assert.equal(first.action, 'queued');
      await offline.learn('lesson learned while offline');
      const queued = offline.outbox.list();
      assert.equal(queued.length, 1);
      assert.equal(queued[0].type, 'learn-append');

      findResponse = {
        memories: [{ uri: 'viking://~/memories/offline.md', score: 0.9 }],
        resources: [],
        skills: [],
      };
      const online = new MemoryRuntime({
        config: normalizeConfig({}),
        settings: liveSettings(),
        client: new OpenVikingClient(liveSettings()),
        outbox: new Outbox({ dir }),
        logger: console,
      });
      await online.replayOutbox();
      assert.equal(writes.length, 1);
      assert.equal(writes[0].content, 'lesson learned while offline');
      assert.equal(writes[0].mode, 'append');
      assert.equal(online.outbox.list().length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drops a queued lesson whose merge target vanished by replay time', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ov-learn-'));
    try {
      const offline = new MemoryRuntime({
        config: normalizeConfig({}),
        settings: DEAD_SETTINGS,
        client: new OpenVikingClient(DEAD_SETTINGS),
        outbox: new Outbox({ dir }),
        logger: console,
      });
      await offline.learn('a lesson with no home');
      const online = new MemoryRuntime({
        config: normalizeConfig({}),
        settings: liveSettings(),
        client: new OpenVikingClient(liveSettings()),
        outbox: new Outbox({ dir }),
        logger: console,
      });
      // findResponse defaults to no memories → no-match → dropped, not retried
      await online.replayOutbox();
      assert.equal(writes.length, 0);
      assert.equal(online.outbox.list().length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('memlearn command', () => {
  function captureRegistration() {
    const registered = [];
    const ctxLike = {
      inject: (services, callback) => {
        assert.deepEqual(services, ['commands']);
        callback({ commands: { register: (def) => { registered.push(def); return () => {}; } } });
      },
    };
    return { ctxLike, registered };
  }

  it('registers via optional injection with recordInput disabled', () => {
    const { ctxLike, registered } = captureRegistration();
    registerMemlearnCommand(ctxLike, {
      learn: async () => ({ action: 'merged', uri: 'u', redacted: 0, message: 'm' }),
    });
    const def = registered[0];
    assert.equal(def.name, 'memlearn');
    assert.equal(def.recordInput, false);
    assert.ok(def.description.length > 0);
    assert.ok(def.input.hint.includes('lesson'));
  });

  it('no-ops on hosts without command support', () => {
    assert.doesNotThrow(() => registerMemlearnCommand({}, { learn: async () => null }));
  });

  it('returns usage for empty input and a formatted result otherwise', async () => {
    const { ctxLike, registered } = captureRegistration();
    const lessons = [];
    registerMemlearnCommand(ctxLike, {
      learn: async (lesson) => {
        lessons.push(lesson);
        return {
          action: 'merged',
          uri: 'viking://~/memories/x.md',
          score: 0.71,
          redacted: 2,
          message: 'merged ok',
        };
      },
    });
    const def = registered[0];

    const empty = await def.handler({ rawInput: '   ' });
    assert.equal(empty.kind, 'error');
    assert.equal(empty.text, MEMLEARN_USAGE);

    const ok = await def.handler({ rawInput: '  deploy needs a fake server  ' });
    assert.equal(ok.kind, 'success');
    assert.deepEqual(lessons, ['deploy needs a fake server']);
    assert.match(ok.text, /Learned: merged/);
    assert.match(ok.text, /score: 0\.71/);
    assert.match(ok.text, /redacted: 2 secret/);
    assert.match(ok.text, /viking:\/\/~\/memories\/x\.md/);
  });

  it('reports failures without persisting anything', async () => {
    const { ctxLike, registered } = captureRegistration();
    registerMemlearnCommand(ctxLike, {
      learn: async () => {
        throw new Error('server said no');
      },
    });
    const result = await registered[0].handler({ rawInput: 'x' });
    assert.equal(result.kind, 'error');
    assert.match(result.text, /failed: server said no/);
    assert.match(result.text, /nothing was persisted/i);
  });

  it('formats queued results with outbox guidance', () => {
    const text = formatMemlearnResult({
      action: 'queued',
      uri: '',
      redacted: 1,
      message: 'OpenViking is unreachable — the lesson was queued locally.',
    });
    assert.match(text, /Learned: queued/);
    assert.match(text, /outbox/);
  });
});
