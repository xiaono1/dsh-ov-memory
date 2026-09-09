/**
 * Per-profile runtime that wires capture, recall, commit and the outbox
 * together. The hook layer (index.ts) translates DSH events into calls on this
 * class; keeping the runtime free of DSH types makes it directly unit-testable.
 */

import { createHash } from 'node:crypto';
import type { Logger } from './types.js';
import type { ResolvedConfig } from './config.js';
import type { EffectiveSettings } from './settings.js';
import { resolvePeer } from './peer.js';
import { Outbox } from './outbox.js';
import { OpenVikingClient } from './client/openviking.js';
import type { CommitResult } from './client/openviking.js';
import { openvikingSessionId, isSubagentSession } from './session.js';
import type { SessionLike } from './session.js';
import { captureEvent } from './capture.js';
import type { CapturedMessage, EventLike } from './capture.js';
import { buildProfileText, buildRecallText } from './recall.js';
import { learnLesson, prepareLesson } from './learn.js';
import type { LearnResult } from './learn.js';

export interface RuntimeOptions {
  config: ResolvedConfig;
  settings: EffectiveSettings;
  client: OpenVikingClient;
  outbox?: Outbox;
  logger?: Logger;
  /** Workspace used to derive the actor peer when not pinned. */
  cwd?: string;
}

export interface PeerContext {
  /** Peer id to send, or undefined for user-level writes. */
  actorPeerId: string | undefined;
}

export class MemoryRuntime {
  readonly config: ResolvedConfig;
  readonly settings: EffectiveSettings;
  readonly client: OpenVikingClient;
  readonly outbox: Outbox;
  readonly logger: Logger;

  private readonly actorPeerId: string | undefined;
  private readonly sessionDir: string;
  private readonly recentQueries = new Map<string, string>();
  private readonly stepCounters = new Map<string, number>();
  private readonly injectedUris = new Map<string, string[]>();
  private readonly pendingFlush = new Set<string>();

  constructor(options: RuntimeOptions) {
    this.config = options.config;
    this.settings = options.settings;
    this.client = options.client;
    this.outbox = options.outbox ?? new Outbox();
    this.logger = options.logger ?? { log: () => {}, warn: () => {}, error: () => {} };
    const peer = resolvePeer({
      explicit: this.settings.pinnedPeerId || undefined,
      cwd: options.cwd ?? process.cwd(),
    });
    this.actorPeerId = peer.peerId ?? undefined;
    this.sessionDir = this.outbox.dir;
    void this.sessionDir;
  }

  /** Peer used for all session-specific requests of this profile. */
  get peer(): PeerContext {
    return { actorPeerId: this.actorPeerId };
  }

  /** True when this session should be excluded from capture/commit. */
  shouldSkip(session: SessionLike): boolean {
    return this.config.capture.skipSubagentSessions && isSubagentSession(session);
  }

  /**
   * OpenViking session id for a DSH session (dsh-<session-id>).
   */
  ovSessionId(dshSessionId: string): string {
    return openvikingSessionId(dshSessionId);
  }

  /** Create the mirror session; tolerates an existing one. */
  async ensureSession(dshSessionId: string): Promise<void> {
    const sid = this.ovSessionId(dshSessionId);
    try {
      await this.client.getSession(sid, this.actorPeerId);
    } catch {
      /* fall through to create */
    }
    try {
      await this.client.ensureSession(sid, this.actorPeerId);
    } catch (err) {
      const status = (err as { httpStatus?: number }).httpStatus;
      if (status !== 409) this.logger.warn(`ensure session failed: ${(err as Error).message}`);
    }
  }

  /**
   * Replay the outbox (called once per agent session start). Writes that could
   * not reach the server earlier are sent now, in order, idempotently.
   */
  async replayOutbox(): Promise<void> {
    try {
      const stats = await this.outbox.replay(async (item) => {
        if (item.type === 'add-message' && item.sessionId) {
          const payload = item.payload as { role: 'user' | 'assistant'; content: string; peerId?: string };
          await this.client.addMessage(item.sessionId, payload, payload.peerId || this.actorPeerId);
        } else if (item.type === 'commit' && item.sessionId) {
          const payload = item.payload as { keepRecentCount?: number; peerId?: string };
          await this.client.commitSession(
            item.sessionId,
            payload.keepRecentCount ?? this.config.commit.keepRecentCount,
            payload.peerId || this.actorPeerId,
          );
        } else if (item.type === 'learn-append') {
          const payload = item.payload as { content: string; peerId?: string };
          const attempt = await learnLesson(this.client, {
            lesson: payload.content,
            minScore: this.config.learn.minScore,
            actorPeerId: payload.peerId || this.actorPeerId,
          });
          if (attempt.action === 'no-match') {
            // The merge target is resolved at replay time; if no memory is
            // close enough by then, drop the lesson rather than retry forever.
            this.logger.warn(`queued lesson found no merge target at replay: ${attempt.message}`);
          }
        } else {
          // Unknown or corrupt envelope (e.g. left behind by another plugin):
          // leave it.
          this.logger.log(`skip outbox item with unknown type: ${item.type}`);
          return 'skip';
        }
      });
      if (stats.replayed > 0 || stats.failed > 0) {
        this.logger.log(`outbox replay: ${JSON.stringify(stats)}`);
      }
    } catch (err) {
      this.logger.warn(`outbox replay aborted: ${(err as Error).message}`);
    }
  }

  /** Build and inject the session-start profile/index, returning its text. */
  async profileText(): Promise<string | null> {
    try {
      return await buildProfileText(this.client, this.config, {
        actorPeerId: this.actorPeerId,
      });
    } catch (err) {
      this.logger.warn(`profile lookup skipped: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Recall for one agent step. Returns recall text or null. Only fires when the
   * driving user query changed since the last injection, or when the configured
   * refresh cadence is reached.
   */
  async recallTextForStep(dshSessionId: string | undefined, query: string): Promise<string | null> {
    if (!this.config.recall.enabled) return null;
    const trimmed = query.trim();
    if (!trimmed) return null;

    const key = dshSessionId ?? '<global>';
    const previous = this.recentQueries.get(key) ?? '';
    const steps = (this.stepCounters.get(key) ?? 0) + 1;
    this.stepCounters.set(key, steps);
    const changed = previous !== trimmed;
    const cadence = this.config.recall.refreshEverySteps;
    const due = changed || (cadence > 0 && steps % cadence === 0);
    if (!due && previous !== '') return null;

    try {
      const ovSession = dshSessionId ? this.ovSessionId(dshSessionId) : '';
      const text = await buildRecallText(this.client, this.config, {
        query: trimmed,
        ovSessionId: ovSession,
        actorPeerId: this.actorPeerId,
        excludeUris: this.injectedUris.get(key),
      });
      if (!text) return null;
      this.recentQueries.set(key, trimmed);
      // Remember URIs mentioned so later steps don't re-inject the same items.
      const uris = extractVikingUris(text);
      const prior = this.injectedUris.get(key) ?? [];
      this.injectedUris.set(key, [...prior, ...uris].slice(-200));
      return text;
    } catch (err) {
      this.logger.warn(`recall skipped: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Capture one session event into the mirror stream. Returns the captured
   * message, or null when nothing was captured. Network failures are queued to
   * the outbox instead of thrown.
   */
  async captureEvent(session: SessionLike, event: EventLike): Promise<CapturedMessage | null> {
    if (!this.config.capture.syncTurns) return null;
    if (this.shouldSkip(session)) return null;

    const captured = captureEvent(event, {
      ownPluginSource: 'ov-memory',
      toolResults: this.config.capture.toolResults,
    });
    if (!captured) return null;

    const sid = this.ovSessionId(session.id);
    const dedupKey = `${sid}|${captured.role}|${
      captured.messageId ?? hashText(captured.text)
    }`;
    try {
      await this.client.addMessage(
        sid,
        { role: captured.role === 'tool' ? 'user' : captured.role, content: captured.text },
        this.actorPeerId,
      );
    } catch (err) {
      if (this.client.isRetryable(err)) {
        this.outbox.enqueue({
          type: 'add-message',
          sessionId: sid,
          payload: {
            role: captured.role === 'tool' ? 'user' : captured.role,
            content: captured.text,
            peerId: this.actorPeerId,
          },
          dedupKey,
        });
        this.logger.log(`capture queued to outbox (${sid})`);
      } else {
        this.logger.warn(`capture dropped (non-retryable): ${(err as Error).message}`);
      }
    }
    return captured;
  }

  /**
   * Threshold commit check, called at turn end. Commits when the server reports
   * pending_tokens >= threshold.
   */
  async maybeCommit(session: SessionLike): Promise<CommitResult | null> {
    if (!this.config.commit.enabled || !this.config.capture.syncTurns) return null;
    if (this.shouldSkip(session)) return null;
    const sid = this.ovSessionId(session.id);
    try {
      const info = await this.client.getSession(sid, this.actorPeerId);
      const pending = info?.pending_tokens ?? 0;
      if (pending >= this.config.commit.thresholdTokens) {
        const result = await this.commitOnce(sid);
        this.pendingFlush.clear();
        return result;
      }
      return null;
    } catch (err) {
      this.logger.warn(`commit check skipped: ${(err as Error).message}`);
      return null;
    }
  }

  /** Final commit at session flush / teardown (server skips when idle). */
  async flushCommit(session: SessionLike): Promise<void> {
    if (!this.config.commit.enabled || !this.config.commit.teardown) return;
    if (!this.config.capture.syncTurns) return;
    if (this.shouldSkip(session)) return;
    const sid = this.ovSessionId(session.id);
    try {
      await this.commitOnce(sid);
    } catch (err) {
      if (this.client.isRetryable(err)) {
        this.outbox.enqueue({
          type: 'commit',
          sessionId: sid,
          payload: {
            keepRecentCount: this.config.commit.keepRecentCount,
            peerId: this.actorPeerId,
          },
          dedupKey: `${sid}|commit|flush`,
        });
      } else {
        this.logger.warn(`flush commit failed: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Persist a human-supplied lesson (`/memlearn`): redact, then merge into the
   * closest existing memory. Retryable failures (server unreachable) queue to
   * the outbox instead of throwing, so the command works offline.
   */
  async learn(memory: string): Promise<LearnResult> {
    const prepared = prepareLesson(memory);
    try {
      const attempt = await learnLesson(this.client, {
        lesson: prepared.text,
        minScore: this.config.learn.minScore,
        actorPeerId: this.actorPeerId,
      });
      return { ...attempt, redacted: prepared.redacted };
    } catch (err) {
      if (this.client.isRetryable(err)) {
        this.outbox.enqueue({
          type: 'learn-append',
          payload: { content: prepared.text, peerId: this.actorPeerId },
          dedupKey: `learn|${hashText(prepared.text)}`,
        });
        this.logger.log('learn queued to outbox');
        return {
          action: 'queued',
          uri: '',
          redacted: prepared.redacted,
          message: 'OpenViking is unreachable — the lesson was queued locally.',
        };
      }
      throw err;
    }
  }

  private async commitOnce(sid: string): Promise<CommitResult> {
    return this.client.commitSession(
      sid,
      this.config.commit.keepRecentCount,
      this.actorPeerId,
    );
  }

  dispose(): void {
    this.recentQueries.clear();
    this.stepCounters.clear();
    this.injectedUris.clear();
    this.pendingFlush.clear();
  }
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function extractVikingUris(text: string): string[] {
  const uris: string[] = [];
  for (const match of text.matchAll(/viking:\/\/[^\s"'`<>]+/g)) uris.push(match[0]);
  return uris;
}
