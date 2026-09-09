/**
 * `/memlearn <lesson>` — the human channel for persisting a lesson.
 *
 * Unlike the model-facing `mcp__openviking__*` tools, this command starts no
 * model turn: DSH routes it straight to the plugin, so the lesson costs zero
 * tokens and its raw text never reaches the LLM. `recordInput` is false for
 * the same reason — the session log is itself mirrored into OpenViking, and
 * recording the raw lesson there would defeat the secret redaction.
 *
 * The registry is an optional host capability: on hosts without a command
 * service, registration silently no-ops, so the plugin adds no hard
 * dependency on `@deepseek-ai/dsh-commands` (types are local and structural).
 */
import type { LearnResult } from './learn.js';
export declare const MEMLEARN_USAGE: string;
export interface CommandInvocationLike {
    rawInput: string;
    signal?: AbortSignal;
}
export interface CommandResultLike {
    kind: 'success' | 'error';
    text: string;
}
interface CommandDefinitionLike {
    name: string;
    description: string;
    input?: {
        hint?: string;
    };
    recordInput?: boolean;
    handler: (invocation: CommandInvocationLike) => Promise<CommandResultLike>;
}
type CommandRegistryLike = {
    register(definition: CommandDefinitionLike): () => void;
};
/** Minimal shape of a cordis context with optional service injection. */
export type InjectableCtxLike = {
    inject?: (services: string[], callback: (scoped: {
        commands?: CommandRegistryLike;
    }) => void) => void;
};
export declare function formatMemlearnResult(result: LearnResult): string;
export interface MemlearnDeps {
    /** Runtime entry point: redact + merge, queueing offline writes. */
    learn: (lesson: string) => Promise<LearnResult>;
}
/**
 * Register `/memlearn` when the host provides a command registry. Safe to
 * call unconditionally — hosts without the capability are skipped.
 */
export declare function registerMemlearnCommand(ctx: InjectableCtxLike, deps: MemlearnDeps): void;
export {};
//# sourceMappingURL=commands.d.ts.map