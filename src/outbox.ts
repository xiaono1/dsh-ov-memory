/**
 * Durable offline outbox for writes that failed while the OpenViking server
 * was unreachable.
 *
 * Every queued item is one JSON file. Files are written atomically
 * (temp file + rename) and named after a content hash so replay is idempotent:
 * enqueueing the same logical write twice collapses to one file. On replay
 * failures the item is renamed with an incremented retry counter, and files
 * older than the TTL are pruned. No long-running worker is involved — replay
 * happens at session start, when the server is most likely reachable again.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export type OutboxItemType = 'add-message' | 'commit' | 'learn-append';

export interface OutboxItem<T = unknown> {
  type: OutboxItemType;
  /** OpenViking session id (`dsh-<session-id>`); user-scoped writes omit it. */
  sessionId?: string;
  /** Wire payload for the corresponding REST call. */
  payload: T;
  createdAt: number;
  retries: number;
  /** Content-derived identity used for idempotent dedupe. */
  dedupKey: string;
}

export interface OutboxOptions {
  dir?: string;
  maxRetries?: number;
  ttlDays?: number;
  now?: () => number;
}

export class Outbox {
  readonly dir: string;
  readonly maxRetries: number;
  readonly ttlMs: number;
  private readonly now: () => number;

  constructor(opts: OutboxOptions = {}) {
    this.dir =
      opts.dir ??
      process.env.OPENVIKING_PENDING_DIR ??
      join(homedir(), '.openviking', 'pending');
    this.maxRetries = opts.maxRetries ?? 3;
    this.ttlMs = (opts.ttlDays ?? 7) * 86_400_000;
    this.now = opts.now ?? Date.now;
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
  }

  private hash(dedupKey: string): string {
    return createHash('sha256').update(dedupKey).digest('hex').slice(0, 24);
  }

  private fileFor(item: Pick<OutboxItem, 'dedupKey' | 'retries'>): string {
    return join(this.dir, `${this.hash(item.dedupKey)}_${item.retries}.json`);
  }

  /** True when an item with the same dedup key (any retry count) already exists. */
  has(dedupKey: string): boolean {
    const prefix = `${this.hash(dedupKey)}_`;
    return readdirSync(this.dir).some((name) => name.startsWith(prefix));
  }

  /**
   * Queue a write. Returns false when a duplicate is already queued (dedupe),
   * true when a new file was written.
   */
  enqueue(item: Omit<OutboxItem, 'createdAt' | 'retries'>): boolean {
    if (this.has(item.dedupKey)) return false;
    this.write({
      ...item,
      createdAt: this.now(),
      retries: 0,
    });
    return true;
  }

  private write(full: OutboxItem): void {
    const tmp = join(this.dir, `.tmp-${process.pid}-${this.hash(full.dedupKey)}`);
    writeFileSync(tmp, `${JSON.stringify(full, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, this.fileFor(full));
  }

  /** All queued items, oldest first. */
  list(): OutboxItem[] {
    return readdirSync(this.dir)
      .filter((name) => name.endsWith('.json') && !name.startsWith('.tmp'))
      .map((name) => {
        try {
          return JSON.parse(readFileSync(join(this.dir, name), 'utf8')) as OutboxItem;
        } catch {
          return null;
        }
      })
      .filter((item): item is OutboxItem => item !== null)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Replay queued items. Each item is passed to `send`, which may resolve with
   * `'skip'` to leave the item untouched (unknown envelopes), reject to bump
   * the retry counter, or resolve to remove the file. Items that exceeded
   * `maxRetries` or outlived the TTL are dropped.
   */
  async replay(
    send: (item: OutboxItem) => Promise<void | 'skip'>,
  ): Promise<{ replayed: number; failed: number; dropped: number; skipped: number }> {
    const stats = { replayed: 0, failed: 0, dropped: 0, skipped: 0 };
    const ttlFloor = this.now() - this.ttlMs;
    for (const item of this.list()) {
      if (item.createdAt < ttlFloor || item.retries > this.maxRetries) {
        this.remove(item);
        stats.dropped += 1;
        continue;
      }
      try {
        const outcome = await send(item);
        if (outcome === 'skip') {
          stats.skipped += 1;
          continue;
        }
        try {
          this.remove(item);
        } catch {
          // Best-effort cleanup: an undeliverable removal (locked file, unusual
          // permissions) must not be mistaken for a failed send — the payload
          // was already delivered, so re-queueing it would duplicate it.
        }
        stats.replayed += 1;
      } catch {
        const current = this.fileFor(item);
        item.retries += 1;
        if (item.retries > this.maxRetries) {
          try {
            this.remove({ ...item, retries: item.retries - 1 } as OutboxItem);
          } catch {
            /* best-effort drop */
          }
          stats.dropped += 1;
        } else if (existsSync(current)) {
          // Rewrite under the next retry slot (filename and content agree).
          try {
            this.write(item);
            rmSync(current, { force: true });
          } catch {
            /* best-effort bump */
          }
          stats.failed += 1;
        } else {
          this.write(item);
          stats.failed += 1;
        }
      }
    }
    return stats;
  }

  /** Delete the file behind an item. */
  remove(item: Pick<OutboxItem, 'dedupKey' | 'retries'>): void {
    const file = this.fileFor(item);
    if (existsSync(file)) rmSync(file, { force: true });
  }
}
