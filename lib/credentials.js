/**
 * OpenViking credential resolution.
 *
 * The canonical precedence (shared by every OpenViking client integration) is
 *
 *   1. `OPENVIKING_*` environment variables
 *   2. `~/.openviking/ovcli.conf`
 *   3. `~/.openviking/ov.conf`
 *
 * The parser below is intentionally tolerant: it accepts the small YAML/INI
 * subset the config files actually use (`key: value`, `key = value`, JSON,
 * `[section]` groups and dotted keys) so a missing or renamed field degrades
 * instead of failing the whole chain. Only field *names* come from the OpenViking
 * docs; this implementation is original.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
function layerLabel(layer) {
    switch (layer) {
        case 'env':
            return 'env';
        case 'cli':
            return 'ovcli.conf';
        case 'ov':
            return 'ov.conf';
        default:
            return 'none';
    }
}
/** Tolerant key/value parser for the OpenViking config files. */
export function parseConfigText(text) {
    const out = {};
    const trimmed = text.trim();
    if (!trimmed)
        return out;
    if (trimmed.startsWith('{')) {
        try {
            const obj = JSON.parse(trimmed);
            applyFlat(obj, out);
            const server = asRecord(obj.server);
            if (server)
                applyServer(server, out);
            return out;
        }
        catch {
            // fall through to the line parser
        }
    }
    let section = '';
    for (const rawLine of trimmed.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || line.startsWith('//'))
            continue;
        const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
        if (sectionMatch) {
            section = sectionMatch[1].trim().toLowerCase();
            continue;
        }
        const kv = /^([^=:]+)[=:]\s*(.*)$/.exec(line) ?? /^([^\s]+)\s+(.+)$/.exec(line);
        if (!kv)
            continue;
        const key = kv[1].trim().toLowerCase();
        let value = kv[2].trim();
        // strip surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        applyKey(section, key, value, out);
    }
    return out;
}
function applyFlat(obj, out) {
    for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string' || typeof v === 'number') {
            applyKey('', k.toLowerCase(), String(v), out);
        }
    }
}
function asRecord(v) {
    return v && typeof v === 'object' && !Array.isArray(v)
        ? v
        : null;
}
function applyServer(server, out) {
    for (const [k, v] of Object.entries(server)) {
        const key = k.toLowerCase();
        const value = typeof v === 'string' || typeof v === 'number' ? String(v) : undefined;
        if (value === undefined)
            continue;
        if (key === 'host' && !out.url) {
            const port = server.port !== undefined ? `:${server.port}` : '';
            out.url = `http://${value}${port}`;
        }
        else if (key === 'url' && !out.url) {
            out.url = value;
        }
        else if ((key === 'root_api_key' || key === 'api_key') && !out.apiKey) {
            out.apiKey = value;
        }
    }
}
function applyKey(section, key, value, out) {
    if (value === '' || value === 'null' || value === '~')
        return;
    if (section === 'server' || section === 'ov') {
        if (key === 'host') {
            if (!out.url)
                out.url = `http://${value}`;
            return;
        }
        if (key === 'port' && out.url && /^https?:\/\/[^/:]+$/i.test(out.url)) {
            out.url = `${out.url}:${value}`;
            return;
        }
        if (key === 'url' && !out.url) {
            out.url = value;
            return;
        }
        if (key === 'root_api_key' && !out.apiKey) {
            out.apiKey = value;
            return;
        }
    }
    switch (key) {
        case 'url':
        case 'endpoint':
        case 'base_url':
            if (!out.url)
                out.url = value;
            break;
        case 'api_key':
        case 'apikey':
        case 'root_api_key':
            if (!out.apiKey)
                out.apiKey = value;
            break;
        case 'bearer_token':
        case 'bearer':
            if (!out.bearerToken)
                out.bearerToken = value;
            break;
        case 'account':
        case 'account_id':
            if (!out.account)
                out.account = value;
            break;
        case 'user':
        case 'user_id':
            if (!out.user)
                out.user = value;
            break;
        case 'actor_peer_id':
        case 'peer_id':
            if (!out.peerId)
                out.peerId = value;
            break;
        default:
            break;
    }
}
/** Read a config file, tolerating absence. */
export function readConfigFile(path) {
    try {
        if (!existsSync(path))
            return null;
        return parseConfigText(readFileSync(path, 'utf8'));
    }
    catch {
        return null;
    }
}
/** Resolve `~` in a config path and expand env vars. */
export function expandHome(value, cwd) {
    if (!value)
        return undefined;
    let out = value;
    if (out.startsWith('~/') || out === '~')
        out = join(homedir(), out.slice(1));
    else if (out.startsWith('./'))
        out = join(cwd, out.slice(2));
    return out;
}
/**
 * Resolve credentials following the documented chain.
 *
 * @returns the merged fields plus the ordered list of layers that contributed
 *   something, and the MCP endpoint derived from the winning URL.
 */
export function resolveCredentials(opts = {}) {
    const env = opts.env ?? process.env;
    const cwd = opts.cwd ?? process.cwd();
    const configDir = opts.configDir ?? join(homedir(), '.openviking');
    // Precedence: ov.conf (lowest) < ovcli.conf < extra files < env (highest).
    // Later merges may overwrite earlier values.
    const layers = [];
    const fields = {};
    let mcpUrlOverride = null;
    const merge = (layer, next) => {
        if (!next)
            return;
        let any = false;
        for (const key of Object.keys(next)) {
            const value = next[key];
            if (value) {
                fields[key] = value;
                any = true;
            }
        }
        if (any)
            layers.push(layer);
    };
    const cliFile = expandHome(env.OPENVIKING_CLI_CONFIG_FILE ?? join(configDir, 'ovcli.conf'), cwd);
    const ovFile = expandHome(env.OPENVIKING_CONFIG_FILE ?? join(configDir, 'ov.conf'), cwd);
    merge('ov', readConfigFile(ovFile));
    merge('cli', readConfigFile(cliFile));
    for (const extra of opts.extraFiles ?? []) {
        const p = expandHome(extra, cwd);
        if (p)
            merge('cli', readConfigFile(p));
    }
    merge('env', {
        url: env.OPENVIKING_URL || env.OPENVIKING_BASE_URL,
        apiKey: env.OPENVIKING_API_KEY,
        bearerToken: env.OPENVIKING_BEARER_TOKEN,
        account: env.OPENVIKING_ACCOUNT,
        user: env.OPENVIKING_USER,
        peerId: env.OPENVIKING_PEER_ID,
    });
    if (env.OPENVIKING_MCP_URL)
        mcpUrlOverride = env.OPENVIKING_MCP_URL;
    if (layers.length === 0)
        layers.push('none');
    return {
        layers,
        fields,
        mcpUrl: mcpUrlOverride ?? (fields.url ? `${fields.url.replace(/\/+$/, '')}/mcp` : null),
    };
}
/** Human-readable summary of the winning layer chain (no secrets). */
export function describeLayers(resolution) {
    return resolution.layers.map(layerLabel).join(' → ');
}
//# sourceMappingURL=credentials.js.map