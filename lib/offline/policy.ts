import { apiClient } from '../api/client';
import { endpoints } from '../api/endpoints';
import { getOfflineDeviceId, resolvePatientId } from './identity';
import { offlineStorage } from './storage';
import {
  EMERGENCY_SCOPES,
  OFFLINE_KEYS,
  OFFLINE_SCOPES,
  isOfflineScope,
  type OfflineScope,
} from './scopes';

/**
 * The device's registered local-cache policy — the server's record that this
 * device is allowed to hold a scope-limited encrypted copy of the patient's
 * data, and for how long.
 *
 * Created by `POST /mobile/offline/policies`
 * (App\Http\Controllers\Api\Mobile\OfflineSyncController::createPolicy →
 * SyncService::createLocalCachePolicy). The server, not the client, decides
 * expiry: 24 hours for a normal policy, 6 for an emergency-access one.
 */

/** Exactly the fields `serializePolicy()` returns, plus when we stored it. */
export interface StoredOfflinePolicy {
  id: string;
  patient_id: string;
  facility_id: string | null;
  device_id: string;
  allowed_scopes: OfflineScope[];
  encryption_required: boolean;
  encryption_policy: string;
  emergency_access: boolean;
  review_required: boolean;
  status: string;
  expires_at: string | null;
  registered_at: string;
}

interface CreatePolicyResponse {
  data: Omit<StoredOfflinePolicy, 'registered_at' | 'allowed_scopes'> & {
    allowed_scopes: string[];
  };
}

export interface RegisterPolicyOptions {
  /** Defaults to every scope the backend allows. */
  scopes?: OfflineScope[];
  /** Emergency mode: 6-hour policy, flagged for review, `emergency_profile` only. */
  emergencyAccess?: boolean;
}

export async function getStoredPolicy(): Promise<StoredOfflinePolicy | null> {
  const policy = await offlineStorage.getJson<StoredOfflinePolicy>(OFFLINE_KEYS.policy);
  return policy && typeof policy.id === 'string' ? policy : null;
}

/** A policy the server will still accept writes against. */
export function isPolicyUsable(policy: StoredOfflinePolicy | null): boolean {
  if (!policy || policy.status !== 'active') return false;
  if (!policy.expires_at) return true;
  const expiry = Date.parse(policy.expires_at);
  return Number.isFinite(expiry) && expiry > Date.now();
}

export async function clearStoredPolicy(): Promise<void> {
  await offlineStorage.remove(OFFLINE_KEYS.policy);
}

/**
 * Registers a fresh policy with the backend and persists it.
 *
 * Emergency mode is scope-limited here rather than left to the server's 422:
 * `SyncService` throws `OFFLINE_EMERGENCY_SCOPE_LIMIT_REQUIRED` unless the
 * scope list is exactly `['emergency_profile']`.
 */
export async function registerPolicy(
  options: RegisterPolicyOptions = {},
): Promise<StoredOfflinePolicy> {
  const emergencyAccess = options.emergencyAccess ?? false;
  const scopes = emergencyAccess
    ? EMERGENCY_SCOPES
    : (options.scopes ?? [...OFFLINE_SCOPES]).filter(isOfflineScope);

  if (scopes.length === 0) throw new Error('OFFLINE_NO_SCOPES_SELECTED');

  const [patientId, deviceId] = await Promise.all([resolvePatientId(), getOfflineDeviceId()]);

  const { data } = await apiClient.post<CreatePolicyResponse>(endpoints.offlinePolicies, {
    patient_id: patientId,
    device_id: deviceId,
    allowed_scopes: scopes,
    emergency_access: emergencyAccess,
  });

  const stored: StoredOfflinePolicy = {
    ...data.data,
    allowed_scopes: data.data.allowed_scopes.filter(isOfflineScope),
    registered_at: new Date().toISOString(),
  };

  await offlineStorage.setJson(OFFLINE_KEYS.policy, stored);
  return stored;
}

/**
 * Returns a currently-valid policy, re-registering when the stored one has
 * lapsed. Policies are short-lived by design, so this runs before every sync
 * and every queued payload. Requires connectivity — an expired policy cannot
 * be renewed offline, which is exactly the point of the expiry.
 */
export async function ensureActivePolicy(
  options: RegisterPolicyOptions = {},
): Promise<StoredOfflinePolicy> {
  const stored = await getStoredPolicy();
  if (stored && isPolicyUsable(stored)) return stored;
  return registerPolicy({
    scopes: options.scopes ?? stored?.allowed_scopes,
    emergencyAccess: options.emergencyAccess ?? stored?.emergency_access ?? false,
  });
}
