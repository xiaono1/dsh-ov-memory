/**
 * Minimal JSON-RPC 2.0 / MCP wire types shared by the proxy's two transports.
 *
 * We deliberately avoid a full MCP SDK: the surface the proxy needs
 * (initialize, ping, tools/list, tools/call, notifications) is small and stable
 * enough to implement directly, and keeping the runtime dependency-free makes
 * the bundle installable anywhere DSH itself runs.
 */
export function isRequestMessage(msg) {
    return 'id' in msg && typeof msg.id !== 'undefined' && !('result' in msg) && !('error' in msg);
}
export function isNotification(msg) {
    return !('id' in msg);
}
export function isResponseMessage(msg) {
    return 'id' in msg && ('result' in msg || 'error' in msg);
}
export const JSONRPC_ERRORS = {
    parse: -32700,
    invalidRequest: -32600,
    methodNotFound: -32601,
    invalidParams: -32602,
    internal: -32603,
    mcpSessionExpired: -32001,
};
export const MCP_LATEST_PROTOCOL = '2025-06-18';
/** MCP JSON-RPC method names. */
export const MCP_METHODS = {
    initialize: 'initialize',
    ping: 'ping',
    toolsList: 'tools/list',
    toolsCall: 'tools/call',
    initializedNotification: 'notifications/initialized',
    toolsListChangedNotification: 'notifications/tools/list_changed',
};
//# sourceMappingURL=protocol.js.map