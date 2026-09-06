/**
 * MCP server over stdio that DSH's `dsh-mcp-client` talks to.
 *
 * It behaves as a plain MCP server on stdin/stdout (one JSON-RPC message per
 * line) while forwarding every interesting method to the OpenViking server
 * through the {@link McpHttpClient}. Tool-list drift is detected by diffing
 * snapshots and announced to the client with `notifications/tools/list_changed`
 * so a server upgrade adds tools without a plugin reload.
 */
import { McpHttpClient } from './upstream.js';
export interface StdioServerOptions {
    upstream: McpHttpClient;
    log: (message: string) => void;
    /** Server identity reported during initialize. */
    serverInfo?: {
        name: string;
        version: string;
    };
}
export declare class StdioMcpServer {
    private readonly upstream;
    private readonly log;
    private readonly serverInfo;
    private initialized;
    private lastTools;
    private started;
    constructor(options: StdioServerOptions);
    start(): void;
    private handleLine;
    private handleRequest;
    private handleNotification;
    private announceIfChanged;
    private send;
}
//# sourceMappingURL=stdio-server.d.ts.map