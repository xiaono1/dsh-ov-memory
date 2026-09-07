/**
 * Live end-to-end check against a real OpenViking server.
 *
 * Usage (run from the repo root after `npm run build`):
 *   node scripts/e2e-live.mjs
 *
 * Env overrides:
 *   OV_URL   server base (default http://127.0.0.1:1933)
 *   OV_SESSION  session id to use (default dsh-e2e-live)
 *   OV_API_KEY / OV_ACCOUNT / OV_USER / OV_PEER (optional identity)
 *
 * Flow: create session -> append a few messages -> commit (archive all) ->
 * poll the async task -> context-mode search with a differently-worded query.
 * Prints PASS/FAIL lines. Requires the server to be running with a working
 * embedding (and a VLM for extraction, if you want task 'completed').
 */

import { OpenVikingClient } from '../lib/client/openviking.js';

const url = process.env.OV_URL ?? 'http://127.0.0.1:1933';
const sessionId = process.env.OV_SESSION ?? 'dsh-e2e-live';

const client = new OpenVikingClient({
  restUrl: url,
  mcpUrl: `${url}/mcp`,
  credentials: {
    apiKey: process.env.OV_API_KEY ?? '',
    account: process.env.OV_ACCOUNT ?? '',
    user: process.env.OV_USER ?? '',
    peerId: process.env.OV_PEER ?? '',
  },
  serverName: 'openviking',
  timeoutMs: 20000,
  mcpToolCallTimeoutMs: 60000,
  pinnedPeerId: process.env.OV_PEER ?? '',
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// 1. health
try {
  const h = await client.health();
  check('health', h.healthy === true, `v${h.version ?? '?'}`);
} catch (e) {
  check('health', false, e.message);
  process.exitCode = 1;
  process.exit(1);
}

// 2. session + messages
await client.ensureSession(sessionId);
const facts = [
  '我每天早上喝一杯不加糖的柠檬茶，用玻璃杯装，柠檬要现切。',
  '周末我喜欢去郊野公园骑车，最喜欢沿河那一段路线。',
];
for (const fact of facts) {
  await client.addMessage(sessionId, { role: 'user', content: fact });
}
await client.addMessage(sessionId, { role: 'assistant', content: '好的，已记住这些偏好。' });
const info = await client.getSession(sessionId);
check('messages mirrored', (info?.message_count ?? 0) >= facts.length + 1, `message_count=${info?.message_count}`);

// 3. commit + async task
const commit = await client.commitSession(sessionId, 0);
check('commit accepted', commit.status === 'accepted' || commit.status === 'skipped', commit.status);

let task = null;
if (commit.task_id) {
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const res = await fetch(`${url}/api/v1/tasks/${commit.task_id}`);
      const j = await res.json();
      if (j.result && (j.result.status === 'completed' || j.result.status === 'failed')) {
        task = j.result;
        break;
      }
    } catch {
      /* transient */
    }
  }
  const extracted = task?.memories_extracted ?? {};
  check(
    'extraction task',
    task?.status === 'completed',
    task?.status === 'failed' ? (task.error ?? '').slice(0, 200) : `extracted: ${Object.keys(extracted).filter((k) => extracted[k]).join(',')}`,
  );
} else {
  check('extraction task', commit.status === 'skipped', 'nothing to archive');
}

// 4. semantic recall (differently worded query)
try {
  const recall = await client.contextSearch({ query: '我喝早茶的习惯是什么？', purpose: 'chat', maxTokens: 600 });
  const entries = recall.entries ?? [];
  const rendered = recall.rendered ?? '';
  check('semantic recall hits', entries.length > 0, `entries=${entries.length}`);
  check('recall mentions lemon', /柠檬/.test(rendered) || entries.some((e) => /柠檬|柠檬茶/.test(e.text ?? '')), '');
  for (const e of entries.slice(0, 3)) console.log('   hit:', e.uri, '|', (e.text ?? '').slice(0, 80));
} catch (e) {
  check('semantic recall hits', false, e.message);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exitCode = failed > 0 ? 1 : 0;
