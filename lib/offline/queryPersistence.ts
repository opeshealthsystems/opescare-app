import type { QueryClient } from '@tanstack/react-query';
import { readAllScopeCaches, writeScopeEntry } from './cache';
import { getStoredPolicy } from './policy';
import type { OfflineScope } from './scopes';

/**
 * Bridges the offline cache to TanStack Query in both directions, without a
 * single edit to lib/api/queries.ts or any screen.
 *
 *  - **Capture:** subscribe to the query cache and persist successful results
 *    whose key belongs to a granted scope. Ordinary browsing keeps the offline
 *    copy warm between explicit syncs.
 *  - **Hydrate:** on start, replay saved results back in with `setQueryData`,
 *    so a cold launch with no network still paints real data. The subsequent
 *    refetch failing is fine — TanStack keeps the seeded data and the screens
 *    show it under the offline banner.
 */

const STATUS_FILTERS = new Set([
  'all',
  'active',
  'dispensed',
  'partially_dispensed',
  'expired',
  'cancelled',
]);

/** Maps a queryKey to the cache scope that owns it, or null to ignore it. */
export function scopeForQueryKey(key: readonly unknown[]): OfflineScope | null {
  const [head, second] = key;

  if (head === 'me' || head === 'health-id-card') return 'demographics';
  if (head === 'allergies') return 'allergies';
  if (head === 'clinical') return 'emergency_profile';
  if (head === 'offline' && second === 'emergency-profile') return 'emergency_profile';

  if (head === 'appointments') {
    // 'detail' holds one appointment; lists and the home preview are the
    // useful offline surface.
    return second === 'upcoming' || second === 'list' ? 'appointments' : null;
  }

  if (head === 'prescriptions') {
    // ['prescriptions', <status|'all'>] is a list; ['prescriptions', <uuid>]
    // is a detail view and shares the shape, so match the known filters only.
    return typeof second === 'string' && STATUS_FILTERS.has(second) ? 'medications' : null;
  }

  return null;
}

/** Scopes the device is currently authorized to cache. Empty until opt-in. */
let grantedScopes = new Set<OfflineScope>();

/** Re-reads the stored policy. Call after enabling or disabling offline mode. */
export async function refreshGrantedScopes(): Promise<Set<OfflineScope>> {
  const policy = await getStoredPolicy();
  grantedScopes = new Set(policy?.allowed_scopes ?? []);
  return grantedScopes;
}

const DEBOUNCE_MS = 1000;

/**
 * Set while the saved cache is being replayed into the query client.
 *
 * `setQueryData` fires the very cache event the capture subscriber listens to,
 * so without this a cold offline start would immediately write every restored
 * result straight back to disk with a fresh timestamp — and the offline banner
 * would report day-old data as "saved just now". The subscriber runs
 * synchronously inside `setQueryData`, so a plain flag is sufficient.
 */
let hydrating = false;

let installed = false;

/**
 * Starts passive capture. Nothing is written to disk until the patient has
 * opted in and the backend has granted the scope — an un-opted-in device must
 * never accumulate PHI just because it was used online.
 */
export function installQueryPersistence(queryClient: QueryClient): () => void {
  if (installed) return () => {};
  installed = true;

  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (hydrating) return;
    if (event.type !== 'updated') return;

    // Only a genuinely successful fetch may (re)write the cache. A query that
    // already holds data keeps `status: 'success'` when a refetch fails, so
    // matching on status alone would let every failed offline refetch stamp
    // stale data as freshly saved — the exact lie the banner must not tell.
    if (event.action.type !== 'success') return;

    const query = event.query;
    if (query.state.data === undefined) return;

    const scope = scopeForQueryKey(query.queryKey);
    if (!scope || !grantedScopes.has(scope)) return;

    const debounceKey = JSON.stringify(query.queryKey);
    const existing = pending.get(debounceKey);
    if (existing) clearTimeout(existing);

    pending.set(
      debounceKey,
      setTimeout(() => {
        pending.delete(debounceKey);
        // Re-read the live state: the query may have moved on while debounced.
        const state = queryClient.getQueryState(query.queryKey);
        if (state?.data === undefined) return;
        writeScopeEntry(scope, query.queryKey, state.data).catch(() => {});
      }, DEBOUNCE_MS),
    );
  });

  return () => {
    installed = false;
    pending.forEach((timer) => clearTimeout(timer));
    pending.clear();
    unsubscribe();
  };
}

/**
 * Replays the saved cache into the query client. Returns how many results were
 * restored. Never overwrites data the client already fetched more recently.
 */
export async function hydrateQueryCache(queryClient: QueryClient): Promise<number> {
  const caches = await readAllScopeCaches();
  let restored = 0;

  hydrating = true;
  try {
    for (const cache of caches) {
      for (const entry of Object.values(cache.entries)) {
        if (!Array.isArray(entry.key) || entry.data === undefined) continue;

        const state = queryClient.getQueryState(entry.key);
        const cachedAt = Date.parse(entry.cachedAt);
        if (state?.data !== undefined && state.dataUpdatedAt >= (cachedAt || 0)) continue;

        // `updatedAt` carries the original fetch time, so TanStack treats the
        // restored result as exactly as stale as it really is.
        queryClient.setQueryData(entry.key, entry.data, {
          updatedAt: Number.isFinite(cachedAt) ? cachedAt : undefined,
        });
        restored += 1;
      }
    }
  } finally {
    hydrating = false;
  }

  return restored;
}
