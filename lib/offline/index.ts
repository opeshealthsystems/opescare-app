import type { QueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth';
import { clearOfflineCache, getCachedDemographics, writeScopeEntry } from './cache';
import { installConnectivityMonitor } from './connectivity';
import { rememberPatientId } from './identity';
import { clearOutbox, installOutboxCapture } from './outbox';
import { clearStoredPolicy } from './policy';
import {
  hydrateQueryCache,
  installQueryPersistence,
  refreshGrantedScopes,
} from './queryPersistence';

export * from './cache';
export * from './connectivity';
export * from './identity';
export * from './outbox';
export * from './policy';
export * from './queryPersistence';
export * from './relativeTime';
export * from './scopes';
export * from './sync';

/**
 * Single entry point, called once from app/_layout.tsx.
 *
 * Everything here is passive: with no policy registered, nothing is written to
 * disk and nothing is restored. Offline mode only starts doing work once the
 * patient opts in on app/offline-access.tsx.
 */
export function initOfflineMode(queryClient: QueryClient): () => void {
  const teardowns: Array<() => void> = [];

  // `patient_id` is only ever returned on an auth response, and the offline
  // policy endpoint requires it. Capture it as sessions are created so no
  // patient ever needs the token-rotating fallback in ./identity.
  const authInterceptor = apiClient.interceptors.response.use((response) => {
    const url = response.config?.url ?? '';
    if (url.startsWith('/mobile/auth')) {
      rememberPatientId((response.data as { patient_id?: unknown } | undefined)?.patient_id).catch(
        () => {},
      );
    }
    return response;
  });
  teardowns.push(() => apiClient.interceptors.response.eject(authInterceptor));

  teardowns.push(installConnectivityMonitor());
  teardowns.push(installOutboxCapture());
  teardowns.push(installQueryPersistence(queryClient));

  // Demographics live in the auth store rather than a query, so mirror them
  // into the cache whenever they change.
  const unsubscribeAuth = useAuthStore.subscribe((state, previous) => {
    const patient = state.patient;
    if (!patient || patient === previous.patient) return;

    refreshGrantedScopes()
      .then(async (scopes) => {
        if (!scopes.has('demographics')) return;
        // Skip an identical rewrite. An offline boot restores the patient
        // *from* this cache, and re-saving it would re-stamp `cachedAt` —
        // making the offline banner claim day-old data was "saved just now".
        // Only genuinely new server data may move the timestamp.
        const cached = await getCachedDemographics();
        if (cached && JSON.stringify(cached) === JSON.stringify(patient)) return;
        await writeScopeEntry('demographics', ['me'], patient);
      })
      .catch(() => {});
  });
  teardowns.push(unsubscribeAuth);

  refreshGrantedScopes()
    .then((scopes) => (scopes.size > 0 ? hydrateQueryCache(queryClient) : 0))
    .catch(() => {});

  return () => teardowns.forEach((teardown) => teardown());
}

/**
 * Turns offline access off and wipes every trace of it from the device: the
 * policy, all cached scopes and any unsynced changes.
 *
 * The stored `patient_id` is intentionally kept — it is an opaque identifier
 * the session already implies, and holding it means re-enabling later does not
 * have to rotate the patient's access token to rediscover it.
 *
 * Limitation, stated plainly: the server-side `LocalCachePolicy` row is not
 * revoked here, because the mobile API exposes no revoke endpoint — routes are
 * create-policy and queue only, and routes/api.php is sealed. The policy
 * therefore lapses on its own schedule (24h, or 6h in emergency mode) while
 * the device-side copy is gone immediately.
 */
export async function purgeOfflineData(): Promise<void> {
  await Promise.all([clearOfflineCache(), clearStoredPolicy(), clearOutbox()]);
  await refreshGrantedScopes();
}
