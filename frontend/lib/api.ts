/**
 * Small fetch wrapper for the backend (proxied at /api).
 *
 * The access token lives only in memory. When a request gets a 401 we try one
 * silent refresh (the refresh token is an httpOnly cookie the JS can't read)
 * and replay the request. Concurrent 401s share the same refresh.
 */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;
const listeners = new Set<(token: string | null) => void>();

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  listeners.forEach((l) => l(token));
}

export function onTokenChange(listener: (token: string | null) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function detailOf(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === 'string') return d;
    // FastAPI validation errors: [{ msg: "..." }]
    if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg).replace(/^Value error, /, '');
  }
  return fallback;
}

/** Exchange the refresh cookie for a new access token. Returns null if signed out. */
export function refreshSession(): Promise<string | null> {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'fetch' },
    })
      .then(async (res) => {
        if (!res.ok) {
          setAccessToken(null);
          return null;
        }
        const data = await res.json();
        setAccessToken(data.access_token);
        return data.access_token as string;
      })
      .catch(() => null)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown; retry?: boolean };

export async function api<T = unknown>(path: string, { body, retry = true, headers, ...init }: Options = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'X-Requested-With': 'fetch',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const token = await refreshSession();
    if (token) return api<T>(path, { body, retry: false, headers, ...init });
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const fallback = res.status >= 500 ? 'Something went wrong on our side. Try again.' : 'Request failed';
    throw new ApiError(res.status, detailOf(data, fallback));
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Network error. Check your connection.';
}
