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

export function isRequestMessage(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return 'id' in msg && typeof msg.id !== 'undefined' && !('result' in msg) && !('error' in msg);
}

export function isNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
  return !('id' in msg);
}

export function isResponseMessage(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return 'id' in msg && ('result' in msg || 'error' in msg);
}

export const JSONRPC_ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  mcpSessionExpired: -32001,
} as const;

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export const MCP_LATEST_PROTOCOL = '2025-06-18';

/** MCP JSON-RPC method names. */
export const MCP_METHODS = {
  initialize: 'initialize',
  ping: 'ping',
  toolsList: 'tools/list',
  toolsCall: 'tools/call',
  initializedNotification: 'notifications/initialized',
  toolsListChangedNotification: 'notifications/tools/list_changed',
} as const;
