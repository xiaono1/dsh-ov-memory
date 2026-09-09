/**
 * Human lesson persistence ("learn"): redact a lesson, then merge it into the
 * closest existing memory.
 *
 * OpenViking has no "create memory file" endpoint — new memories are produced
 * by the server-side extractor after a session commit. So a direct write can
 * only *append to an existing file*: the lesson is used as a semantic query
 * over `viking://~/memories`, and when the closest hit clears `minScore` the
 * lesson is appended there verbatim (dedupe-merge instead of near-duplicates).
 * With no close match nothing is written and the caller gets honest guidance.
 *
 * Secrets are redacted before anything touches the wire — including the
 * outbox, which persists the already-redacted text only. This module is pure
 * (no filesystem, no outbox): the runtime owns queueing and replay.
 */
/** Lessons live in the caller's own memory space (resolved server-side). */
export const LEARN_MEMORIES_ROOT = 'viking://~/memories';
export const LEARN_MAX_CHARS = 8_000;
/** Only the first N chars of a lesson are used as the semantic query. */
export const LEARN_QUERY_CHARS = 4_000;
export const LEARN_FIND_LIMIT = 5;
/** Secret shapes replaced with `[redacted]` before anything is persisted. */
const SECRET_PATTERNS = [
    /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g,
    /\b(?:sk|pk|rk)-[A-Za-z0-9]{20,}/g,
    /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,
    /\bAKIA[0-9A-Z]{16}\b/g,
    /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
];
export function redactSecrets(text) {
    let redacted = 0;
    let out = text;
    for (const pattern of SECRET_PATTERNS) {
        out = out.replace(pattern, () => {
            redacted += 1;
            return '[redacted]';
        });
    }
    return { text: out, redacted };
}
export function prepareLesson(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        throw new Error('memlearn: the lesson is empty — nothing to learn.');
    if (trimmed.length > LEARN_MAX_CHARS) {
        throw new Error(`memlearn: the lesson exceeds ${LEARN_MAX_CHARS} characters — tighten it.`);
    }
    const redacted = redactSecrets(trimmed);
    return { text: redacted.text, redacted: redacted.redacted };
}
/**
 * Find the closest existing memory and append the lesson to it. Throws on
 * transport/server failure (the caller decides whether to queue); returns
 * `no-match` instead of faking a write when nothing is close enough.
 */
export async function learnLesson(client, options) {
    const found = await client.find({
        query: options.lesson.slice(0, LEARN_QUERY_CHARS),
        targetUri: LEARN_MEMORIES_ROOT,
        limit: LEARN_FIND_LIMIT,
    }, options.actorPeerId);
    const ranked = (found.memories ?? [])
        .filter((item) => typeof item.score === 'number' && typeof item.uri === 'string')
        .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (best && best.score >= options.minScore) {
        await client.writeContent(best.uri, options.lesson, { mode: 'append' }, options.actorPeerId);
        return {
            action: 'merged',
            uri: best.uri,
            score: best.score,
            message: `Appended the lesson to ${best.uri} (score ${best.score.toFixed(2)}); the server re-indexes it in the background.`,
        };
    }
    const top = best
        ? ` (closest hit scored ${best.score.toFixed(2)}, below the ${options.minScore.toFixed(2)} merge floor)`
        : '';
    return {
        action: 'no-match',
        uri: '',
        message: `No existing memory is close enough to merge into${top}. OpenViking cannot create ` +
            `memory files directly, so either rephrase the lesson towards an existing topic, ` +
            `mention it in a session and let auto-commit extract it, or ask the model to store ` +
            `it via mcp__openviking__remember.`,
    };
}
//# sourceMappingURL=learn.js.map