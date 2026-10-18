import { QueryClient } from '@tanstack/react-query';
import { clearExportedFiles } from '../fileDelivery';
import { clearOfflineCache } from '../offline/cache';
import { clearOutbox } from '../offline/outbox';
import { clearStoredPolicy, revokeStoredPolicy } from '../offline/policy';

/**
 * The app's one QueryClient. It lives here, not in app/_layout.tsx, so that
 * signing out can reach it: a cache that outlives the session hands the last
 * patient's records to whoever signs in next on a shared phone.
 */
export const queryClient = new QueryClient();

/**
 * Remove every trace of the departing session from this device: the
 * in-memory query cache, the offline record copy, its policy and the unsent
 * outbox, and exported PDFs. Called on logout and on session expiry. Best effort per store — a
 * storage error in one must never leave the others behind.
 */
export async function wipeSessionData(): Promise<void> {
  queryClient.clear();
  // Revoke server-side before the stored policy id is cleared. Best effort:
  // revokeStoredPolicy never throws, so a network failure cannot block the wipe.
  await revokeStoredPolicy();
  await Promise.all([
    clearOfflineCache().catch(() => undefined),
    clearStoredPolicy().catch(() => undefined),
    clearOutbox().catch(() => undefined),
    clearExportedFiles().catch(() => undefined),
  ]);
}
