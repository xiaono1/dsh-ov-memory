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
export declare const DEFAULT_ENDPOINT = "http://127.0.0.1:1933";
/** Namespace under which bridged MCP tools are published (`mcp__openviking__*`). */
export declare const MCP_SERVER_NAME = "openviking";
export declare const Config: z<Schemastery.ObjectS<{
    endpoint: z<string, string>;
    apiKey: z<string, string>;
    account: z<string, string>;
    user: z<string, string>;
    peerId: z<string, string>;
    timeoutMs: z<number, number>;
    mcp: z<Schemastery.ObjectS<{
        toolCallTimeoutMs: z<number, number>;
    }>, Schemastery.ObjectT<{
        toolCallTimeoutMs: z<number, number>;
    }>>;
    recall: z<Schemastery.ObjectS<{
        enabled: z<boolean, boolean>;
        budgetTokens: z<number, number>;
        scoreFloor: z<number, number>;
        limit: z<number, number>;
        refreshEverySteps: z<number, number>;
        startupMap: z<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        enabled: z<boolean, boolean>;
        budgetTokens: z<number, number>;
        scoreFloor: z<number, number>;
        limit: z<number, number>;
        refreshEverySteps: z<number, number>;
        startupMap: z<boolean, boolean>;
    }>>;
    capture: z<Schemastery.ObjectS<{
        toolResults: z<boolean, boolean>;
        skipSubagentSessions: z<boolean, boolean>;
        syncTurns: z<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        toolResults: z<boolean, boolean>;
        skipSubagentSessions: z<boolean, boolean>;
        syncTurns: z<boolean, boolean>;
    }>>;
    commit: z<Schemastery.ObjectS<{
        enabled: z<boolean, boolean>;
        thresholdTokens: z<number, number>;
        keepRecentCount: z<number, number>;
        teardown: z<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        enabled: z<boolean, boolean>;
        thresholdTokens: z<number, number>;
        keepRecentCount: z<number, number>;
        teardown: z<boolean, boolean>;
    }>>;
    learn: z<Schemastery.ObjectS<{
        /** Minimum semantic score for an existing memory to merge a lesson into. */
        minScore: z<number, number>;
    }>, Schemastery.ObjectT<{
        /** Minimum semantic score for an existing memory to merge a lesson into. */
        minScore: z<number, number>;
    }>>;
}>, Schemastery.ObjectT<{
    endpoint: z<string, string>;
    apiKey: z<string, string>;
    account: z<string, string>;
    user: z<string, string>;
    peerId: z<string, string>;
    timeoutMs: z<number, number>;
    mcp: z<Schemastery.ObjectS<{
        toolCallTimeoutMs: z<number, number>;
    }>, Schemastery.ObjectT<{
        toolCallTimeoutMs: z<number, number>;
    }>>;
    recall: z<Schemastery.ObjectS<{
        enabled: z<boolean, boolean>;
        budgetTokens: z<number, number>;
        scoreFloor: z<number, number>;
        limit: z<number, number>;
        refreshEverySteps: z<number, number>;
        startupMap: z<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        enabled: z<boolean, boolean>;
        budgetTokens: z<number, number>;
        scoreFloor: z<number, number>;
        limit: z<number, number>;
        refreshEverySteps: z<number, number>;
        startupMap: z<boolean, boolean>;
    }>>;
    capture: z<Schemastery.ObjectS<{
        toolResults: z<boolean, boolean>;
        skipSubagentSessions: z<boolean, boolean>;
        syncTurns: z<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        toolResults: z<boolean, boolean>;
        skipSubagentSessions: z<boolean, boolean>;
        syncTurns: z<boolean, boolean>;
    }>>;
    commit: z<Schemastery.ObjectS<{
        enabled: z<boolean, boolean>;
        thresholdTokens: z<number, number>;
        keepRecentCount: z<number, number>;
        teardown: z<boolean, boolean>;
    }>, Schemastery.ObjectT<{
        enabled: z<boolean, boolean>;
        thresholdTokens: z<number, number>;
        keepRecentCount: z<number, number>;
        teardown: z<boolean, boolean>;
    }>>;
    learn: z<Schemastery.ObjectS<{
        /** Minimum semantic score for an existing memory to merge a lesson into. */
        minScore: z<number, number>;
    }>, Schemastery.ObjectT<{
        /** Minimum semantic score for an existing memory to merge a lesson into. */
        minScore: z<number, number>;
    }>>;
}>>;
/** Everything the plugin reads after normalization. */
export interface ResolvedConfig {
    endpoint: string;
    apiKey: string;
    account: string;
    user: string;
    /** Explicit pinned actor peer (`OPENVIKING_PEER_ID` equivalent). */
    peerId: string;
    timeoutMs: number;
    mcp: {
        serverName: string;
        toolCallTimeoutMs: number;
    };
    recall: {
        enabled: boolean;
        budgetTokens: number;
        scoreFloor: number;
        limit: number;
        refreshEverySteps: number;
        startupMap: boolean;
    };
    capture: {
        toolResults: boolean;
        skipSubagentSessions: boolean;
        syncTurns: boolean;
    };
    commit: {
        enabled: boolean;
        thresholdTokens: number;
        keepRecentCount: number;
        teardown: boolean;
    };
    learn: {
        minScore: number;
    };
}
export declare function normalizeConfig(input: unknown): ResolvedConfig;
//# sourceMappingURL=config.d.ts.map