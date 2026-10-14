import { API_BASE_URL } from '../config';

const TOKEN_KEY = 'token';
const REFRESH_KEY = 'refreshToken';

export const UNAUTHORIZED_EVENT = 'auth:unauthorized';

export const getToken = (): string | null => sessionStorage.getItem(TOKEN_KEY);
export const getRefreshToken = (): string | null => sessionStorage.getItem(REFRESH_KEY);
export const setToken = (token: string) => sessionStorage.setItem(TOKEN_KEY, token);
export const setSession = (token: string, refreshToken?: string | null) => {
  sessionStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) sessionStorage.setItem(REFRESH_KEY, refreshToken);
};
export const clearToken = () => {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
};

// One refresh at a time: concurrent 401s share the same request (the refresh token rotates, so a
// second parallel call would be rejected).
let refreshing: Promise<boolean> | null = null;

const refreshAccessToken = (): Promise<boolean> => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve(false);
  refreshing ??= fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  })
    .then(async (res) => {
      if (!res.ok) return false;
      const body = await res.json();
      setSession(body.token, body.refreshToken);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
};

/**
 * fetch wrapper for the API: prefixes the base URL, attaches the JWT, transparently renews an
 * expired access token with the refresh token, and signals the app to log out when that fails.
 * Public /auth/* calls are exempt so a wrong password or code doesn't end an existing session.
 */
export const apiFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const send = () => {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  };

  let res = await send();
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshAccessToken()) res = await send();
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  return res;
};

export const jsonBody = (data: unknown): RequestInit => ({
  method: 'POST',
  body: JSON.stringify(data)
});

/** Pulls a human-readable message out of an error response. */
export const readError = async (res: Response, fallback: string): Promise<string> => {
  const body = await res.json().catch(() => ({}));
  return body.message || body.error || fallback;
};

/** GET/POST/PUT/PATCH/DELETE returning parsed JSON; throws an Error carrying the server's message. */
export const apiJson = async <T = unknown>(path: string, init: RequestInit = {}): Promise<T> => {
  const res = await apiFetch(path, init);
  if (!res.ok) throw new Error(await readError(res, `Request failed (${res.status})`));
  return res.json() as Promise<T>;
};

type Method = 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export const apiSend = <T = unknown>(method: Method, path: string, data?: unknown) =>
  apiJson<T>(path, { method, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });

/** Downloads an authenticated file (PDF, CSV) by fetching it as a blob and clicking a temporary link. */
export const downloadFile = async (path: string, fallbackName: string): Promise<void> => {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(await readError(res, 'Download failed'));
  const disposition = res.headers.get('Content-Disposition') || '';
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const isAdminRole = (role?: string) => role === 'ADMIN' || role === 'SUPER_ADMIN';
/** The platform owner's Super Admin: manages companies from the platform console. */
export const isPlatformRole = (role?: string) => role === 'PLATFORM_ADMIN';

/**
 * Company admins cannot delete directly: a DELETE under /admin files a request that the platform's Super Admin
 * approves or rejects. Resolves to the message to show the admin.
 */
export const requestDelete = async (path: string, reason?: string): Promise<string> => {
  const body = await apiJson<{ message?: string }>(path, { method: 'DELETE', ...(reason ? { body: JSON.stringify({ reason }) } : {}) });
  return body.message || 'Deletion needs approval. A request has been sent.';
};
