/**
 * Effective runtime settings: plugin patch config + resolved OpenViking
 * credentials + per-session workspace identity.
 *
 * The patch config and the credential chain are independent inputs (a user may
 * configure everything through `cordis.patch.yml`, or nothing and rely on
 * `OPENVIKING_*` env / ovcli.conf / ov.conf). This module merges them into one
 * object the rest of the plugin reads.
 */
import { resolveCredentials } from './credentials.js';
export function resolveEffective(config, options = {}) {
    const env = options.env ?? process.env;
    const chain = resolveCredentials({
        env,
        cwd: options.cwd,
        configDir: options.configDir,
    });
    // Precedence for the REST base URL: explicit patch config > chain > default.
    const explicitUrl = config.endpoint && config.endpoint !== 'http://127.0.0.1:1933'
        ? config.endpoint
        : '';
    const restUrl = (explicitUrl || chain.fields.url || 'http://127.0.0.1:1933').replace(/\/+$/, '');
    const mcpUrl = chain.mcpUrl ?? `${restUrl}/mcp`;
    const credentials = {
        ...chain.fields,
        apiKey: config.apiKey || chain.fields.apiKey,
        bearerToken: chain.fields.bearerToken,
        account: config.account || chain.fields.account,
        user: config.user || chain.fields.user,
        peerId: config.peerId || chain.fields.peerId,
    };
    if (explicitUrl)
        credentials.url = restUrl;
    return {
        restUrl,
        mcpUrl,
        credentials,
        serverName: config.mcp.serverName,
        timeoutMs: config.timeoutMs,
        mcpToolCallTimeoutMs: config.mcp.toolCallTimeoutMs,
        pinnedPeerId: credentials.peerId ?? '',
    };
}
//# sourceMappingURL=settings.js.map