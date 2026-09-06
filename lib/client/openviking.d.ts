/**
 * Typed OpenViking REST client for the plugin's automated layers
 * (profile/recall injection, session mirroring, threshold commits).
 *
 * Endpoint paths and payload shapes follow the official OpenViking API docs;
 * the implementation is original. The model-facing tool surface does not go
 * through this client — it uses the bridged MCP tools instead.
 */
import type { EffectiveSettings } from '../settings.js';
import { isRetryableFailure, OpenVikingApiError } from './http.js';
export interface SessionInfo {
    session_id: string;
    uri?: string;
    message_count?: number;
    total_message_count?: number;
    commit_count?: number;
    pending_tokens?: number;
    last_commit_at?: string | null;
    user?: {
        account_id?: string;
        user_id?: string;
    };
}
export interface AddMessageInput {
    role: 'user' | 'assistant';
    content: string;
}
export interface CommitResult {
    status: 'accepted' | 'skipped';
    task_id?: string;
    archive_uri?: string;
    archived?: number;
    reason?: string;
}
export interface ContextSearchEntry {
    uri: string;
    category?: string;
    score?: number;
    detail?: 'full' | 'overview' | 'abstract' | 'uri';
    text?: string;
    origin?: string;
}
export interface ContextSearchResult {
    entries: ContextSearchEntry[];
    rendered?: string;
    digest?: string;
    stats?: {
        used_tokens?: number;
        per_entry_cap?: number;
        query_expansion?: boolean;
        rewrite?: string;
        dedup?: {
            skipped?: number;
        };
        retrieval_errors?: number;
    };
}
export interface ContextSearchInput {
    query: string;
    sessionId?: string;
    maxTokens?: number;
    purpose?: 'chat' | 'coding';
    scoreThreshold?: number;
    dedupTurns?: number;
    peerScope?: 'actor' | 'all';
    excludeUris?: string[];
}
export declare class OpenVikingClient {
    private readonly settings;
    private readonly fetchImpl;
    constructor(settings: EffectiveSettings, fetchImpl?: typeof fetch);
    private get base();
    private get timeoutMs();
    private auth;
    private identity;
    /** GET /health — throws on unreachable server. */
    health(): Promise<{
        healthy: boolean;
        version?: string;
        auth_mode?: string;
    }>;
    /** GET /api/v1/sessions/{id} — undefined when the session does not exist. */
    getSession(sessionId: string, actorPeerId?: string): Promise<SessionInfo | undefined>;
    /** POST /api/v1/sessions — create (or re-use) a session by explicit id. */
    ensureSession(sessionId: string, actorPeerId?: string): Promise<SessionInfo>;
    /** POST /api/v1/sessions/{id}/messages */
    addMessage(sessionId: string, input: AddMessageInput, actorPeerId?: string): Promise<{
        session_id: string;
        message_count: number;
    }>;
    /** POST /api/v1/sessions/{id}/commit (two-phase; async extraction follows). */
    commitSession(sessionId: string, keepRecentCount: number, actorPeerId?: string): Promise<CommitResult>;
    /** POST /api/v1/search/search with mode=context — injection-ready recall. */
    contextSearch(input: ContextSearchInput, actorPeerId?: string): Promise<ContextSearchResult>;
    /** GET /api/v1/content/{abstract|overview|read}?uri= — tiered reads. */
    readContent(uri: string, tier: 'abstract' | 'overview' | 'read', actorPeerId?: string): Promise<string>;
    /** GET /api/v1/fs/ls?uri=&node_limit= — directory listing. */
    fsList(uri: string, nodeLimit?: number, actorPeerId?: string): Promise<Array<{
        name: string;
        size: number;
        isDir: boolean;
        uri: string;
    }>>;
    /** Re-export for outbox replay classification. */
    isRetryable(err: unknown): boolean;
}
export { isRetryableFailure, OpenVikingApiError };
//# sourceMappingURL=openviking.d.ts.map