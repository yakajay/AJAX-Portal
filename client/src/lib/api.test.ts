import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, apiJson, getRefreshToken, getToken, setSession, UNAUTHORIZED_EVENT } from './api';

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('apiFetch token handling', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    setSession('old-access', 'old-refresh');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the bearer token', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await apiFetch('/user/profile');
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer old-access');
  });

  it('renews an expired access token with the refresh token and retries once', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401)) // original call
      .mockResolvedValueOnce(json(200, { token: 'new-access', refreshToken: 'new-refresh' })) // /auth/refresh
      .mockResolvedValueOnce(json(200, { hello: 'world' })); // retry
    const res = await apiFetch('/user/profile', { method: 'POST', body: '{"a":1}' });
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/refresh');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ refreshToken: 'old-refresh' });
    expect(new Headers(fetchMock.mock.calls[2][1].headers).get('Authorization')).toBe('Bearer new-access');
    expect(fetchMock.mock.calls[2][1].body).toBe('{"a":1}'); // body replayed
    expect(getToken()).toBe('new-access');
    expect(getRefreshToken()).toBe('new-refresh'); // rotated
  });

  it('shares one refresh between concurrent 401s', async () => {
    let refreshCalls = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls++;
        return json(200, { token: 'fresh', refreshToken: 'fresh-refresh' });
      }
      const auth = new Headers(init.headers).get('Authorization');
      return auth === 'Bearer fresh' ? json(200) : json(401);
    });
    const results = await Promise.all([apiFetch('/a'), apiFetch('/b'), apiFetch('/c')]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshCalls).toBe(1);
  });

  it('signals logout when the refresh token is rejected', async () => {
    const onUnauthorized = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    fetchMock.mockResolvedValueOnce(json(401)).mockResolvedValueOnce(json(401));
    const res = await apiFetch('/user/profile');
    window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    expect(res.status).toBe(401);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not try to refresh failed /auth calls (wrong password must not end a session)', async () => {
    const onUnauthorized = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    fetchMock.mockResolvedValueOnce(json(401, { message: 'Invalid email or password' }));
    const res = await apiFetch('/auth/login', { method: 'POST', body: '{}' });
    window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('gives up straight away when there is no refresh token', async () => {
    sessionStorage.clear();
    setSession('only-access');
    const onUnauthorized = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    fetchMock.mockResolvedValueOnce(json(401));
    await apiFetch('/user/profile');
    window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('apiJson throws the server message on errors', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { message: 'Nope, that is invalid.' }));
    await expect(apiJson('/user/leaves')).rejects.toThrow('Nope, that is invalid.');
  });
});
