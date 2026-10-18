import type { InternalAxiosRequestConfig } from 'axios';

let mockStored: string | null = 'old-token';
jest.mock('@/lib/api/tokenStorage', () => ({
  tokenStorage: {
    get: jest.fn(async () => mockStored),
    set: jest.fn(async (t: string) => {
      mockStored = t;
    }),
    clear: jest.fn(async () => {
      mockStored = null;
    }),
  },
}));

import axios from 'axios';
import { apiClient, setSessionExpiredHandler } from '@/lib/api/client';
import { tokenStorage } from '@/lib/api/tokenStorage';

type Handler = (config: InternalAxiosRequestConfig) => { status: number; data?: unknown };

function useAdapter(handler: Handler) {
  const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
    const { status, data } = handler(config);
    const response = { status, data, headers: {}, config, statusText: String(status) };
    if (status >= 400) {
      throw Object.assign(new Error(`HTTP ${status}`), {
        isAxiosError: true,
        config,
        response,
      });
    }
    return response;
  });
  apiClient.defaults.adapter = adapter as never;
  return adapter;
}

const authOf = (c: InternalAxiosRequestConfig) => String(c.headers?.Authorization ?? '');

describe('apiClient 401 interceptor', () => {
  let expired: jest.Mock;
  let post: jest.SpyInstance;

  beforeEach(() => {
    mockStored = 'old-token';
    jest.clearAllMocks();
    expired = jest.fn();
    setSessionExpiredHandler(expired);
    post = jest.spyOn(axios, 'post');
  });
  afterEach(() => post.mockRestore());

  it('attaches the mockStored bearer token', async () => {
    const adapter = useAdapter(() => ({ status: 200, data: { ok: true } }));
    await apiClient.get('/mobile/me');
    expect(authOf(adapter.mock.calls[0][0])).toBe('Bearer old-token');
  });

  it('refreshes on 401 and retries the request once with the new token', async () => {
    post.mockResolvedValue({ data: { token: 'new-token' } });
    const adapter = useAdapter((c) =>
      authOf(c) === 'Bearer new-token' ? { status: 200, data: { ok: true } } : { status: 401 },
    );
    const res = await apiClient.get('/mobile/me');
    expect(res.data).toEqual({ ok: true });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toMatch(/\/mobile\/auth\/refresh$/);
    expect(post.mock.calls[0][2]).toEqual({ headers: { Authorization: 'Bearer old-token' } });
    expect(tokenStorage.set).toHaveBeenCalledWith('new-token');
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(expired).not.toHaveBeenCalled();
  });

  it('accepts access_token as the refreshed token field', async () => {
    post.mockResolvedValue({ data: { access_token: 'alt-token' } });
    useAdapter((c) => (authOf(c) === 'Bearer alt-token' ? { status: 200 } : { status: 401 }));
    await expect(apiClient.get('/x')).resolves.toBeDefined();
  });

  it('single-flights concurrent refreshes', async () => {
    let resolveRefresh!: (v: unknown) => void;
    post.mockReturnValue(new Promise((r) => (resolveRefresh = r)));
    useAdapter((c) => (authOf(c) === 'Bearer new-token' ? { status: 200 } : { status: 401 }));
    const all = Promise.all([apiClient.get('/a'), apiClient.get('/b'), apiClient.get('/c')]);
    await new Promise((r) => setTimeout(r, 10));
    resolveRefresh({ data: { token: 'new-token' } });
    await all;
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('clears the token and calls the session-expired handler when refresh fails', async () => {
    post.mockRejectedValue(new Error('refresh rejected'));
    useAdapter(() => ({ status: 401 }));
    await expect(apiClient.get('/mobile/me')).rejects.toMatchObject({ response: { status: 401 } });
    expect(tokenStorage.clear).toHaveBeenCalled();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('treats a refresh response without a token as failure', async () => {
    post.mockResolvedValue({ data: {} });
    useAdapter(() => ({ status: 401 }));
    await expect(apiClient.get('/x')).rejects.toBeDefined();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('does not attempt a refresh when there is no mockStored token', async () => {
    mockStored = null;
    useAdapter(() => ({ status: 401 }));
    await expect(apiClient.get('/x')).rejects.toBeDefined();
    expect(post).not.toHaveBeenCalled();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('does not loop when the retried request is also 401', async () => {
    post.mockResolvedValue({ data: { token: 'new-token' } });
    const adapter = useAdapter(() => ({ status: 401 }));
    await expect(apiClient.get('/x')).rejects.toMatchObject({ response: { status: 401 } });
    expect(post).toHaveBeenCalledTimes(1);
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  it('does not refresh a request already marked _retried', async () => {
    const adapter = useAdapter(() => ({ status: 401 }));
    await expect(apiClient.get('/x', { _retried: true } as never)).rejects.toBeDefined();
    expect(post).not.toHaveBeenCalled();
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(expired).not.toHaveBeenCalled();
  });

  it('passes non-401 errors straight through', async () => {
    useAdapter(() => ({ status: 500 }));
    await expect(apiClient.get('/x')).rejects.toMatchObject({ response: { status: 500 } });
    expect(post).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
  });
});
