/**
 * HTTP envelope handling for the OpenViking REST API.
 *
 * Every `/api/v1/*` response is a uniform envelope:
 *   success: { "status": "ok",     "result": ... }
 *   failure: { "status": "error",  "error":  { "code": "NOT_FOUND", "message": "..." } }
 * This module turns that into typed results or an {@link OpenVikingApiError}.
 */
export interface OpenVikingEnvelope {
    status: 'ok' | 'error';
    result?: unknown;
    error?: {
        code?: string;
        message?: string;
    };
}
export interface RequestOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    headers?: Record<string, string>;
    timeoutMs: number;
    fetchImpl?: typeof fetch;
    baseUrl: string;
    auth?: {
        bearerToken?: string;
        apiKey?: string;
    };
    identity?: {
        account?: string;
        user?: string;
        actorPeerId?: string;
    };
    userAgent?: string;
}
export declare class OpenVikingApiError extends Error {
    readonly code: string;
    readonly httpStatus: number | null;
    /** Network-level failure (fetch threw), not an HTTP/envelope error. */
    readonly isTransport: boolean;
    constructor(fields: {
        message: string;
        code?: string;
        httpStatus?: number | null;
        isTransport?: boolean;
        cause?: unknown;
    });
}
export declare function requestJson<T>(options: RequestOptions): Promise<T>;
/** True when the failure is transient and worth retrying/queueing. */
export declare function isRetryableFailure(err: unknown): boolean;
//# sourceMappingURL=http.d.ts.map