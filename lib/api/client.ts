import axios, { AxiosError } from 'axios';
import { API_BASE_URL, endpoints } from './endpoints';
import { tokenStorage } from './tokenStorage';

/**
 * Fires when a request fails auth even after a refresh attempt. The auth
 * store subscribes to this to force a logout, without this module importing
 * the store directly (would create a circular dependency: store -> client -> store).
 */
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;
export const setSessionExpiredHandler = (handler: SessionExpiredHandler) => {
  onSessionExpired = handler;
};

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { Accept: 'application/json' },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await tokenStorage.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshInFlight: Promise<string | null> | null = null;

async function refreshToken(): Promise<string | null> {
  const current = await tokenStorage.get();
  if (!current) return null;
  try {
    const response = await axios.post(
      `${API_BASE_URL}${endpoints.refresh}`,
      {},
      { headers: { Authorization: `Bearer ${current}` } },
    );
    const nextToken: string | undefined = response.data?.token ?? response.data?.access_token;
    if (!nextToken) return null;
    await tokenStorage.set(nextToken);
    return nextToken;
  } catch {
    return null;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !(original as any)._retried) {
      (original as any)._retried = true;
      refreshInFlight ??= refreshToken().finally(() => {
        refreshInFlight = null;
      });
      const nextToken = await refreshInFlight;
      if (nextToken) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${nextToken}`;
        return apiClient.request(original);
      }
      await tokenStorage.clear();
      onSessionExpired?.();
    }
    return Promise.reject(error);
  },
);
