/**
 * Recall and profile message builders.
 *
 * Both produce *text* for plugin-sourced user messages that are injected into
 * the agent conversation (`agent.inject` / pre-step append). The OpenViking
 * server does the heavy lifting — retrieval, de-duplication against recent
 * turns, token budgeting, optional rewrite — so these builders stay thin: call
 * the right endpoint, pick the injection-ready surface, wrap it, and hand it
 * over.
 */
import type { ResolvedConfig } from './config.js';
import type { OpenVikingClient } from './client/openviking.js';
export interface RecallInput {
    query: string;
    /** OpenViking session id (dsh-<dsh session id>) for dedup. */
    ovSessionId: string;
    actorPeerId?: string;
    /** URIs already injected this session, excluded from recall. */
    excludeUris?: string[];
}
/** Build the recall block text, or null when there is nothing to inject. */
export declare function buildRecallText(client: OpenVikingClient, config: ResolvedConfig, input: RecallInput): Promise<string | null>;
export declare function wrapRecallText(body: string): string;
export interface ProfileInput {
    actorPeerId?: string;
}
/** Build the session-start profile/index text, or null when the server is quiet. */
export declare function buildProfileText(client: OpenVikingClient, config: ResolvedConfig, input?: ProfileInput): Promise<string | null>;
//# sourceMappingURL=recall.d.ts.map