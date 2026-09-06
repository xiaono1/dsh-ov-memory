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
  error?: { code?: string; message?: string };
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
  auth?: { bearerToken?: string; apiKey?: string };
  identity?: { account?: string; user?: string; actorPeerId?: string };
  userAgent?: string;
}

export class OpenVikingApiError extends Error {
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
  }) {
    super(fields.message);
    this.name = 'OpenVikingApiError';
    this.code = fields.code ?? 'UNKNOWN';
    this.httpStatus = fields.httpStatus ?? null;
    this.isTransport = fields.isTransport ?? false;
    if (fields.cause !== undefined) (this as Error & { cause?: unknown }).cause = fields.cause;
  }
}

function buildUrl(base: string, path: string, query?: RequestOptions['query']): string {
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export async function requestJson<T>(options: RequestOptions): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = buildUrl(options.baseUrl, options.path, options.query);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': options.userAgent ?? 'dsh-ov-memory/0.1.0',
  };
  if (options.auth?.bearerToken) headers.Authorization = `Bearer ${options.auth.bearerToken}`;
  else if (options.auth?.apiKey) headers['X-API-Key'] = options.auth.apiKey;
  if (options.identity?.account) headers['X-OpenViking-Account'] = options.identity.account;
  if (options.identity?.user) headers['X-OpenViking-User'] = options.identity.user;
  if (options.identity?.actorPeerId) headers['X-OpenViking-Actor-Peer'] = options.identity.actorPeerId;
  Object.assign(headers, options.headers);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (cause) {
    throw new OpenVikingApiError({
      message: `OpenViking unreachable at ${options.baseUrl}: ${(cause as Error).message ?? cause}`,
      isTransport: true,
      cause,
    });
  }

  const text = await response.text().catch(() => '');

  // Envelope errors may ride on non-2xx HTTP statuses; prefer the envelope's
  // error code when present.
  if (text) {
    let envelope: OpenVikingEnvelope | null = null;
    try {
      envelope = JSON.parse(text) as OpenVikingEnvelope;
    } catch {
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
    if (envelope) return envelope.result as T;
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
export function isRetryableFailure(err: unknown): boolean {
  if (err instanceof OpenVikingApiError) {
    if (err.isTransport) return true;
    const status = err.httpStatus;
    return status !== null && (status >= 500 || status === 408 || status === 429);
  }
  return true;
}
