import type { Patient } from '../api/types';
import { offlineStorage } from './storage';
import { OFFLINE_KEYS, OFFLINE_SCOPES, type OfflineScope } from './scopes';

/**
 * The on-device cache itself: one encrypted record per granted scope.
 *
 * Each record holds a handful of TanStack Query results keyed by their exact
 * serialized queryKey, so the cache can be replayed straight back into the
 * query client on a cold offline start and the existing screens render real
 * saved data without any of them knowing this module exists.
 */

/** Wire format of one cached query result. `key` is the original queryKey. */
export interface CachedEntry {
  key: unknown[];
  data: unknown;
  cachedAt: string;
}

export interface ScopeCache {
  scope: OfflineScope;
  cachedAt: string;
  entries: Record<string, CachedEntry>;
}

export interface ScopeCacheSummary {
  scope: OfflineScope;
  cachedAt: string | null;
  itemCount: number | null;
  entryCount: number;
}

/** Keeps a single scope from growing without bound — the newest results win. */
const MAX_ENTRIES_PER_SCOPE = 8;
/** ~100 KB serialized per scope. Beyond this the oldest entries are dropped. */
const MAX_SERIALIZED_CHARS = 100_000;

export const serializeQueryKey = (key: readonly unknown[]): string => JSON.stringify(key);

/** Best-effort "how many things are in here" for the offline-access screen. */
export function countItems(data: unknown): number | null {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    for (const field of ['data', 'allergies', 'conditions', 'timeline', 'immunizations']) {
      if (Array.isArray(record[field])) return (record[field] as unknown[]).length;
    }
    return 1;
  }
  return data === undefined || data === null ? null : 1;
}

export async function readScopeCache(scope: OfflineScope): Promise<ScopeCache | null> {
  const cache = await offlineStorage.getJson<ScopeCache>(OFFLINE_KEYS.scopeEntry(scope));
  if (!cache || typeof cache !== 'object' || !cache.entries) return null;
  return cache;
}

export async function readAllScopeCaches(): Promise<ScopeCache[]> {
  const caches = await Promise.all(OFFLINE_SCOPES.map((scope) => readScopeCache(scope)));
  return caches.filter((cache): cache is ScopeCache => cache !== null);
}

/** Writes (or replaces) one query result inside a scope's record. */
export async function writeScopeEntry(
  scope: OfflineScope,
  key: readonly unknown[],
  data: unknown,
): Promise<void> {
  if (data === undefined) return;

  const now = new Date().toISOString();
  const existing = (await readScopeCache(scope)) ?? { scope, cachedAt: now, entries: {} };
  const entries: Record<string, CachedEntry> = {
    ...existing.entries,
    [serializeQueryKey(key)]: { key: [...key], data, cachedAt: now },
  };

  let ordered = Object.entries(entries).sort(
    (a, b) => Date.parse(b[1].cachedAt) - Date.parse(a[1].cachedAt),
  );
  ordered = ordered.slice(0, MAX_ENTRIES_PER_SCOPE);

  let next: ScopeCache = { scope, cachedAt: now, entries: Object.fromEntries(ordered) };
  // Trim oldest-first until the record fits comfortably in secure storage.
  while (ordered.length > 1 && JSON.stringify(next).length > MAX_SERIALIZED_CHARS) {
    ordered = ordered.slice(0, ordered.length - 1);
    next = { scope, cachedAt: now, entries: Object.fromEntries(ordered) };
  }

  await offlineStorage.setJson(OFFLINE_KEYS.scopeEntry(scope), next);
}

export async function clearOfflineCache(): Promise<void> {
  await Promise.all(
    OFFLINE_SCOPES.map((scope) => offlineStorage.remove(OFFLINE_KEYS.scopeEntry(scope))),
  );
}

export async function getOfflineCacheSummary(): Promise<ScopeCacheSummary[]> {
  const caches = await readAllScopeCaches();
  const byScope = new Map(caches.map((cache) => [cache.scope, cache]));

  return OFFLINE_SCOPES.map((scope) => {
    const cache = byScope.get(scope);
    const entries = cache ? Object.values(cache.entries) : [];
    // The scope's headline count comes from its largest entry — for
    // appointments that is the full list rather than the 3-item home preview.
    const counts = entries.map((entry) => countItems(entry.data) ?? 0);
    return {
      scope,
      cachedAt: cache?.cachedAt ?? null,
      itemCount: counts.length ? Math.max(...counts) : null,
      entryCount: entries.length,
    };
  });
}

/** Newest `cachedAt` across every scope — what the offline banner reports. */
export async function getLastCachedAt(): Promise<string | null> {
  const caches = await readAllScopeCaches();
  const stamps = caches
    .map((cache) => Date.parse(cache.cachedAt))
    .filter((value) => Number.isFinite(value));
  return stamps.length ? new Date(Math.max(...stamps)).toISOString() : null;
}

/**
 * The saved `GET /mobile/me` payload, if this device has one.
 *
 * Used by lib/store/auth.ts to boot an already-signed-in patient straight into
 * the app when the network is unreachable, instead of treating a dropped
 * connection as an expired session and wiping their token.
 */
export async function getCachedDemographics(): Promise<Patient | null> {
  const cache = await readScopeCache('demographics');
  if (!cache) return null;
  const entry = cache.entries[serializeQueryKey(['me'])] ?? Object.values(cache.entries)[0];
  const data = entry?.data as Patient | undefined;
  return data && typeof data === 'object' && 'health_id' in data ? data : null;
}

/**
 * True when a request failed because nothing could be reached — no HTTP
 * response at all. Distinct from a 401/500, which mean the server answered.
 */
export function isNetworkError(error: unknown): boolean {
  const candidate = error as { response?: unknown; code?: string; message?: string } | null;
  if (!candidate || typeof candidate !== 'object') return false;
  if (candidate.response) return false;
  return (
    candidate.code === 'ERR_NETWORK' ||
    candidate.code === 'ECONNABORTED' ||
    candidate.code === 'ETIMEDOUT' ||
    typeof candidate.message === 'string'
  );
}
