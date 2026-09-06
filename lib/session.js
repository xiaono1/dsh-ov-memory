/**
 * Mapping between DSH sessions and OpenViking session streams.
 *
 * Each DSH agent session is mirrored into an OpenViking session whose id is
 * derived from the DSH session id (`dsh-<session-id>`). Subagent sessions are
 * regular sessions too, but they can be excluded from capture/recall/commit by
 * configuration.
 */
/** Prefix used for every session this plugin mirrors into OpenViking. */
export const SESSION_PREFIX = 'dsh-';
export function openvikingSessionId(dshSessionId) {
    return dshSessionId.startsWith(SESSION_PREFIX)
        ? dshSessionId
        : `${SESSION_PREFIX}${dshSessionId}`;
}
/** True for sessions created by a subagent driver (header.origin === 'subagent'). */
export function isSubagentSession(session) {
    return session.header?.origin === 'subagent';
}
//# sourceMappingURL=session.js.map