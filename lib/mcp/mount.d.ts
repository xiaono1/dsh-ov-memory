/**
 * Mount the OpenViking tool surface in DSH through `@deepseek-ai/dsh-mcp-client`.
 *
 * The bridge spawns `proxy-entry.js` as a stdio MCP server; DSH's MCP client
 * speaks to it and publishes every server tool under `mcp__openviking__*`.
 * All OpenViking configuration the proxy needs travels through the child env
 * because DSH scrubs credential-shaped names out of inherited environments and
 * a subprocess cannot read the Cordis patch.
 */
import type { ResolvedConfig } from '../config.js';
import type { EffectiveSettings } from '../settings.js';
export interface McpClientConfig {
    transport: 'stdio';
    serverName: string;
    command: string;
    args: string[];
    env: Record<string, string>;
    cwd: string;
    toolCallTimeoutMs: number;
    failOnStartupError: boolean;
}
export declare function proxyEntryPath(): string;
export declare function buildMcpClientConfig(config: ResolvedConfig, settings: EffectiveSettings): McpClientConfig;
//# sourceMappingURL=mount.d.ts.map