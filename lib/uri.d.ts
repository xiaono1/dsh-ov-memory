/**
 * Minimal parsing/normalization helpers for `viking://` URIs.
 *
 * A viking URI has the shape `viking://{scope}/{path}`. This module only
 * manipulates URI strings — it never touches the filesystem, and it is the
 * single place where scope classification lives so the guard and the tools
 * agree on what a target means.
 */
export declare const VIKING_SCHEME = "viking:";
export type VikingScope = 'public' | 'user' | 'agent' | 'resources' | 'internal';
export interface VikingUri {
    /** Original, unmodified URI string. */
    raw: string;
    /** Scope segment after the authority (`user`, `agent`, `resources`, ...). */
    scope: string;
    /** Everything after the leading scope segment, split on `/`. */
    segments: string[];
    /** True when the authority is `~` (home alias). */
    isHome: boolean;
    /** Lower-case first segment of the path, when present (memories, skills, ...). */
    kind?: string;
}
export declare function isVikingUri(value: unknown): value is string;
export declare function parseVikingUri(raw: string): VikingUri | null;
/**
 * Re-classify an authority for human-facing policy wording. `~` is resolved
 * server-side to the caller's own user space, so policy treats it as user.
 */
export declare function classifyScope(uri: VikingUri): VikingScope;
/** Every `viking://` URI found in an arbitrary argument value (string or nested strings). */
export declare function findVikingUris(value: unknown, out?: string[]): string[];
/**
 * Search common argument keys for viking targets. Model-facing tool calls carry
 * their arguments object; built-in tools use keys such as `uris`, `uri`,
 * `path`, `glob`, `pattern`. We only need to detect *presence* of a viking
 * target to decide whether the guard should act.
 */
export declare function hasVikingTarget(args: unknown): boolean;
//# sourceMappingURL=uri.d.ts.map