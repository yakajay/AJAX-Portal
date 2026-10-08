import { API_BASE_URL } from '../config';

const TOKEN_KEY = 'token';

export const UNAUTHORIZED_EVENT = 'auth:unauthorized';

export const getToken = (): string | null => sessionStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => sessionStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => sessionStorage.removeItem(TOKEN_KEY);

/**
 * fetch wrapper for the API: prefixes the base URL, attaches the JWT, and signals the app to
 * log out when a protected endpoint rejects the token (401). Public /auth/* calls are exempt so
 * a wrong password or code doesn't end an existing session.
 */
export const apiFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (res.status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
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

export const isAdminRole = (role?: string) => role === 'ADMIN' || role === 'SUPER_ADMIN';
