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
export type OutboxItemType = 'add-message' | 'commit';
export interface OutboxItem<T = unknown> {
    type: OutboxItemType;
    /** OpenViking session id (`dsh-<session-id>`). */
    sessionId: string;
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
export declare class Outbox {
    readonly dir: string;
    readonly maxRetries: number;
    readonly ttlMs: number;
    private readonly now;
    constructor(opts?: OutboxOptions);
    private hash;
    private fileFor;
    /** True when an item with the same dedup key (any retry count) already exists. */
    has(dedupKey: string): boolean;
    /**
     * Queue a write. Returns false when a duplicate is already queued (dedupe),
     * true when a new file was written.
     */
    enqueue(item: Omit<OutboxItem, 'createdAt' | 'retries'>): boolean;
    private write;
    /** All queued items, oldest first. */
    list(): OutboxItem[];
    /**
     * Replay queued items. Each item is passed to `send`, which may resolve with
     * `'skip'` to leave the item untouched (unknown envelopes), reject to bump
     * the retry counter, or resolve to remove the file. Items that exceeded
     * `maxRetries` or outlived the TTL are dropped.
     */
    replay(send: (item: OutboxItem) => Promise<void | 'skip'>): Promise<{
        replayed: number;
        failed: number;
        dropped: number;
        skipped: number;
    }>;
    /** Delete the file behind an item. */
    remove(item: Pick<OutboxItem, 'dedupKey' | 'retries'>): void;
}
//# sourceMappingURL=outbox.d.ts.map