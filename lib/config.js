/**
 * Plugin configuration.
 *
 * The schema is validated by cordis when the plugin boots (schemastery), and
 * `normalizeConfig()` normalizes the validated shape afterwards so the rest of
 * the code can rely on a fully populated object. Credentials may come from the
 * environment or the OpenViking config files instead of the patch — see
 * `credentials.ts`.
 */
import z from '@deepseek-ai/schemastery';
export const DEFAULT_ENDPOINT = 'http://127.0.0.1:1933';
/** Namespace under which bridged MCP tools are published (`mcp__openviking__*`). */
export const MCP_SERVER_NAME = 'openviking';
export const Config = z.object({
    endpoint: z.string().default(DEFAULT_ENDPOINT),
    apiKey: z.string(),
    account: z.string(),
    user: z.string(),
    peerId: z.string(),
    timeoutMs: z.number().min(100).max(600000).default(15000),
    mcp: z.object({
        toolCallTimeoutMs: z.number().min(1000).max(600000).default(60000),
    }),
    recall: z.object({
        enabled: z.boolean().default(true),
        budgetTokens: z.number().min(0).max(20000).default(2000),
        scoreFloor: z.number().min(0).max(1).default(0.35),
        limit: z.number().min(1).max(50).default(8),
        refreshEverySteps: z.number().min(0).max(100).default(0),
        startupMap: z.boolean().default(true),
    }),
    capture: z.object({
        toolResults: z.boolean().default(false),
        skipSubagentSessions: z.boolean().default(false),
        syncTurns: z.boolean().default(true),
    }),
    commit: z.object({
        enabled: z.boolean().default(true),
        thresholdTokens: z.number().min(1000).max(1000000).default(20000),
        keepRecentCount: z.number().min(0).max(1000).default(10),
        teardown: z.boolean().default(true),
    }),
    learn: z.object({
        /** Minimum semantic score for an existing memory to merge a lesson into. */
        minScore: z.number().min(0).max(1).default(0.5),
    }),
});
export function normalizeConfig(input) {
    const raw = Config(input ?? {});
    return {
        endpoint: (raw.endpoint ?? DEFAULT_ENDPOINT).replace(/\/+$/, ''),
        apiKey: raw.apiKey ?? '',
        account: raw.account ?? '',
        user: raw.user ?? '',
        peerId: raw.peerId ?? '',
        timeoutMs: raw.timeoutMs ?? 15000,
        mcp: {
            serverName: MCP_SERVER_NAME,
            toolCallTimeoutMs: raw.mcp?.toolCallTimeoutMs ?? 60000,
        },
        recall: {
            enabled: raw.recall?.enabled ?? true,
            budgetTokens: raw.recall?.budgetTokens ?? 2000,
            scoreFloor: raw.recall?.scoreFloor ?? 0.35,
            limit: raw.recall?.limit ?? 8,
            refreshEverySteps: raw.recall?.refreshEverySteps ?? 0,
            startupMap: raw.recall?.startupMap ?? true,
        },
        capture: {
            toolResults: raw.capture?.toolResults ?? false,
            skipSubagentSessions: raw.capture?.skipSubagentSessions ?? false,
            syncTurns: raw.capture?.syncTurns ?? true,
        },
        commit: {
            enabled: raw.commit?.enabled ?? true,
            thresholdTokens: raw.commit?.thresholdTokens ?? 20000,
            keepRecentCount: raw.commit?.keepRecentCount ?? 10,
            teardown: raw.commit?.teardown ?? true,
        },
        learn: {
            minScore: raw.learn?.minScore ?? 0.5,
        },
    };
}
//# sourceMappingURL=config.js.map