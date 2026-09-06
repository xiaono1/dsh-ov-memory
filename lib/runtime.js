/**
 * Per-profile runtime that wires capture, recall, commit and the outbox
 * together. The hook layer (index.ts) translates DSH events into calls on this
 * class; keeping the runtime free of DSH types makes it directly unit-testable.
 */
import { createHash } from 'node:crypto';
import { resolvePeer } from './peer.js';
import { Outbox } from './outbox.js';
import { OpenVikingClient } from './client/openviking.js';
import { openvikingSessionId, isSubagentSession } from './session.js';
import { captureEvent } from './capture.js';
import { buildProfileText, buildRecallText } from './recall.js';
export class MemoryRuntime {
    config;
    settings;
    client;
    outbox;
    logger;
    actorPeerId;
    sessionDir;
    recentQueries = new Map();
    stepCounters = new Map();
    injectedUris = new Map();
    pendingFlush = new Set();
    constructor(options) {
        this.config = options.config;
        this.settings = options.settings;
        this.client = options.client;
        this.outbox = options.outbox ?? new Outbox();
        this.logger = options.logger ?? { log: () => { }, warn: () => { }, error: () => { } };
        const peer = resolvePeer({
            explicit: this.settings.pinnedPeerId || undefined,
            cwd: options.cwd ?? process.cwd(),
        });
        this.actorPeerId = peer.peerId ?? undefined;
        this.sessionDir = this.outbox.dir;
        void this.sessionDir;
    }
    /** Peer used for all session-specific requests of this profile. */
    get peer() {
        return { actorPeerId: this.actorPeerId };
    }
    /** True when this session should be excluded from capture/commit. */
    shouldSkip(session) {
        return this.config.capture.skipSubagentSessions && isSubagentSession(session);
    }
    /**
     * OpenViking session id for a DSH session (dsh-<session-id>).
     */
    ovSessionId(dshSessionId) {
        return openvikingSessionId(dshSessionId);
    }
    /** Create the mirror session; tolerates an existing one. */
    async ensureSession(dshSessionId) {
        const sid = this.ovSessionId(dshSessionId);
        try {
            await this.client.getSession(sid, this.actorPeerId);
        }
        catch {
            /* fall through to create */
        }
        try {
            await this.client.ensureSession(sid, this.actorPeerId);
        }
        catch (err) {
            const status = err.httpStatus;
            if (status !== 409)
                this.logger.warn(`ensure session failed: ${err.message}`);
        }
    }
    /**
     * Replay the outbox (called once per agent session start). Writes that could
     * not reach the server earlier are sent now, in order, idempotently.
     */
    async replayOutbox() {
        try {
            const stats = await this.outbox.replay(async (item) => {
                if (item.type === 'add-message') {
                    const payload = item.payload;
                    await this.client.addMessage(item.sessionId, payload, payload.peerId || this.actorPeerId);
                }
                else {
                    const payload = item.payload;
                    await this.client.commitSession(item.sessionId, payload.keepRecentCount ?? this.config.commit.keepRecentCount, payload.peerId || this.actorPeerId);
                }
            });
            if (stats.replayed > 0 || stats.failed > 0) {
                this.logger.log(`outbox replay: ${JSON.stringify(stats)}`);
            }
        }
        catch (err) {
            this.logger.warn(`outbox replay aborted: ${err.message}`);
        }
    }
    /** Build and inject the session-start profile/index, returning its text. */
    async profileText() {
        try {
            return await buildProfileText(this.client, this.config, {
                actorPeerId: this.actorPeerId,
            });
        }
        catch (err) {
            this.logger.warn(`profile lookup skipped: ${err.message}`);
            return null;
        }
    }
    /**
     * Recall for one agent step. Returns recall text or null. Only fires when the
     * driving user query changed since the last injection, or when the configured
     * refresh cadence is reached.
     */
    async recallTextForStep(dshSessionId, query) {
        if (!this.config.recall.enabled)
            return null;
        const trimmed = query.trim();
        if (!trimmed)
            return null;
        const key = dshSessionId ?? '<global>';
        const previous = this.recentQueries.get(key) ?? '';
        const steps = (this.stepCounters.get(key) ?? 0) + 1;
        this.stepCounters.set(key, steps);
        const changed = previous !== trimmed;
        const cadence = this.config.recall.refreshEverySteps;
        const due = changed || (cadence > 0 && steps % cadence === 0);
        if (!due && previous !== '')
            return null;
        try {
            const ovSession = dshSessionId ? this.ovSessionId(dshSessionId) : '';
            const text = await buildRecallText(this.client, this.config, {
                query: trimmed,
                ovSessionId: ovSession,
                actorPeerId: this.actorPeerId,
                excludeUris: this.injectedUris.get(key),
            });
            if (!text)
                return null;
            this.recentQueries.set(key, trimmed);
            // Remember URIs mentioned so later steps don't re-inject the same items.
            const uris = extractVikingUris(text);
            const prior = this.injectedUris.get(key) ?? [];
            this.injectedUris.set(key, [...prior, ...uris].slice(-200));
            return text;
        }
        catch (err) {
            this.logger.warn(`recall skipped: ${err.message}`);
            return null;
        }
    }
    /**
     * Capture one session event into the mirror stream. Returns the captured
     * message, or null when nothing was captured. Network failures are queued to
     * the outbox instead of thrown.
     */
    async captureEvent(session, event) {
        if (!this.config.capture.syncTurns)
            return null;
        if (this.shouldSkip(session))
            return null;
        const captured = captureEvent(event, {
            ownPluginSource: 'ov-memory',
            toolResults: this.config.capture.toolResults,
        });
        if (!captured)
            return null;
        const sid = this.ovSessionId(session.id);
        const dedupKey = `${sid}|${captured.role}|${captured.messageId ?? hashText(captured.text)}`;
        try {
            await this.client.addMessage(sid, { role: captured.role === 'tool' ? 'user' : captured.role, content: captured.text }, this.actorPeerId);
        }
        catch (err) {
            if (this.client.isRetryable(err)) {
                this.outbox.enqueue({
                    type: 'add-message',
                    sessionId: sid,
                    payload: {
                        role: captured.role === 'tool' ? 'user' : captured.role,
                        content: captured.text,
                        peerId: this.actorPeerId,
                    },
                    dedupKey,
                });
                this.logger.log(`capture queued to outbox (${sid})`);
            }
            else {
                this.logger.warn(`capture dropped (non-retryable): ${err.message}`);
            }
        }
        return captured;
    }
    /**
     * Threshold commit check, called at turn end. Commits when the server reports
     * pending_tokens >= threshold.
     */
    async maybeCommit(session) {
        if (!this.config.commit.enabled || !this.config.capture.syncTurns)
            return null;
        if (this.shouldSkip(session))
            return null;
        const sid = this.ovSessionId(session.id);
        try {
            const info = await this.client.getSession(sid, this.actorPeerId);
            const pending = info?.pending_tokens ?? 0;
            if (pending >= this.config.commit.thresholdTokens) {
                const result = await this.commitOnce(sid);
                this.pendingFlush.clear();
                return result;
            }
            return null;
        }
        catch (err) {
            this.logger.warn(`commit check skipped: ${err.message}`);
            return null;
        }
    }
    /** Final commit at session flush / teardown (server skips when idle). */
    async flushCommit(session) {
        if (!this.config.commit.enabled || !this.config.commit.teardown)
            return;
        if (!this.config.capture.syncTurns)
            return;
        if (this.shouldSkip(session))
            return;
        const sid = this.ovSessionId(session.id);
        try {
            await this.commitOnce(sid);
        }
        catch (err) {
            if (this.client.isRetryable(err)) {
                this.outbox.enqueue({
                    type: 'commit',
                    sessionId: sid,
                    payload: {
                        keepRecentCount: this.config.commit.keepRecentCount,
                        peerId: this.actorPeerId,
                    },
                    dedupKey: `${sid}|commit|flush`,
                });
            }
            else {
                this.logger.warn(`flush commit failed: ${err.message}`);
            }
        }
    }
    async commitOnce(sid) {
        return this.client.commitSession(sid, this.config.commit.keepRecentCount, this.actorPeerId);
    }
    dispose() {
        this.recentQueries.clear();
        this.stepCounters.clear();
        this.injectedUris.clear();
        this.pendingFlush.clear();
    }
}
function hashText(text) {
    return createHash('sha256').update(text).digest('hex').slice(0, 16);
}
function extractVikingUris(text) {
    const uris = [];
    for (const match of text.matchAll(/viking:\/\/[^\s"'`<>]+/g))
        uris.push(match[0]);
    return uris;
}
//# sourceMappingURL=runtime.js.map