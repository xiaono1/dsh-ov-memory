/**
 * Minimal JSON-RPC 2.0 / MCP wire types shared by the proxy's two transports.
 *
 * We deliberately avoid a full MCP SDK: the surface the proxy needs
 * (initialize, ping, tools/list, tools/call, notifications) is small and stable
 * enough to implement directly, and keeping the runtime dependency-free makes
 * the bundle installable anywhere DSH itself runs.
 */
export interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: number | string;
    method: string;
    params?: unknown;
}
export interface JsonRpcNotification {
    jsonrpc: '2.0';
    method: string;
    params?: unknown;
}
export interface JsonRpcError {
    code: number;
    message: string;
    data?: unknown;
}
export interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: number | string | null;
    result?: unknown;
    error?: JsonRpcError;
}
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;
export declare function isRequestMessage(msg: JsonRpcMessage): msg is JsonRpcRequest;
export declare function isNotification(msg: JsonRpcMessage): msg is JsonRpcNotification;
export declare function isResponseMessage(msg: JsonRpcMessage): msg is JsonRpcResponse;
export declare const JSONRPC_ERRORS: {
    readonly parse: -32700;
    readonly invalidRequest: -32600;
    readonly methodNotFound: -32601;
    readonly invalidParams: -32602;
    readonly internal: -32603;
    readonly mcpSessionExpired: -32001;
};
export interface McpTool {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
}
export interface McpCallResult {
    content: Array<{
        type: string;
        text?: string;
    }>;
    isError?: boolean;
}
export declare const MCP_LATEST_PROTOCOL = "2025-06-18";
/** MCP JSON-RPC method names. */
export declare const MCP_METHODS: {
    readonly initialize: 'initialize';
    readonly ping: 'ping';
    readonly toolsList: 'tools/list';
    readonly toolsCall: 'tools/call';
    readonly initializedNotification: 'notifications/initialized';
    readonly toolsListChangedNotification: 'notifications/tools/list_changed';
};
//# sourceMappingURL=protocol.d.ts.map