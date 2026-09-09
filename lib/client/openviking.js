/**
 * Typed OpenViking REST client for the plugin's automated layers
 * (profile/recall injection, session mirroring, threshold commits).
 *
 * Endpoint paths and payload shapes follow the official OpenViking API docs;
 * the implementation is original. The model-facing tool surface does not go
 * through this client — it uses the bridged MCP tools instead.
 */
import { isRetryableFailure, OpenVikingApiError, requestJson } from './http.js';
export class OpenVikingClient {
    settings;
    fetchImpl;
    constructor(settings, fetchImpl = fetch) {
        this.settings = settings;
        this.fetchImpl = fetchImpl;
    }
    get base() {
        return this.settings.restUrl;
    }
    get timeoutMs() {
        return this.settings.timeoutMs;
    }
    auth() {
        const { credentials } = this.settings;
        return {
            bearerToken: credentials.bearerToken ?? undefined,
            apiKey: credentials.apiKey ?? undefined,
        };
    }
    identity(actorPeerId) {
        const { credentials } = this.settings;
        return {
            account: credentials.account ?? undefined,
            user: credentials.user ?? undefined,
            actorPeerId: actorPeerId || credentials.peerId || undefined,
        };
    }
    /** GET /health — throws on unreachable server. */
    async health() {
        // Health is not under /api/v1 and needs no auth.
        return requestJson({
            baseUrl: this.base,
            path: '/health',
            timeoutMs: this.timeoutMs,
            fetchImpl: this.fetchImpl,
        });
    }
    /** GET /api/v1/sessions/{id} — undefined when the session does not exist. */
    async getSession(sessionId, actorPeerId) {
        try {
            return await requestJson({
                baseUrl: this.base,
                path: `/api/v1/sessions/${encodeURIComponent(sessionId)}`,
                query: { auto_create: false },
                timeoutMs: this.timeoutMs,
                fetchImpl: this.fetchImpl,
                auth: this.auth(),
                identity: this.identity(actorPeerId),
            });
        }
        catch (err) {
            if (err instanceof OpenVikingApiError && err.httpStatus === 404)
                return undefined;
            throw err;
        }
    }
    /** POST /api/v1/sessions — create (or re-use) a session by explicit id. */
    async ensureSession(sessionId, actorPeerId) {
        return requestJson({
            baseUrl: this.base,
            path: '/api/v1/sessions',
            method: 'POST',
            body: { session_id: sessionId },
            timeoutMs: this.timeoutMs,
            fetchImpl: this.fetchImpl,
            auth: this.auth(),
            identity: this.identity(actorPeerId),
        });
    }
    /** POST /api/v1/sessions/{id}/messages */
    async addMessage(sessionId, input, actorPeerId) {
        return requestJson({
            baseUrl: this.base,
            path: `/api/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
            method: 'POST',
            body: { role: input.role, content: input.content },
            timeoutMs: this.timeoutMs,
            fetchImpl: this.fetchImpl,
            auth: this.auth(),
            identity: this.identity(actorPeerId),
        });
    }
    /** POST /api/v1/sessions/{id}/commit (two-phase; async extraction follows). */
    async commitSession(sessionId, keepRecentCount, actorPeerId) {
        return requestJson({
            baseUrl: this.base,
            path: `/api/v1/sessions/${encodeURIComponent(sessionId)}/commit`,
            method: 'POST',
            body: { keep_recent_count: keepRecentCount },
            timeoutMs: this.timeoutMs,
            fetchImpl: this.fetchImpl,
            auth: this.auth(),
            identity: this.identity(actorPeerId),
        });
    }
    /** POST /api/v1/search/search with mode=context — injection-ready recall. */
    async contextSearch(input, actorPeerId) {
        const body = {
            mode: 'context',
            query: input.query,
            max_tokens: input.maxTokens ?? 1600,
            purpose: input.purpose ?? 'coding',
            dedup_turns: input.dedupTurns ?? 0,
        };
        if (input.sessionId)
            body.session_id = input.sessionId;
        if (input.scoreThreshold !== undefined)
            body.score_threshold = input.scoreThreshold;
        if (input.peerScope)
            body.peer_scope = input.peerScope;
        if (input.excludeUris && input.excludeUris.length > 0)
            body.exclude_uris = input.excludeUris;
        const result = await requestJson({
            baseUrl: this.base,
            path: '/api/v1/search/search',
            method: 'POST',
            body,
            timeoutMs: this.timeoutMs,
            fetchImpl: this.fetchImpl,
            auth: this.auth(),
            identity: this.identity(actorPeerId),
        });
        return result;
    }
    /** GET /api/v1/content/{abstract|overview|read}?uri= — tiered reads. */
    async readContent(uri, tier, actorPeerId) {
        return requestJson({
            baseUrl: this.base,
            path: `/api/v1/content/${tier}`,
            query: { uri },
            timeoutMs: this.timeoutMs,
            fetchImpl: this.fetchImpl,
            auth: this.auth(),
            identity: this.identity(actorPeerId),
        });
    }
    /** GET /api/v1/fs/ls?uri=&node_limit= — directory listing. */
    async fsList(uri, nodeLimit = 512, actorPeerId) {
        return requestJson({
            baseUrl: this.base,
            path: '/api/v1/fs/ls',
            query: { uri, node_limit: nodeLimit },
            timeoutMs: this.timeoutMs,
            fetchImpl: this.fetchImpl,
            auth: this.auth(),
            identity: this.identity(actorPeerId),
        });
    }
    /** POST /api/v1/search/find — raw ranked hits, no context assembly. */
    async find(input, actorPeerId) {
        const body = { query: input.query, limit: input.limit ?? 10 };
        if (input.targetUri !== undefined)
            body.target_uri = input.targetUri;
        if (input.scoreThreshold !== undefined)
            body.score_threshold = input.scoreThreshold;
        return requestJson({
            baseUrl: this.base,
            path: '/api/v1/search/find',
            method: 'POST',
            body,
            timeoutMs: this.timeoutMs,
            fetchImpl: this.fetchImpl,
            auth: this.auth(),
            identity: this.identity(actorPeerId),
        });
    }
    /**
     * POST /api/v1/content/write — replace or append text to an existing
     * viking:// file. The server re-embeds the file and refreshes the containing
     * directory; it cannot create new memory files (those come from commits).
     */
    async writeContent(uri, content, options = {}, actorPeerId) {
        return requestJson({
            baseUrl: this.base,
            path: '/api/v1/content/write',
            method: 'POST',
            body: {
                uri,
                content,
                mode: options.mode ?? 'replace',
                wait: options.wait ?? false,
            },
            timeoutMs: this.timeoutMs,
            fetchImpl: this.fetchImpl,
            auth: this.auth(),
            identity: this.identity(actorPeerId),
        });
    }
    /** Re-export for outbox replay classification. */
    isRetryable(err) {
        return isRetryableFailure(err);
    }
}
export { isRetryableFailure, OpenVikingApiError };
//# sourceMappingURL=openviking.js.map