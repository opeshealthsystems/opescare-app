import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EMERGENCY_PROFILE_QUERY_KEY,
  clearOfflineCache,
  flushOutbox,
  getLastCachedAt,
  getOfflineCacheSummary,
  getStoredPolicy,
  isPolicyUsable,
  purgeOfflineData,
  readOutbox,
  readScopeCache,
  refreshGrantedScopes,
  registerPolicy,
  serializeQueryKey,
  syncOfflineCache,
  type FlushResult,
  type OfflineEmergencyProfile,
  type OfflineScope,
  type OutboxItem,
  type ScopeCacheSummary,
  type StoredOfflinePolicy,
  type SyncSummary,
} from '../offline';
import { isEncryptedAtRest } from '../offline/storage';

/**
 * TanStack hooks for offline mode.
 *
 * Kept in this dedicated file (not lib/api/queries.ts) so the feature stays
 * self-contained. Every hook here is `networkMode: 'always'`: these read local
 * storage and must keep working precisely when the network does not — the
 * default 'online' mode would pause them exactly when they matter most.
 */

export const OFFLINE_STATUS_KEY = ['offline', 'status'] as const;

export interface OfflineStatus {
  /** A policy is registered on this device. */
  enabled: boolean;
  policy: StoredOfflinePolicy | null;
  /** The policy is registered *and* has not expired. */
  policyUsable: boolean;
  scopes: ScopeCacheSummary[];
  /** Newest write across all scopes — what the offline banner reports. */
  lastCachedAt: string | null;
  outbox: OutboxItem[];
  /** False on web, where localStorage gives no at-rest encryption. */
  encryptedAtRest: boolean;
}

async function readOfflineStatus(): Promise<OfflineStatus> {
  const [policy, scopes, lastCachedAt, outbox] = await Promise.all([
    getStoredPolicy(),
    getOfflineCacheSummary(),
    getLastCachedAt(),
    readOutbox(),
  ]);

  return {
    enabled: policy !== null,
    policy,
    policyUsable: isPolicyUsable(policy),
    scopes,
    lastCachedAt,
    outbox,
    encryptedAtRest: isEncryptedAtRest,
  };
}

/** Everything app/offline-access.tsx renders. Local reads only — no network. */
export function useOfflineStatus() {
  return useQuery({
    queryKey: OFFLINE_STATUS_KEY,
    queryFn: readOfflineStatus,
    networkMode: 'always',
    staleTime: 0,
  });
}

/**
 * Opt in: register the policy with the backend, then immediately fill the
 * cache so the device is genuinely usable offline the moment this resolves.
 */
export function useEnableOfflineAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: 'always',
    mutationFn: async (
      options: { scopes?: OfflineScope[]; emergencyAccess?: boolean } = {},
    ): Promise<{ policy: StoredOfflinePolicy; sync: SyncSummary }> => {
      const policy = await registerPolicy(options);
      await refreshGrantedScopes();
      // Wipe first, then refill: switching from the full record to
      // emergency-only must not leave the scopes the new policy no longer
      // grants sitting on the device. Only runs once the server has actually
      // issued the new policy, so a failed opt-in changes nothing.
      await clearOfflineCache();
      const sync = await syncOfflineCache(queryClient);
      return { policy, sync };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: OFFLINE_STATUS_KEY });
    },
  });
}

/** Refresh every granted scope, renewing the policy first if it has lapsed. */
export function useSyncOfflineCache() {
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: 'always',
    mutationFn: (): Promise<SyncSummary> => syncOfflineCache(queryClient),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: OFFLINE_STATUS_KEY });
    },
  });
}

/** Opt out: wipe the policy, every cached scope and any unsynced changes. */
export function useDisableOfflineAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: 'always',
    mutationFn: purgeOfflineData,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: OFFLINE_STATUS_KEY });
    },
  });
}

/**
 * Push changes made while offline to `POST /mobile/offline/policies/{id}/queue`
 * for server-side reconciliation.
 */
export function useFlushOfflineOutbox() {
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: 'always',
    mutationFn: (): Promise<FlushResult> => flushOutbox(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: OFFLINE_STATUS_KEY });
    },
  });
}

/**
 * The saved emergency profile — blood group, allergies and active conditions.
 * Reads the local cache only, so it works with the radio off.
 */
export function useCachedEmergencyProfile() {
  return useQuery({
    queryKey: EMERGENCY_PROFILE_QUERY_KEY,
    networkMode: 'always',
    queryFn: async (): Promise<OfflineEmergencyProfile | null> => {
      const cache = await readScopeCache('emergency_profile');
      const entry = cache?.entries[serializeQueryKey(EMERGENCY_PROFILE_QUERY_KEY)];
      return (entry?.data as OfflineEmergencyProfile | undefined) ?? null;
    },
  });
}
