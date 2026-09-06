/**
 * Mapping between DSH sessions and OpenViking session streams.
 *
 * Each DSH agent session is mirrored into an OpenViking session whose id is
 * derived from the DSH session id (`dsh-<session-id>`). Subagent sessions are
 * regular sessions too, but they can be excluded from capture/recall/commit by
 * configuration.
 */
/** Prefix used for every session this plugin mirrors into OpenViking. */
export declare const SESSION_PREFIX = "dsh-";
export declare function openvikingSessionId(dshSessionId: string): string;
/** Duck-typed look at the fields we need from a DSH session object. */
export interface SessionLike {
    id: string;
    header?: {
        origin?: string;
    };
}
/** True for sessions created by a subagent driver (header.origin === 'subagent'). */
export declare function isSubagentSession(session: SessionLike): boolean;
//# sourceMappingURL=session.d.ts.map