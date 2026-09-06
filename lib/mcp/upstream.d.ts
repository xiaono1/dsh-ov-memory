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
import type { JsonRpcError, JsonRpcNotification, McpCallResult, McpTool } from './protocol.js';
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
    serverInfo: {
        name: string;
        version: string;
    };
}
export declare class McpHttpClient {
    private readonly url;
    private readonly headers;
    private readonly timeoutMs;
    private readonly fetchImpl;
    private sessionId;
    private session;
    constructor(options: McpHttpClientOptions);
    get serverInfo(): InitializedSession['serverInfo'] | null;
    /** Send a raw JSON-RPC message; used for notifications and tests. */
    notify(notification: JsonRpcNotification): Promise<void>;
    /** Send a request, re-initializing once on a stale-session rejection. */
    request<T = unknown>(method: string, params?: unknown, retried?: boolean): Promise<T>;
    initialize(): Promise<InitializedSession>;
    ping(): Promise<void>;
    listTools(): Promise<McpTool[]>;
    callTool(name: string, args: unknown): Promise<McpCallResult>;
    private seq;
    private nextId;
    private unwrap;
    private post;
}
export declare class McpTransportError extends Error {
    readonly cause?: unknown;
    constructor(message: string, cause?: unknown);
}
export declare class McpHttpStatusError extends Error {
    readonly status: number;
    staleSession: boolean;
    constructor(status: number, body: string);
}
export declare class McpRequestError extends Error {
    readonly code: number;
    staleSession: boolean;
    constructor(method: string, error: JsonRpcError);
}
export {};
//# sourceMappingURL=upstream.d.ts.map