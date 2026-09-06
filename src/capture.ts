/**
 * Session capture: translate DSH `session/event` messages into the plain
 * text/role model that gets mirrored to OpenViking.
 *
 * The OpenViking server stores whatever conversation the harness sends it and
 * runs extraction over it later. DSH content blocks are richer than what the
 * memory stream needs, so capture flattens each message to role + text. Two
 * kinds of message are never captured:
 *
 *  - our own injected recall/profile blocks (plugin-sourced user messages),
 *    which would otherwise be re-extracted as memories about memories;
 *  - tool calls (only their results are captured, and only when configured).
 */

export type WireRole = 'user' | 'assistant' | 'tool';

export interface CapturedMessage {
  role: WireRole;
  text: string;
  /** Tool name for tool-result captures, for attribution. */
  toolName?: string;
  /** Message id on the DSH side, for idempotent replay. */
  messageId?: string;
}

export interface CaptureOptions {
  /** Our plugin source string; injected blocks carrying it are skipped. */
  ownPluginSource: string;
  /** Whether tool results should be captured as messages. */
  toolResults: boolean;
}

const OWN_SOURCE = 'ov-memory';

/** Serialize arbitrary content into readable text for the memory stream. */
export function blockToText(block: unknown): string | null {
  if (block === null || block === undefined) return null;
  if (typeof block === 'string') return block;
  if (!(typeof block === 'object')) return String(block);
  const b = block as Record<string, unknown>;
  switch (b.type) {
    case 'text':
      return typeof b.text === 'string' ? b.text : null;
    case 'tool-result': {
      const content = b.content;
      const text =
        typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content.map((part) => blockToText(part)).filter(Boolean).join('\n')
            : null;
      const label = typeof b.name === 'string' ? `[tool ${b.name}]` : '[tool result]';
      return text ? `${label}\n${text}` : null;
    }
    default:
      return null;
  }
}

export function messageToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => blockToText(part))
      .filter((part): part is string => part !== null)
      .join('\n')
      .trim();
  }
  return '';
}

export interface EventLike {
  type?: string;
  session?: unknown;
  data?: unknown;
  message?: unknown;
  [key: string]: unknown;
}

export interface MessageLike {
  id?: string;
  role?: string;
  content?: unknown;
  source?: { kind?: string; plugin?: string };
}

/**
 * Reduce a `session/event` to a CapturedMessage, or null when the event does
 * not map to something the memory stream should store.
 */
export function captureEvent(event: EventLike, options: CaptureOptions): CapturedMessage | null {
  if (!event || typeof event !== 'object') return null;
  const type = event.type;

  if (type === 'user/message') {
    const msg = event.data as MessageLike | undefined;
    if (!isUsableMessage(msg)) return null;
    if (isOwnInjectedBlock(msg, options.ownPluginSource)) return null;
    return { role: 'user', text: messageToText(msg.content), messageId: msg.id };
  }

  if (type === 'assistant/message') {
    const msg = event.message as MessageLike | undefined;
    if (!isUsableMessage(msg)) return null;
    return { role: 'assistant', text: messageToText(msg.content), messageId: msg.id };
  }

  if (type === 'tool/result' && options.toolResults) {
    const msg = event.message as MessageLike | undefined;
    if (!isUsableMessage(msg)) return null;
    const text = messageToText(msg.content);
    const name =
      (msg.source && 'callId' in msg.source
        ? extractToolNameFromSource(msg.source)
        : undefined) ?? undefined;
    return { role: 'tool', text, toolName: name, messageId: msg.id };
  }

  return null;
}

function isUsableMessage(msg: MessageLike | undefined): msg is MessageLike {
  if (!msg || typeof msg !== 'object') return false;
  const text = messageToText(msg.content).trim();
  return text.length > 0;
}

function isOwnInjectedBlock(msg: MessageLike, ownPluginSource: string): boolean {
  const source = msg.source;
  if (!source || source.kind !== 'plugin') return false;
  return source.plugin === ownPluginSource || source.plugin === OWN_SOURCE;
}

function extractToolNameFromSource(source: Record<string, unknown>): string | null {
  // The tool name often travels in the assistant message that preceded the
  // result; when unavailable we only have the call id.
  return typeof source.name === 'string' ? source.name : null;
}
