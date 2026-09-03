/**
 * The five cache scopes the backend's offline module will grant a device.
 *
 * These are not ours to invent: they are the exact `SyncService::ALLOWED_SCOPES`
 * whitelist (apps/api-laravel/app/Modules/Offline/Services/SyncService.php).
 * Sending anything outside this list makes `createLocalCachePolicy()` throw
 * `OFFLINE_SCOPE_NOT_ALLOWED` and the endpoint answer 422.
 */
export const OFFLINE_SCOPES = [
  'demographics',
  'appointments',
  'medications',
  'allergies',
  'emergency_profile',
] as const;

export type OfflineScope = (typeof OFFLINE_SCOPES)[number];

/** Emergency-access policies are hard-limited to exactly this scope set by the
 * backend (`OFFLINE_EMERGENCY_SCOPE_LIMIT_REQUIRED`) and expire after 6 hours
 * instead of 24. */
export const EMERGENCY_SCOPES: OfflineScope[] = ['emergency_profile'];

export function isOfflineScope(value: unknown): value is OfflineScope {
  return typeof value === 'string' && (OFFLINE_SCOPES as readonly string[]).includes(value);
}

/**
 * Storage keys. `opescare_device_fingerprint` is deliberately NOT redefined
 * here — it is read from the shared constant in ./identity so this feature
 * reuses the device identity minted by app/(auth)/permissions.tsx and
 * app/settings.tsx rather than inventing a second one.
 */
export const OFFLINE_KEYS = {
  policy: 'opescare_offline_policy',
  patientId: 'opescare_offline_patient_id',
  outbox: 'opescare_offline_outbox',
  scopeEntry: (scope: OfflineScope) => `opescare_offline_cache_${scope}`,
} as const;
