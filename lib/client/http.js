/**
 * HTTP envelope handling for the OpenViking REST API.
 *
 * Every `/api/v1/*` response is a uniform envelope:
 *   success: { "status": "ok",     "result": ... }
 *   failure: { "status": "error",  "error":  { "code": "NOT_FOUND", "message": "..." } }
 * This module turns that into typed results or an {@link OpenVikingApiError}.
 */
export class OpenVikingApiError extends Error {
    code;
    httpStatus;
    /** Network-level failure (fetch threw), not an HTTP/envelope error. */
    isTransport;
    constructor(fields) {
        super(fields.message);
        this.name = 'OpenVikingApiError';
        this.code = fields.code ?? 'UNKNOWN';
        this.httpStatus = fields.httpStatus ?? null;
        this.isTransport = fields.isTransport ?? false;
        if (fields.cause !== undefined)
            this.cause = fields.cause;
    }
}
function buildUrl(base, path, query) {
    const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
    for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined)
            url.searchParams.set(key, String(value));
    }
    return url.toString();
}
export async function requestJson(options) {
    const fetchImpl = options.fetchImpl ?? fetch;
    const url = buildUrl(options.baseUrl, options.path, options.query);
    const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': options.userAgent ?? 'dsh-ov-memory/0.1.0',
    };
    if (options.auth?.bearerToken)
        headers.Authorization = `Bearer ${options.auth.bearerToken}`;
    else if (options.auth?.apiKey)
        headers['X-API-Key'] = options.auth.apiKey;
    if (options.identity?.account)
        headers['X-OpenViking-Account'] = options.identity.account;
    if (options.identity?.user)
        headers['X-OpenViking-User'] = options.identity.user;
    if (options.identity?.actorPeerId)
        headers['X-OpenViking-Actor-Peer'] = options.identity.actorPeerId;
    Object.assign(headers, options.headers);
    let response;
    try {
        response = await fetchImpl(url, {
            method: options.method ?? 'GET',
            headers,
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            signal: AbortSignal.timeout(options.timeoutMs),
        });
    }
    catch (cause) {
        throw new OpenVikingApiError({
            message: `OpenViking unreachable at ${options.baseUrl}: ${cause.message ?? cause}`,
            isTransport: true,
            cause,
        });
    }
    const text = await response.text().catch(() => '');
    // Envelope errors may ride on non-2xx HTTP statuses; prefer the envelope's
    // error code when present.
    if (text) {
        let envelope = null;
        try {
            envelope = JSON.parse(text);
        }
        catch {
            envelope = null;
        }
        if (envelope && envelope.status !== 'ok') {
            throw new OpenVikingApiError({
                message: envelope.error?.message ?? `OpenViking returned error status (HTTP ${response.status})`,
                code: envelope.error?.code,
                httpStatus: response.status,
            });
        }
        if (!response.ok) {
            throw new OpenVikingApiError({
                message: `OpenViking HTTP ${response.status}: ${text.slice(0, 300)}`,
                httpStatus: response.status,
            });
        }
        if (envelope)
            return envelope.result;
        throw new OpenVikingApiError({
            message: `OpenViking returned non-JSON (HTTP ${response.status})`,
            httpStatus: response.status,
        });
    }
    throw new OpenVikingApiError({
        message: `OpenViking HTTP ${response.status} (empty body)`,
        httpStatus: response.status,
    });
}
/** True when the failure is transient and worth retrying/queueing. */
export function isRetryableFailure(err) {
    if (err instanceof OpenVikingApiError) {
        if (err.isTransport)
            return true;
        const status = err.httpStatus;
        return status !== null && (status >= 500 || status === 408 || status === 429);
    }
    return true;
}
//# sourceMappingURL=http.js.map