/**
 * Minimal MCP client speaking Streamable HTTP to the OpenViking `/mcp`
 * endpoint.
 *
 * OpenViking runs its MCP surface on the same port as the REST API
 * (`POST <base>/mcp`). Per the official docs, with `stateless_http` enabled the
 * server answers `GET /mcp` with an idle SSE stream, and a client that keeps
 * that stream open stops resolving POST responses — so this client is strictly
 * request/response over POST and never opens a GET subscription.
 *
 * Session handling: the server returns a `Mcp-Session-Id` header after
 * `initialize`, which must be echoed on later requests. When the session goes
 * stale the server rejects the request and the client transparently
 * re-initializes once before retrying.
 */

import {
  JSONRPC_ERRORS,
  MCP_LATEST_PROTOCOL,
  MCP_METHODS,
} from './protocol.js';
import type {
  JsonRpcError,
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  McpCallResult,
  McpTool,
} from './protocol.js';

export interface McpHttpClientOptions {
  url: string;
  apiKey?: string;
  bearerToken?: string;
  account?: string;
  user?: string;
  actorPeerId?: string;
  timeoutMs?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
}

interface InitializedSession {
  protocolVersion: string;
  serverInfo: { name: string; version: string };
}

const SESSION_HEADER = 'mcp-session-id';

export class McpHttpClient {
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private sessionId: string | null = null;
  private session: InitializedSession | null = null;

  constructor(options: McpHttpClientOptions) {
    this.url = options.url;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.fetchImpl = options.fetchImpl ?? fetch;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'User-Agent':
        options.userAgent ?? `ov-memory-proxy/0.1.0 (dsh-ov-memory; +github.com/xiaono1/dsh-ov-memory)`,
    };
    const credential = options.bearerToken || options.apiKey;
    if (credential) headers.Authorization = `Bearer ${credential}`;
    if (options.account) headers['X-OpenViking-Account'] = options.account;
    if (options.user) headers['X-OpenViking-User'] = options.user;
    if (options.actorPeerId) headers['X-OpenViking-Actor-Peer'] = options.actorPeerId;
    this.headers = headers;
  }

  get serverInfo(): InitializedSession['serverInfo'] | null {
    return this.session?.serverInfo ?? null;
  }

  /** Send a raw JSON-RPC message; used for notifications and tests. */
  async notify(notification: JsonRpcNotification): Promise<void> {
    await this.post(notification, { expectSession: false });
  }

  /** Send a request, re-initializing once on a stale-session rejection. */
  async request<T = unknown>(method: string, params?: unknown, retried = false): Promise<T> {
    if (!this.session && method !== MCP_METHODS.initialize) {
      await this.initialize();
    }
    const request: JsonRpcRequest = { jsonrpc: '2.0', id: this.nextId(), method, params };
    try {
      const response = await this.post(request, { expectSession: true });
      return this.unwrap<T>(response, method);
    } catch (err) {
      if (isStaleSessionError(err) && !retried) {
        this.sessionId = null;
        this.session = null;
        await this.initialize();
        return this.request<T>(method, params, true);
      }
      throw err;
    }
  }

  async initialize(): Promise<InitializedSession> {
    const response = await this.post(
      {
        jsonrpc: '2.0',
        id: this.nextId(),
        method: MCP_METHODS.initialize,
        params: {
          protocolVersion: MCP_LATEST_PROTOCOL,
          capabilities: {},
          clientInfo: { name: 'dsh-ov-memory-proxy', version: '0.1.0' },
        },
      },
      { expectSession: false },
    );
    const result = this.unwrap<{
      protocolVersion: string;
      serverInfo: { name: string; version: string };
    }>(response, MCP_METHODS.initialize);
    this.session = {
      protocolVersion: result.protocolVersion,
      serverInfo: result.serverInfo,
    };
    await this.post(
      { jsonrpc: '2.0', method: MCP_METHODS.initializedNotification, params: {} },
      { expectSession: false },
    );
    return this.session;
  }

  async ping(): Promise<void> {
    await this.request(MCP_METHODS.ping, {});
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.request<{ tools: McpTool[]; nextCursor?: string }>(
      MCP_METHODS.toolsList,
      {},
    );
    return result?.tools ?? [];
  }

  async callTool(name: string, args: unknown): Promise<McpCallResult> {
    const result = await this.request<McpCallResult>(MCP_METHODS.toolsCall, {
      name,
      arguments: args ?? {},
    });
    return result;
  }

  private seq = 0;
  private nextId(): number {
    this.seq += 1;
    return this.seq;
  }

  private unwrap<T>(response: JsonRpcResponse, method: string): T {
    if (response.error) {
      const err = new McpRequestError(method, response.error);
      if (isStaleSessionCode(response.error.code)) err.staleSession = true;
      throw err;
    }
    return response.result as T;
  }

  private async post(
    message: JsonRpcRequest | JsonRpcNotification,
    opts: { expectSession: boolean },
  ): Promise<JsonRpcResponse> {
    const headers: Record<string, string> = { ...this.headers };
    if (opts.expectSession && this.sessionId) headers[SESSION_HEADER] = this.sessionId;

    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new McpTransportError(
        `OpenViking MCP request failed (${this.url}). Is the server running?`,
        err,
      );
    }

    const sessionId = response.headers.get(SESSION_HEADER);
    if (sessionId) this.sessionId = sessionId;

    if (!response.ok) {
      // Session expired mid-flight: servers signal it with 400/404 + code.
      const text = await response.text().catch(() => '');
      const err = new McpHttpStatusError(response.status, text);
      if (response.status === 400 || response.status === 404) {
        err.staleSession = true;
      }
      throw err;
    }

    const body = await readResponseBody(response);
    const parsed = parseJsonRpc(body);
    if (parsed === null) {
      throw new McpTransportError(`OpenViking MCP returned non-JSON-RPC body: ${body.slice(0, 200)}`);
    }
    return parsed;
  }
}

function isStaleSessionError(err: unknown): boolean {
  return (
    (err instanceof McpRequestError && err.staleSession) ||
    (err instanceof McpHttpStatusError && err.staleSession)
  );
}

function isStaleSessionCode(code: number): boolean {
  return (
    code === JSONRPC_ERRORS.mcpSessionExpired ||
    (code >= -32000 && code <= -32099 && code !== JSONRPC_ERRORS.internal)
  );
}

/** Parse an HTTP response that may be JSON or an SSE stream. */
async function readResponseBody(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream')) {
    const text = await response.text();
    return extractSseData(text);
  }
  return response.text();
}

function extractSseData(text: string): string {
  const events = text
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      return data;
    })
    .filter(Boolean);
  // Multiple SSE events should not happen for one POST, but if they do return
  // the first non-empty one.
  return events[0] ?? '';
}

function parseJsonRpc(body: string): JsonRpcResponse | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as JsonRpcResponse;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export class McpTransportError extends Error {
  override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'McpTransportError';
    this.cause = cause;
  }
}

export class McpHttpStatusError extends Error {
  readonly status: number;
  staleSession = false;
  constructor(status: number, body: string) {
    super(`OpenViking MCP returned HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = 'McpHttpStatusError';
    this.status = status;
  }
}

export class McpRequestError extends Error {
  readonly code: number;
  staleSession = false;
  constructor(method: string, error: JsonRpcError) {
    super(`MCP ${method} failed (${error.code}): ${error.message}`);
    this.name = 'McpRequestError';
    this.code = error.code;
  }
}
