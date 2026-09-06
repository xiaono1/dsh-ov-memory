/**
 * Guard that keeps DSH's built-in filesystem/shell tools away from `viking://`
 * URIs.
 *
 * `viking://` paths are virtual database paths inside OpenViking, not local
 * files. When the model hands one to a local tool the result is a confusing
 * error at best and a crash at worst, so the guard denies the call and points
 * the model at the bridged `mcp__openviking__*` tools that understand those
 * URIs.
 *
 * The guard is intentionally pure: it maps a tool call to a decision and lets
 * the hook layer apply it.
 */
export interface ToolCallLike {
    name: string;
    arguments?: unknown;
}
export type GuardDecision = {
    kind: 'allow';
} | {
    kind: 'deny';
    reason: string;
} | {
    kind: 'ask';
    reason: string;
};
export declare function isOwnMcpTool(name: string): boolean;
export declare function guardVikingUri(call: ToolCallLike): GuardDecision;
/** Reason text for a model-visible guard message when the deny is surfaced. */
export declare function guardMessageFor(decision: Extract<GuardDecision, {
    kind: 'deny';
}>): string;
//# sourceMappingURL=guard.d.ts.map