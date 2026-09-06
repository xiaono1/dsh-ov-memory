/**
 * Effective runtime settings: plugin patch config + resolved OpenViking
 * credentials + per-session workspace identity.
 *
 * The patch config and the credential chain are independent inputs (a user may
 * configure everything through `cordis.patch.yml`, or nothing and rely on
 * `OPENVIKING_*` env / ovcli.conf / ov.conf). This module merges them into one
 * object the rest of the plugin reads.
 */
import type { ResolvedConfig } from './config.js';
import type { CredentialFields } from './credentials.js';
export interface EffectiveSettings {
    /** REST base URL (from config override → env → config files → default). */
    restUrl: string;
    /** MCP endpoint, usually `${restUrl}/mcp`. */
    mcpUrl: string;
    credentials: CredentialFields;
    /** MCP server display name for the tool namespace. */
    serverName: string;
    timeoutMs: number;
    mcpToolCallTimeoutMs: number;
    /** Pinned peer when set explicitly (env or config). */
    pinnedPeerId: string;
}
export interface EffectiveOptions {
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    configDir?: string;
}
export declare function resolveEffective(config: ResolvedConfig, options?: EffectiveOptions): EffectiveSettings;
//# sourceMappingURL=settings.d.ts.map