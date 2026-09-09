/**
 * Typed OpenViking REST client for the plugin's automated layers
 * (profile/recall injection, session mirroring, threshold commits).
 *
 * Endpoint paths and payload shapes follow the official OpenViking API docs;
 * the implementation is original. The model-facing tool surface does not go
 * through this client — it uses the bridged MCP tools instead.
 */

import type { EffectiveSettings } from '../settings.js';
import { isRetryableFailure, OpenVikingApiError, requestJson } from './http.js';

export interface SessionInfo {
  session_id: string;
  uri?: string;
  message_count?: number;
  total_message_count?: number;
  commit_count?: number;
  pending_tokens?: number;
  last_commit_at?: string | null;
  user?: { account_id?: string; user_id?: string };
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
    dedup?: { skipped?: number };
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

/** One ranked hit from `POST /api/v1/search/find`. */
export interface FindItem {
  uri: string;
  title?: string;
  category?: string;
  score?: number;
}

export interface FindResult {
  memories: FindItem[];
  resources: FindItem[];
  skills: FindItem[];
  total?: number;
}

/** `POST /api/v1/content/write` result (fields vary by server version). */
export interface WriteContentResult {
  uri?: string;
  mode?: string;
  written_bytes?: number;
  semantic_updated?: boolean;
  vector_updated?: boolean;
}

export class OpenVikingClient {
  constructor(
    private readonly settings: EffectiveSettings,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private get base(): string {
    return this.settings.restUrl;
  }

  private get timeoutMs(): number {
    return this.settings.timeoutMs;
  }

  private auth() {
    const { credentials } = this.settings;
    return {
      bearerToken: credentials.bearerToken ?? undefined,
      apiKey: credentials.apiKey ?? undefined,
    };
  }

  private identity(actorPeerId?: string) {
    const { credentials } = this.settings;
    return {
      account: credentials.account ?? undefined,
      user: credentials.user ?? undefined,
      actorPeerId: actorPeerId || credentials.peerId || undefined,
    };
  }

  /** GET /health — throws on unreachable server. */
  async health(): Promise<{ healthy: boolean; version?: string; auth_mode?: string }> {
    // Health is not under /api/v1 and needs no auth.
    return requestJson<{ healthy: boolean; version?: string; auth_mode?: string }>({
      baseUrl: this.base,
      path: '/health',
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
    });
  }

  /** GET /api/v1/sessions/{id} — undefined when the session does not exist. */
  async getSession(sessionId: string, actorPeerId?: string): Promise<SessionInfo | undefined> {
    try {
      return await requestJson<SessionInfo>({
        baseUrl: this.base,
        path: `/api/v1/sessions/${encodeURIComponent(sessionId)}`,
        query: { auto_create: false },
        timeoutMs: this.timeoutMs,
        fetchImpl: this.fetchImpl,
        auth: this.auth(),
        identity: this.identity(actorPeerId),
      });
    } catch (err) {
      if (err instanceof OpenVikingApiError && err.httpStatus === 404) return undefined;
      throw err;
    }
  }

  /** POST /api/v1/sessions — create (or re-use) a session by explicit id. */
  async ensureSession(sessionId: string, actorPeerId?: string): Promise<SessionInfo> {
    return requestJson<SessionInfo>({
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
  async addMessage(
    sessionId: string,
    input: AddMessageInput,
    actorPeerId?: string,
  ): Promise<{ session_id: string; message_count: number }> {
    return requestJson<{ session_id: string; message_count: number }>({
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
  async commitSession(
    sessionId: string,
    keepRecentCount: number,
    actorPeerId?: string,
  ): Promise<CommitResult> {
    return requestJson<CommitResult>({
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
  async contextSearch(
    input: ContextSearchInput,
    actorPeerId?: string,
  ): Promise<ContextSearchResult> {
    const body: Record<string, unknown> = {
      mode: 'context',
      query: input.query,
      max_tokens: input.maxTokens ?? 1600,
      purpose: input.purpose ?? 'coding',
      dedup_turns: input.dedupTurns ?? 0,
    };
    if (input.sessionId) body.session_id = input.sessionId;
    if (input.scoreThreshold !== undefined) body.score_threshold = input.scoreThreshold;
    if (input.peerScope) body.peer_scope = input.peerScope;
    if (input.excludeUris && input.excludeUris.length > 0) body.exclude_uris = input.excludeUris;

    const result = await requestJson<ContextSearchResult>({
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
  async readContent(
    uri: string,
    tier: 'abstract' | 'overview' | 'read',
    actorPeerId?: string,
  ): Promise<string> {
    return requestJson<string>({
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
  async fsList(
    uri: string,
    nodeLimit = 512,
    actorPeerId?: string,
  ): Promise<Array<{ name: string; size: number; isDir: boolean; uri: string }>> {
    return requestJson<Array<{ name: string; size: number; isDir: boolean; uri: string }>>({
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
  async find(
    input: { query: string; targetUri?: string; limit?: number; scoreThreshold?: number },
    actorPeerId?: string,
  ): Promise<FindResult> {
    const body: Record<string, unknown> = { query: input.query, limit: input.limit ?? 10 };
    if (input.targetUri !== undefined) body.target_uri = input.targetUri;
    if (input.scoreThreshold !== undefined) body.score_threshold = input.scoreThreshold;
    return requestJson<FindResult>({
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
  async writeContent(
    uri: string,
    content: string,
    options: { mode?: 'replace' | 'append'; wait?: boolean } = {},
    actorPeerId?: string,
  ): Promise<WriteContentResult> {
    return requestJson<WriteContentResult>({
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
  isRetryable(err: unknown): boolean {
    return isRetryableFailure(err);
  }
}

export { isRetryableFailure, OpenVikingApiError };
