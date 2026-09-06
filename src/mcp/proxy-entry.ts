/**
 * Proxy process entry point.
 *
 * DSH spawns this file as a stdio MCP server (one process per profile). All
 * configuration travels through the child environment — DSH scrubs
 * credential-shaped names out of the inherited environment, so the parent
 * passes the resolved OpenViking values explicitly in `env`.
 */

import { McpHttpClient } from './upstream.js';
import { StdioMcpServer } from './stdio-server.js';

const DEFAULT_MCP_URL = 'http://127.0.0.1:1933/mcp';

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function resolveProxyConfig(): {
  mcpUrl: string;
  apiKey: string;
  bearerToken: string;
  account: string;
  user: string;
  actorPeerId: string;
  timeoutMs: number;
} {
  const mcpUrl = readEnv('OPENVIKING_MCP_URL') ?? DEFAULT_MCP_URL;
  const rawTimeout = readEnv('OPENVIKING_MCP_TIMEOUT_MS');
  const timeoutMs = rawTimeout ? Number.parseInt(rawTimeout, 10) : 60_000;
  return {
    mcpUrl,
    apiKey: readEnv('OPENVIKING_API_KEY') ?? '',
    bearerToken: readEnv('OPENVIKING_BEARER_TOKEN') ?? '',
    account: readEnv('OPENVIKING_ACCOUNT') ?? '',
    user: readEnv('OPENVIKING_USER') ?? '',
    actorPeerId: readEnv('OPENVIKING_PEER_ID') ?? '',
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 60_000,
  };
}

function log(message: string): void {
  // stdio belongs to MCP; everything else goes to stderr.
  process.stderr.write(`[ov-memory-proxy] ${message}\n`);
}

const config = resolveProxyConfig();
const upstream = new McpHttpClient({
  url: config.mcpUrl,
  apiKey: config.apiKey || undefined,
  bearerToken: config.bearerToken || undefined,
  account: config.account || undefined,
  user: config.user || undefined,
  actorPeerId: config.actorPeerId || undefined,
  timeoutMs: config.timeoutMs,
});

const server = new StdioMcpServer({
  upstream,
  log,
  serverInfo: { name: 'ov-memory', version: '0.1.0' },
});

log(
  `proxy up → ${config.mcpUrl} (account=${config.account || '-'} user=${config.user || '-'} ` +
    `peer=${config.actorPeerId || '-'} key=${config.apiKey || config.bearerToken ? 'yes' : 'no'})`,
);
server.start();
