/**
 * dsh-ov-memory plugin entry.
 *
 * A cordis plugin that mirrors DSH agent sessions into OpenViking:
 *
 *  - `agent/session-start`  → ensure session, replay outbox, inject profile/index
 *  - `agent/pre-step`       → recall relevant memory and append it to the step
 *  - `session/event`        → capture user/assistant (and optional tool) messages
 *  - `session/event` turn-end → threshold commit (pending_tokens)
 *  - `session/flush`        → final commit at session teardown
 *  - `tools/pre-execute`    → keep local tools away from viking:// URIs
 *  - `/memlearn` command    → human lesson channel (redact + merge, no model turn)
 *  - plus an isolated skill provider and the bridged `mcp__openviking__*` tools
 */
import type { Logger } from './types.js';
export { Config } from './config.js';
export { MCP_SERVER_NAME } from './config.js';
export declare const name = "ov-memory";
/** Minimal shape of a cordis context we consume. */
interface CtxLike {
    logger: Logger;
    plugin(plugin: unknown, config?: unknown): unknown;
    on(event: string, listener: (...args: any[]) => unknown, options?: {
        prepend?: boolean;
    }): unknown;
    effect(fn: (() => void) | (() => () => void), label?: string): unknown;
    /** Optional cordis service injection (used for the command registry). */
    inject?: (services: string[], callback: (scoped: any) => void) => void;
}
export declare function apply(ctx: CtxLike, input?: unknown): void;
//# sourceMappingURL=index.d.ts.map