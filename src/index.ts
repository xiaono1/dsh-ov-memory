/**
 * dsh-ov-memory plugin entry.
 *
 * A cordis plugin that mirrors DSH agent sessions into OpenViking:
 *
 *  - `agent/session-start`  → ensure session, replay outbox, inject profile/index
 *  - `agent/pre-step`       → recall relevant memory and append it to the step
 *  - `session/event`        → capture user/assistant (and optional tool) messages
 *  - `session/event` turn-end → threshold commit (pending_tokens)
 *  - `session/flush`        → final commit at session teardown
 *  - `tools/pre-execute`    → keep local tools away from viking:// URIs
 *  - plus an isolated skill provider and the bridged `mcp__openviking__*` tools
 */

import { fileURLToPath } from 'node:url';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
import * as skillFilesystem from '@deepseek-ai/dsh-skill-filesystem';

import { Config, normalizeConfig } from './config.js';
import { resolveEffective } from './settings.js';
import { OpenVikingClient } from './client/openviking.js';
import { MemoryRuntime } from './runtime.js';
import { guardVikingUri } from './guard.js';
import { buildMcpClientConfig } from './mcp/mount.js';
import { messageToText } from './capture.js';
import type { Logger } from './types.js';

export const name = 'ov-memory';

interface AgentLike {
  id?: string;
  session?: { id?: string };
  status?: string;
  inject?: (message: unknown) => unknown;
}

interface PreStepPayloadLike {
  agent?: AgentLike;
  messages?: readonly unknown[];
}

interface PreStepDecisionLike {
  kind: string;
  messages?: unknown[];
}

/** Minimal shape of a cordis context we consume. */
interface CtxLike {
  logger: Logger;
  plugin(plugin: unknown, config?: unknown): unknown;
  on(event: string, listener: (...args: any[]) => unknown, options?: { prepend?: boolean }): unknown;
  effect(fn: (() => void) | (() => () => void), label?: string): unknown;
}

function sessionIdOf(agent: AgentLike | undefined): string | undefined {
  if (!agent) return undefined;
  const viaSession = agent.session?.id;
  return viaSession ?? agent.id;
}

function lastUserText(messages: readonly unknown[] | undefined): string {
  if (!messages) return '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i] as { role?: string; content?: unknown } | undefined;
    if (message && (message.role === 'user' || message.role === 'tool')) {
      const text = messageToText(message.content).trim();
      if (text) return text;
    }
  }
  return '';
}

const SKILLS_DIR = fileURLToPath(new URL('../skills', import.meta.url));
const SKILL_PROVIDER = 'ov-memory';

export function apply(ctx: CtxLike, input: unknown = {}): void {
  const config = normalizeConfig(input);
  const settings = resolveEffective(config);
  const client = new OpenVikingClient(settings);
  const runtime = new MemoryRuntime({
    config,
    settings,
    client,
    logger: ctx.logger,
  });

  // Skill provider — isolated so it never shadows DSH's own skill roots.
  try {
    ctx.plugin(skillFilesystem, {
      providerName: SKILL_PROVIDER,
      includeDefaultRoots: false,
      customSkillDirs: [SKILLS_DIR],
      watch: true,
    });
  } catch (err) {
    ctx.logger.warn(`[ov-memory] skill provider failed: ${(err as Error).message}`);
  }

  // Session-start: ensure the mirror session, replay the outbox, inject profile.
  ctx.on('agent/session-start', async (payload: { agent?: AgentLike; source?: string }) => {
    const agent = payload.agent;
    const dshSessionId = sessionIdOf(agent);
    if (!dshSessionId) return;
    try {
      await runtime.replayOutbox();
      await runtime.ensureSession(dshSessionId);
      if (config.recall.startupMap && agent && agent.status === 'idle' && agent.inject) {
        const text = await runtime.profileText();
        if (text) {
          agent.inject(
            createUserMessage({
              content: [{ type: 'text', text }],
              source: {
                kind: 'plugin',
                plugin: name,
                form: 'snapshot',
                sections: [{ name: 'openviking', text }],
              },
            }),
          );
        }
      }
    } catch (err) {
      ctx.logger.warn(`[ov-memory] session-start: ${(err as Error).message}`);
    }
  });

  // Pre-step recall: append an attributed user message to the step's messages.
  ctx.on(
    'agent/pre-step',
    async (payload: PreStepPayloadLike, next: () => Promise<PreStepDecisionLike>) => {
      const decision = await next();
      if (!decision || decision.kind !== 'enter' || !config.recall.enabled) return decision;
      const query = lastUserText(payload.messages);
      if (!query) return decision;
      const text = await runtime.recallTextForStep(sessionIdOf(payload.agent), query);
      if (!text) return decision;
      const messages = [...(decision.messages ?? [])];
      messages.push(
        createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'plugin', plugin: name, form: 'recall' },
        }),
      );
      return { ...decision, messages };
    },
    { prepend: true },
  );

  // Session events: capture messages and run the threshold commit at turn end.
  ctx.on('session/event', async (session: { id?: string }, event: { type?: string }) => {
    if (!session?.id) return;
    const type = event?.type;
    try {
      if (type === 'turn/end') {
        await runtime.maybeCommit(session as never);
        return;
      }
      if (type === 'user/message' || type === 'assistant/message' || type === 'tool/result') {
        await runtime.captureEvent(session as never, event as never);
      }
    } catch (err) {
      ctx.logger.warn(`[ov-memory] session/event: ${(err as Error).message}`);
    }
  });

  // Final commit when the session flushes (teardown / persistence checkpoint).
  ctx.on('session/flush', (session: { id?: string }) => {
    if (!session?.id) return;
    runtime
      .flushCommit(session as never)
      .catch((err: Error) => ctx.logger.warn(`[ov-memory] flush: ${err.message}`));
  });

  // URI guard: local tools must never receive viking:// targets.
  ctx.on(
    'tools/pre-execute',
    async (
      exec: { name: string; arguments?: unknown },
      next: () => Promise<unknown>,
    ) => {
      const decision = guardVikingUri(exec);
      return decision.kind === 'allow' ? next() : decision;
    },
  );

  // MCP bridge mounted last so a dead server never blocks startup above it.
  try {
    ctx.plugin(mcpClient, buildMcpClientConfig(config, settings));
  } catch (err) {
    ctx.logger.warn(`[ov-memory] MCP bridge failed: ${(err as Error).message}`);
  }

  ctx.effect(() => () => runtime.dispose(), name);
}
