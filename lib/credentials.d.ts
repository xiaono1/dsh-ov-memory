/**
 * OpenViking credential resolution.
 *
 * The canonical precedence (shared by every OpenViking client integration) is
 *
 *   1. `OPENVIKING_*` environment variables
 *   2. `~/.openviking/ovcli.conf`
 *   3. `~/.openviking/ov.conf`
 *
 * The parser below is intentionally tolerant: it accepts the small YAML/INI
 * subset the config files actually use (`key: value`, `key = value`, JSON,
 * `[section]` groups and dotted keys) so a missing or renamed field degrades
 * instead of failing the whole chain. Only field *names* come from the OpenViking
 * docs; this implementation is original.
 */
export interface CredentialFields {
    url?: string;
    apiKey?: string;
    bearerToken?: string;
    account?: string;
    user?: string;
    peerId?: string;
}
export type CredentialLayer = 'env' | 'cli' | 'ov' | 'none';
export interface CredentialResolution {
    /** Which layers contributed a credential, in order of increasing precedence. */
    layers: CredentialLayer[];
    fields: CredentialFields;
    /** MCP endpoint override, usually `${url}/mcp`. */
    mcpUrl: string | null;
}
/** Tolerant key/value parser for the OpenViking config files. */
export declare function parseConfigText(text: string): CredentialFields;
/** Read a config file, tolerating absence. */
export declare function readConfigFile(path: string): CredentialFields | null;
/** Resolve `~` in a config path and expand env vars. */
export declare function expandHome(value: string | undefined, cwd: string): string | undefined;
export interface ResolveOptions {
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    configDir?: string;
    /** Extra config files to consult, most-specific last. */
    extraFiles?: string[];
}
/**
 * Resolve credentials following the documented chain.
 *
 * @returns the merged fields plus the ordered list of layers that contributed
 *   something, and the MCP endpoint derived from the winning URL.
 */
export declare function resolveCredentials(opts?: ResolveOptions): CredentialResolution;
/** Human-readable summary of the winning layer chain (no secrets). */
export declare function describeLayers(resolution: CredentialResolution): string;
//# sourceMappingURL=credentials.d.ts.map