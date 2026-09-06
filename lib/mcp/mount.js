/**
 * Mount the OpenViking tool surface in DSH through `@deepseek-ai/dsh-mcp-client`.
 *
 * The bridge spawns `proxy-entry.js` as a stdio MCP server; DSH's MCP client
 * speaks to it and publishes every server tool under `mcp__openviking__*`.
 * All OpenViking configuration the proxy needs travels through the child env
 * because DSH scrubs credential-shaped names out of inherited environments and
 * a subprocess cannot read the Cordis patch.
 */
import { fileURLToPath } from 'node:url';
export function proxyEntryPath() {
    return fileURLToPath(new URL('./proxy-entry.js', import.meta.url));
}
export function buildMcpClientConfig(config, settings) {
    const env = {
        // Inside an Electron host the child must run as plain node.
        ELECTRON_RUN_AS_NODE: '1',
        OPENVIKING_MCP_URL: settings.mcpUrl,
        OPENVIKING_MCP_TIMEOUT_MS: String(settings.mcpToolCallTimeoutMs),
    };
    const { credentials } = settings;
    if (credentials.bearerToken)
        env.OPENVIKING_BEARER_TOKEN = credentials.bearerToken;
    if (credentials.apiKey)
        env.OPENVIKING_API_KEY = credentials.apiKey;
    if (credentials.account)
        env.OPENVIKING_ACCOUNT = credentials.account;
    if (credentials.user)
        env.OPENVIKING_USER = credentials.user;
    if (settings.pinnedPeerId)
        env.OPENVIKING_PEER_ID = settings.pinnedPeerId;
    return {
        transport: 'stdio',
        serverName: config.mcp.serverName,
        command: process.execPath,
        args: [proxyEntryPath()],
        env,
        cwd: process.cwd(),
        toolCallTimeoutMs: settings.mcpToolCallTimeoutMs,
        failOnStartupError: false,
    };
}
//# sourceMappingURL=mount.js.map