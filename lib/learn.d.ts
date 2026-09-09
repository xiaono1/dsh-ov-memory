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
import type { OpenVikingClient } from './client/openviking.js';
/** Lessons live in the caller's own memory space (resolved server-side). */
export declare const LEARN_MEMORIES_ROOT = "viking://~/memories";
export declare const LEARN_MAX_CHARS = 8000;
/** Only the first N chars of a lesson are used as the semantic query. */
export declare const LEARN_QUERY_CHARS = 4000;
export declare const LEARN_FIND_LIMIT = 5;
export declare function redactSecrets(text: string): {
    text: string;
    redacted: number;
};
/** A lesson after validation and redaction — safe to persist anywhere. */
export interface PreparedLesson {
    text: string;
    redacted: number;
}
export declare function prepareLesson(raw: string): PreparedLesson;
export interface LearnLessonOptions {
    /** Already-redacted lesson text (from {@link prepareLesson}). */
    lesson: string;
    /** Minimum semantic score for an existing memory to merge into. */
    minScore: number;
    actorPeerId?: string;
}
/** Result of one merge attempt against a reachable server. */
export interface LearnAttempt {
    action: 'merged' | 'no-match';
    uri: string;
    score?: number;
    message: string;
}
/**
 * Find the closest existing memory and append the lesson to it. Throws on
 * transport/server failure (the caller decides whether to queue); returns
 * `no-match` instead of faking a write when nothing is close enough.
 */
export declare function learnLesson(client: OpenVikingClient, options: LearnLessonOptions): Promise<LearnAttempt>;
/**
 * What the command layer reports: an attempt against a reachable server
 * ('merged' | 'no-match') or an offline-queued write ('queued').
 */
export interface LearnResult {
    action: 'merged' | 'no-match' | 'queued';
    uri: string;
    score?: number;
    /** Number of secret values replaced with `[redacted]`. */
    redacted: number;
    message: string;
}
//# sourceMappingURL=learn.d.ts.map