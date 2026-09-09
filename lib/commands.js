/**
 * `/memlearn <lesson>` — the human channel for persisting a lesson.
 *
 * Unlike the model-facing `mcp__openviking__*` tools, this command starts no
 * model turn: DSH routes it straight to the plugin, so the lesson costs zero
 * tokens and its raw text never reaches the LLM. `recordInput` is false for
 * the same reason — the session log is itself mirrored into OpenViking, and
 * recording the raw lesson there would defeat the secret redaction.
 *
 * The registry is an optional host capability: on hosts without a command
 * service, registration silently no-ops, so the plugin adds no hard
 * dependency on `@deepseek-ai/dsh-commands` (types are local and structural).
 */
export const MEMLEARN_USAGE = [
    'Usage: /memlearn <lesson>',
    '',
    'Persist a reusable, self-contained lesson into OpenViking memory. The lesson',
    'is secret-redacted, merged into the closest existing memory (when one clears',
    'the score floor), and becomes searchable in future sessions. No model turn',
    'is started; nothing is persisted when the input is empty.',
    '',
    'Example:',
    '  /memlearn The deployment requires a fake server before lifecycle tests',
].join('\n');
// ─── result formatting ───────────────────────────────────────────────────
export function formatMemlearnResult(result) {
    const lines = [`Learned: ${result.action}`];
    lines.push(`uri: ${result.uri || '(none)'}`);
    if (result.score !== undefined)
        lines.push(`score: ${result.score.toFixed(2)}`);
    if (result.redacted > 0)
        lines.push(`redacted: ${result.redacted} secret(s)`);
    lines.push(result.message);
    if (result.action === 'queued') {
        lines.push('The lesson is queued in the local outbox and replays at the next session start.');
    }
    return lines.join('\n');
}
async function runMemlearn(invocation, deps) {
    const lesson = invocation.rawInput.trim();
    if (!lesson)
        return { kind: 'error', text: MEMLEARN_USAGE };
    try {
        const result = await deps.learn(lesson);
        return { kind: 'success', text: formatMemlearnResult(result) };
    }
    catch (err) {
        if (invocation.signal?.aborted) {
            return { kind: 'error', text: '/memlearn cancelled — nothing was persisted.' };
        }
        return {
            kind: 'error',
            text: `/memlearn failed: ${err.message} Nothing was persisted.`,
        };
    }
}
// ─── registration ────────────────────────────────────────────────────────
/**
 * Register `/memlearn` when the host provides a command registry. Safe to
 * call unconditionally — hosts without the capability are skipped.
 */
export function registerMemlearnCommand(ctx, deps) {
    ctx.inject?.(['commands'], (scoped) => {
        const registry = scoped.commands;
        if (!registry)
            return;
        registry.register({
            name: 'memlearn',
            description: 'Persist a lesson to OpenViking memory (secret-redacted, dedupe-merged)',
            input: { hint: '<lesson to remember>' },
            // The redacted persisted memory is authoritative; the raw lesson (which
            // may contain secrets) must not be duplicated into the session log.
            recordInput: false,
            handler: (invocation) => runMemlearn(invocation, deps),
        });
    });
}
//# sourceMappingURL=commands.js.map