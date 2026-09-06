/**
 * Per-profile runtime that wires capture, recall, commit and the outbox
 * together. The hook layer (index.ts) translates DSH events into calls on this
 * class; keeping the runtime free of DSH types makes it directly unit-testable.
 */
import type { Logger } from './types.js';
import type { ResolvedConfig } from './config.js';
import type { EffectiveSettings } from './settings.js';
import { Outbox } from './outbox.js';
import { OpenVikingClient } from './client/openviking.js';
import type { CommitResult } from './client/openviking.js';
import type { SessionLike } from './session.js';
import type { CapturedMessage, EventLike } from './capture.js';
export interface RuntimeOptions {
    config: ResolvedConfig;
    settings: EffectiveSettings;
    client: OpenVikingClient;
    outbox?: Outbox;
    logger?: Logger;
    /** Workspace used to derive the actor peer when not pinned. */
    cwd?: string;
}
export interface PeerContext {
    /** Peer id to send, or undefined for user-level writes. */
    actorPeerId: string | undefined;
}
export declare class MemoryRuntime {
    readonly config: ResolvedConfig;
    readonly settings: EffectiveSettings;
    readonly client: OpenVikingClient;
    readonly outbox: Outbox;
    readonly logger: Logger;
    private readonly actorPeerId;
    private readonly sessionDir;
    private readonly recentQueries;
    private readonly stepCounters;
    private readonly injectedUris;
    private readonly pendingFlush;
    constructor(options: RuntimeOptions);
    /** Peer used for all session-specific requests of this profile. */
    get peer(): PeerContext;
    /** True when this session should be excluded from capture/commit. */
    shouldSkip(session: SessionLike): boolean;
    /**
     * OpenViking session id for a DSH session (dsh-<session-id>).
     */
    ovSessionId(dshSessionId: string): string;
    /** Create the mirror session; tolerates an existing one. */
    ensureSession(dshSessionId: string): Promise<void>;
    /**
     * Replay the outbox (called once per agent session start). Writes that could
     * not reach the server earlier are sent now, in order, idempotently.
     */
    replayOutbox(): Promise<void>;
    /** Build and inject the session-start profile/index, returning its text. */
    profileText(): Promise<string | null>;
    /**
     * Recall for one agent step. Returns recall text or null. Only fires when the
     * driving user query changed since the last injection, or when the configured
     * refresh cadence is reached.
     */
    recallTextForStep(dshSessionId: string | undefined, query: string): Promise<string | null>;
    /**
     * Capture one session event into the mirror stream. Returns the captured
     * message, or null when nothing was captured. Network failures are queued to
     * the outbox instead of thrown.
     */
    captureEvent(session: SessionLike, event: EventLike): Promise<CapturedMessage | null>;
    /**
     * Threshold commit check, called at turn end. Commits when the server reports
     * pending_tokens >= threshold.
     */
    maybeCommit(session: SessionLike): Promise<CommitResult | null>;
    /** Final commit at session flush / teardown (server skips when idle). */
    flushCommit(session: SessionLike): Promise<void>;
    private commitOnce;
    dispose(): void;
}
//# sourceMappingURL=runtime.d.ts.map