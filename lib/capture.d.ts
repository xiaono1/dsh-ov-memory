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
/** Serialize arbitrary content into readable text for the memory stream. */
export declare function blockToText(block: unknown): string | null;
export declare function messageToText(content: unknown): string;
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
    source?: {
        kind?: string;
        plugin?: string;
    };
}
/**
 * Reduce a `session/event` to a CapturedMessage, or null when the event does
 * not map to something the memory stream should store.
 */
export declare function captureEvent(event: EventLike, options: CaptureOptions): CapturedMessage | null;
//# sourceMappingURL=capture.d.ts.map