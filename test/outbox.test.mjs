import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Outbox } from '../lib/outbox.js';

let dir;
let box;
let clock;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ov-outbox-'));
  clock = 1_700_000_000_000;
  box = new Outbox({ dir, now: () => clock });
});

describe('outbox', () => {
  it('writes files atomically and lists oldest first', () => {
    box.enqueue({ type: 'add-message', sessionId: 'dsh-1', payload: { a: 1 }, dedupKey: 'm1' });
    clock += 1000;
    box.enqueue({ type: 'commit', sessionId: 'dsh-1', payload: { b: 2 }, dedupKey: 'm2' });
    const items = box.list();
    assert.equal(items.length, 2);
    assert.equal(items[0].dedupKey, 'm1');
    assert.equal(items[1].dedupKey, 'm2');
  });

  it('dedupes identical writes', () => {
    assert.equal(
      box.enqueue({ type: 'add-message', sessionId: 'dsh-1', payload: { x: 1 }, dedupKey: 'same' }),
      true,
    );
    assert.equal(
      box.enqueue({ type: 'add-message', sessionId: 'dsh-1', payload: { x: 1 }, dedupKey: 'same' }),
      false,
    );
    assert.equal(box.list().length, 1);
  });

  it('replays successfully and removes the file', async () => {
    box.enqueue({ type: 'add-message', sessionId: 'dsh-1', payload: { x: 1 }, dedupKey: 'k' });
    const stats = await box.replay(async () => {});
    assert.deepEqual(stats, { replayed: 1, failed: 0, dropped: 0, skipped: 0 });
    assert.equal(box.list().length, 0);
  });

  it('bumps retries on failure and drops past maxRetries', async () => {
    const box2 = new Outbox({ dir, maxRetries: 1, now: () => clock });
    box2.enqueue({ type: 'add-message', sessionId: 'dsh-1', payload: {}, dedupKey: 'k' });
    await box2.replay(async () => {
      throw new Error('server down');
    });
    assert.equal(box2.list().length, 1);
    assert.equal(box2.list()[0].retries, 1);
    const stats = await box2.replay(async () => {
      throw new Error('still down');
    });
    assert.equal(stats.dropped, 1);
    assert.equal(box2.list().length, 0);
  });

  it('prunes items older than the TTL', async () => {
    box.enqueue({ type: 'commit', sessionId: 'dsh-1', payload: {}, dedupKey: 'old' });
    clock += 8 * 86_400_000; // 8 days later
    box.enqueue({ type: 'commit', sessionId: 'dsh-1', payload: {}, dedupKey: 'new' });
    const stats = await box.replay(async () => {});
    assert.equal(stats.replayed, 1); // only the fresh one is replayed
    assert.equal(stats.dropped, 1);
  });

  it('persists items as JSON files on disk', () => {
    box.enqueue({ type: 'commit', sessionId: 'dsh-9', payload: { n: 42 }, dedupKey: 'persist' });
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 1);
    const saved = JSON.parse(readFileSync(join(dir, files[0]), 'utf8'));
    assert.equal(saved.sessionId, 'dsh-9');
    assert.equal(saved.payload.n, 42);
  });

  it('leaves items untouched when send resolves skip', async () => {
    box.enqueue({ type: 'unknown-thing', sessionId: 'dsh-x', payload: {}, dedupKey: 'skipme' });
    const stats = await box.replay(async () => 'skip');
    assert.deepEqual(stats, { replayed: 0, failed: 0, dropped: 0, skipped: 1 });
    assert.equal(box.list().length, 1);
  });
});
