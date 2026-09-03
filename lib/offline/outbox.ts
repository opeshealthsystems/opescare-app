import type { AxiosError } from 'axios';
import { apiClient } from '../api/client';
import { endpoints } from '../api/endpoints';
import { isNetworkError } from './cache';
import { ensureActivePolicy } from './policy';
import { offlineStorage } from './storage';
import { OFFLINE_KEYS } from './scopes';

/**
 * The write-side of offline mode: changes the patient made while unreachable.
 *
 * `SyncService::queueEncryptedPayload()` exists precisely for "locally-made
 * changes for later reconciliation" — it encrypts the payload at rest
 * (`Crypt::encryptString`), dedupes on a SHA-256 of policy id + payload, and
 * opens a `SyncJob` for the reconciliation pipeline. This module feeds it.
 *
 * Capture is passive: any mutating `/mobile/*` request that dies with no HTTP
 * response is recorded here by an axios interceptor, so no other screen needs
 * to know offline mode exists. Auth requests are never captured — they carry
 * credentials and must not be written to disk.
 */

export interface OutboxItem {
  id: string;
  method: string;
  /** Path relative to the API base, e.g. `/mobile/appointments/{id}/cancel`. */
  path: string;
  body: unknown;
  capturedAt: string;
  lastError: string | null;
}

const MAX_ITEMS = 50;

/** Endpoints whose bodies must never be persisted to the device. */
const NEVER_CAPTURE = ['/mobile/auth', '/mobile/offline'];

const MUTATING = new Set(['post', 'put', 'patch', 'delete']);

export async function readOutbox(): Promise<OutboxItem[]> {
  const items = await offlineStorage.getJson<OutboxItem[]>(OFFLINE_KEYS.outbox);
  return Array.isArray(items) ? items : [];
}

async function writeOutbox(items: OutboxItem[]): Promise<void> {
  await offlineStorage.setJson(OFFLINE_KEYS.outbox, items.slice(-MAX_ITEMS));
}

export async function clearOutbox(): Promise<void> {
  await offlineStorage.remove(OFFLINE_KEYS.outbox);
}

export async function addOutboxItem(
  item: Omit<OutboxItem, 'id' | 'capturedAt' | 'lastError'>,
): Promise<void> {
  const items = await readOutbox();
  items.push({
    ...item,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    capturedAt: new Date().toISOString(),
    lastError: null,
  });
  await writeOutbox(items);
}

function shouldCapture(error: AxiosError): boolean {
  const config = error.config;
  if (!config?.url || !config.method) return false;
  if (!MUTATING.has(config.method.toLowerCase())) return false;
  if (NEVER_CAPTURE.some((prefix) => config.url!.startsWith(prefix))) return false;
  return isNetworkError(error);
}

function parseBody(data: unknown): unknown {
  if (typeof data !== 'string') return data ?? null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

let installed = false;

/** Wires passive capture of failed offline writes. Idempotent. */
export function installOutboxCapture(): () => void {
  if (installed) return () => {};
  installed = true;

  const id = apiClient.interceptors.response.use(undefined, async (error: AxiosError) => {
    if (shouldCapture(error)) {
      await addOutboxItem({
        method: error.config!.method!.toUpperCase(),
        path: error.config!.url!,
        body: parseBody(error.config!.data),
      }).catch(() => {});
    }
    return Promise.reject(error);
  });

  return () => {
    installed = false;
    apiClient.interceptors.response.eject(id);
  };
}

export interface FlushResult {
  queued: number;
  failed: number;
}

/**
 * Pushes every pending change to the backend's offline queue.
 *
 * Items that the server accepts are dropped locally — from here the
 * reconciliation pipeline (`OfflineQueue` → `SyncJob` → `ConflictResolution`)
 * owns them. Items that fail stay put with their error recorded.
 */
export async function flushOutbox(): Promise<FlushResult> {
  const items = await readOutbox();
  if (items.length === 0) return { queued: 0, failed: 0 };

  const policy = await ensureActivePolicy();
  const remaining: OutboxItem[] = [];
  let queued = 0;

  for (const item of items) {
    try {
      await apiClient.post(endpoints.offlinePolicyQueue(policy.id), {
        payload: {
          kind: 'mobile_offline_mutation',
          method: item.method,
          path: item.path,
          body: item.body,
          captured_at: item.capturedAt,
        },
      });
      queued += 1;
    } catch (error) {
      const message =
        (error as AxiosError<{ message?: string }>)?.response?.data?.message ??
        (error as Error)?.message ??
        'unknown';
      remaining.push({ ...item, lastError: message });
    }
  }

  if (remaining.length > 0) await writeOutbox(remaining);
  else await clearOutbox();

  return { queued, failed: remaining.length };
}
