/**
 * Guard that keeps DSH's built-in filesystem/shell tools away from `viking://`
 * URIs.
 *
 * `viking://` paths are virtual database paths inside OpenViking, not local
 * files. When the model hands one to a local tool the result is a confusing
 * error at best and a crash at worst, so the guard denies the call and points
 * the model at the bridged `mcp__openviking__*` tools that understand those
 * URIs.
 *
 * The guard is intentionally pure: it maps a tool call to a decision and lets
 * the hook layer apply it.
 */

import { MCP_SERVER_NAME } from './config.js';
import { hasVikingTarget } from './uri.js';

export interface ToolCallLike {
  name: string;
  arguments?: unknown;
}

export type GuardDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'ask'; reason: string };

/** Built-in tool families that must never receive a viking URI. */
const LOCAL_PATH_TOOLS = new Set([
  'fs_read',
  'fs_write',
  'fs_edit',
  'fs_search',
  'fs_glob',
  'read',
  'write',
  'edit',
  'str_replace_editor',
  'bash',
  'pwsh',
  'shell',
]);

/** Sanitized MCP tool prefix for our own bridged tools. */
function mcpName(raw: string): string {
  return `mcp__${MCP_SERVER_NAME}__${raw}`;
}

/** Short display names for the model-facing tool the guard suggests. */
const REMEDY_BY_FAMILY: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(fs_)?read|read$/i, 'read'],
  [/^(fs_)?write|^write$|str_replace_editor|edit/i, 'write'],
  [/search|grep/i, 'grep'],
  [/glob/i, 'glob'],
];

export function isOwnMcpTool(name: string): boolean {
  return name.startsWith(`mcp__${MCP_SERVER_NAME}__`);
}

export function guardVikingUri(call: ToolCallLike): GuardDecision {
  if (isOwnMcpTool(call.name)) return { kind: 'allow' };
  if (!LOCAL_PATH_TOOLS.has(call.name)) return { kind: 'allow' };
  if (!hasVikingTarget(call.arguments)) return { kind: 'allow' };

  const remedy =
    REMEDY_BY_FAMILY.find(([pattern]) => pattern.test(call.name))?.[1] ?? 'read';
  return {
    kind: 'deny',
    reason:
      `"${call.name}" operates on local files, but the call targets a viking:// ` +
      `(OpenViking) virtual path. Use the bridged tool ${mcpName(remedy)}() ` +
      `(or another mcp__${MCP_SERVER_NAME}__* tool) which resolves viking:// URIs ` +
      `inside OpenViking instead.`,
  };
}

/** Reason text for a model-visible guard message when the deny is surfaced. */
export function guardMessageFor(decision: Extract<GuardDecision, { kind: 'deny' }>): string {
  return decision.reason;
}
