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
/** Build the recall block text, or null when there is nothing to inject. */
export async function buildRecallText(client, config, input) {
    if (!config.recall.enabled)
        return null;
    const trimmed = input.query.trim();
    if (!trimmed)
        return null;
    const result = await client.contextSearch({
        query: trimmed,
        sessionId: input.ovSessionId,
        maxTokens: config.recall.budgetTokens,
        purpose: 'coding',
        scoreThreshold: config.recall.scoreFloor,
        dedupTurns: 5,
        excludeUris: input.excludeUris,
    }, input.actorPeerId);
    const stats = result.stats;
    const rewriteNoRelevant = stats?.rewrite === 'no_relevant';
    const entries = result.entries ?? [];
    const usableEntries = rewriteNoRelevant ? [] : entries;
    // Injection-ready surfaces, in preference order: digest (rewritten) then the
    // raw rendered XML then the structured entries.
    let body = '';
    if (!rewriteNoRelevant && result.digest) {
        body = result.digest;
    }
    else if (!rewriteNoRelevant && result.rendered) {
        body = result.rendered;
    }
    else {
        const parts = usableEntries
            .filter((entry) => entry.text || entry.uri)
            .slice(0, config.recall.limit)
            .map((entry) => {
            const head = entry.uri;
            const text = entry.text ?? '';
            return text ? `${head}\n${text}` : head;
        });
        body = parts.join('\n\n');
    }
    if (!body.trim())
        return null;
    return wrapRecallText(body);
}
export function wrapRecallText(body) {
    return (`[OpenViking memory recall — retrieved automatically; may be stale or partial, ` +
        `verify before relying on it. Read the viking:// URIs below with ` +
        `mcp__openviking__read for full detail.]\n${body}`);
}
const PROFILE_MEMORIES_ROOT = 'viking://~/memories';
const PROFILE_MD = 'viking://~/memories/profile.md';
const PROFILE_MAX_ITEMS = 64;
/** Build the session-start profile/index text, or null when the server is quiet. */
export async function buildProfileText(client, config, input = {}) {
    if (!config.recall.startupMap)
        return null;
    const sections = [];
    let profileMd = null;
    let entries = [];
    try {
        profileMd = await client.readContent(PROFILE_MD, 'read', input.actorPeerId);
    }
    catch {
        profileMd = null; // no profile file yet — not an error
    }
    try {
        const listed = await client.fsList(PROFILE_MEMORIES_ROOT, PROFILE_MAX_ITEMS, input.actorPeerId);
        entries = listed
            .filter((entry) => !entry.name.startsWith('.') && entry.isDir)
            .map((entry) => ({ name: entry.name, uri: entry.uri }));
    }
    catch {
        entries = [];
    }
    if (profileMd && profileMd.trim())
        sections.push(`# Profile\n${profileMd.trim()}`);
    if (entries.length > 0) {
        const listing = entries
            .map((entry) => `- \`${entry.uri}\` (${entry.name})`)
            .join('\n');
        sections.push(`# Available memories\n${listing}`);
    }
    if (sections.length === 0)
        return null;
    return sections.join('\n\n');
}
//# sourceMappingURL=recall.js.map