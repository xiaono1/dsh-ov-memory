/**
 * MCP server over stdio that DSH's `dsh-mcp-client` talks to.
 *
 * It behaves as a plain MCP server on stdin/stdout (one JSON-RPC message per
 * line) while forwarding every interesting method to the OpenViking server
 * through the {@link McpHttpClient}. Tool-list drift is detected by diffing
 * snapshots and announced to the client with `notifications/tools/list_changed`
 * so a server upgrade adds tools without a plugin reload.
 */

import { createInterface } from 'node:readline';
import {
  JSONRPC_ERRORS,
  MCP_LATEST_PROTOCOL,
  MCP_METHODS,
} from './protocol.js';
import type {
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  McpTool,
} from './protocol.js';
import { McpHttpClient } from './upstream.js';

export interface StdioServerOptions {
  upstream: McpHttpClient;
  log: (message: string) => void;
  /** Server identity reported during initialize. */
  serverInfo?: { name: string; version: string };
}

export class StdioMcpServer {
  private readonly upstream: McpHttpClient;
  private readonly log: (message: string) => void;
  private readonly serverInfo: { name: string; version: string };
  private initialized = false;
  private lastTools: string[] = [];
  private started = false;

  constructor(options: StdioServerOptions) {
    this.upstream = options.upstream;
    this.log = options.log;
    this.serverInfo = options.serverInfo ?? { name: 'ov-memory-proxy', version: '0.1.0' };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      this.handleLine(trimmed).catch((err) => {
        this.log(`fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
      });
    });
    rl.on('close', () => {
      /* stdin EOF: parent process went away */
    });
  }

  private async handleLine(line: string): Promise<void> {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      this.send({ jsonrpc: '2.0', id: null, error: { code: JSONRPC_ERRORS.parse, message: 'parse error' } });
      return;
    }
    if (!isPlainObject(message) || message.jsonrpc !== '2.0') {
      this.send({ jsonrpc: '2.0', id: null, error: { code: JSONRPC_ERRORS.invalidRequest, message: 'invalid request' } });
      return;
    }
    if (typeof message.id === 'undefined') {
      await this.handleNotification(message as unknown as JsonRpcNotification);
      return;
    }
    await this.handleRequest(message as unknown as JsonRpcRequest);
  }

  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    const id = request.id;
    try {
      switch (request.method) {
        case MCP_METHODS.initialize:
          this.initialized = true;
          this.send({
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: MCP_LATEST_PROTOCOL,
              capabilities: { tools: { listChanged: true } },
              serverInfo: this.serverInfo,
            },
          });
          return;
        case MCP_METHODS.ping:
          this.send({ jsonrpc: '2.0', id, result: {} });
          return;
        case MCP_METHODS.toolsList: {
          const tools = await this.upstream.listTools();
          this.announceIfChanged(tools);
          this.send({ jsonrpc: '2.0', id, result: { tools } });
          return;
        }
        case MCP_METHODS.toolsCall: {
          const params = (request.params ?? {}) as { name?: string; arguments?: unknown };
          const result = await this.upstream.callTool(params.name ?? '', params.arguments);
          this.send({ jsonrpc: '2.0', id, result });
          return;
        }
        default:
          this.send({
            jsonrpc: '2.0',
            id,
            error: {
              code: JSONRPC_ERRORS.methodNotFound,
              message: `method not found: ${request.method}`,
            },
          });
      }
    } catch (err) {
      this.log(`request ${request.method} failed: ${err instanceof Error ? err.message : String(err)}`);
      this.send({
        jsonrpc: '2.0',
        id,
        error: {
          code: JSONRPC_ERRORS.internal,
          message: err instanceof Error ? err.message : 'internal error',
        },
      });
    }
  }

  private async handleNotification(notification: JsonRpcNotification): Promise<void> {
    if (notification.method === MCP_METHODS.initializedNotification) {
      // The client confirmed initialize; nothing else to do — tools are fetched
      // lazily on the first tools/list.
      return;
    }
  }

  private announceIfChanged(tools: McpTool[]): void {
    const fingerprint = tools.map((t) => t.name).sort().join('\n');
    if (this.lastTools.length > 0 && fingerprint !== this.lastTools.join('\n')) {
      this.send({ jsonrpc: '2.0', method: MCP_METHODS.toolsListChangedNotification });
    }
    this.lastTools = fingerprint ? fingerprint.split('\n') : [];
  }

  private send(message: JsonRpcResponse | JsonRpcNotification): void {
    process.stdout.write(`${JSON.stringify(message)}\n`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
