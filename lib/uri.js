/**
 * Minimal parsing/normalization helpers for `viking://` URIs.
 *
 * A viking URI has the shape `viking://{scope}/{path}`. This module only
 * manipulates URI strings — it never touches the filesystem, and it is the
 * single place where scope classification lives so the guard and the tools
 * agree on what a target means.
 */
export const VIKING_SCHEME = 'viking:';
const URI_RE = /^viking:\/\/([^/]+)(\/.*)?$/;
export function isVikingUri(value) {
    return typeof value === 'string' && value.startsWith(VIKING_SCHEME);
}
export function parseVikingUri(raw) {
    const m = URI_RE.exec(raw);
    if (!m)
        return null;
    const authority = m[1];
    const rest = (m[2] ?? '').replace(/^\/+/, '');
    const segments = rest ? rest.split('/') : [];
    const isHome = authority === '~';
    return {
        raw,
        scope: authority,
        segments,
        isHome,
        kind: segments[0],
    };
}
/**
 * Re-classify an authority for human-facing policy wording. `~` is resolved
 * server-side to the caller's own user space, so policy treats it as user.
 */
export function classifyScope(uri) {
    if (uri.isHome)
        return 'user';
    if (uri.scope === 'public' || uri.scope === 'resources')
        return uri.scope;
    if (uri.scope === 'user' || uri.scope === 'agent')
        return uri.scope;
    return 'internal';
}
/** Every `viking://` URI found in an arbitrary argument value (string or nested strings). */
export function findVikingUris(value, out = []) {
    if (typeof value === 'string') {
        if (value.startsWith(VIKING_SCHEME)) {
            out.push(value);
            return out;
        }
        // A URI may be embedded inside a shell command or message text.
        for (const match of value.matchAll(/viking:\/\/[^\s"'`<>]+/g)) {
            out.push(match[0]);
        }
        return out;
    }
    if (Array.isArray(value)) {
        for (const item of value)
            findVikingUris(item, out);
        return out;
    }
    if (value && typeof value === 'object') {
        for (const item of Object.values(value))
            findVikingUris(item, out);
    }
    return out;
}
/**
 * Search common argument keys for viking targets. Model-facing tool calls carry
 * their arguments object; built-in tools use keys such as `uris`, `uri`,
 * `path`, `glob`, `pattern`. We only need to detect *presence* of a viking
 * target to decide whether the guard should act.
 */
export function hasVikingTarget(args) {
    return findVikingUris(args).length > 0;
}
//# sourceMappingURL=uri.js.map