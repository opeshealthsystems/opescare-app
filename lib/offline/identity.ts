import axios from 'axios';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL, endpoints } from '../api/endpoints';
import { tokenStorage } from '../api/tokenStorage';
import { offlineStorage } from './storage';
import { OFFLINE_KEYS } from './scopes';

/**
 * Who this device is, and who the patient is — the two identifiers
 * `POST /mobile/offline/policies` validates (`device_id`, `patient_id`).
 */

/** Exactly the key app/(auth)/permissions.tsx and app/settings.tsx use. One
 * device identity across push registration and offline policies. */
const DEVICE_FINGERPRINT_KEY = 'opescare_device_fingerprint';

/** The backend caps `device_id` at 120 characters (OfflineSyncController). */
const DEVICE_ID_MAX = 120;

/**
 * Raw, un-chunked accessor for the shared fingerprint key.
 *
 * Deliberately NOT ./storage: that one prefixes native values with a chunk
 * count, and the fingerprint is written as a plain string by permissions.tsx.
 * Reading it through the chunked reader would fail to parse and mint a second,
 * conflicting device identity.
 */
const rawDeviceStore =
  Platform.OS === 'web'
    ? {
        get: async (key: string) =>
          typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null,
        set: async (key: string, value: string) => {
          if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
        },
      }
    : {
        get: (key: string) => SecureStore.getItemAsync(key),
        set: async (key: string, value: string) => {
          await SecureStore.setItemAsync(key, value);
        },
      };

/** Same shape as app/(auth)/permissions.tsx's generator. */
function generateFingerprint(): string {
  const random = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `${Platform.OS}-${Date.now().toString(36)}-${random}`.slice(0, 128);
}

/** Returns this device's fingerprint, minting and persisting one only if the
 * push-notification flow has not already done so. */
export async function getDeviceFingerprint(): Promise<string> {
  const existing = await rawDeviceStore.get(DEVICE_FINGERPRINT_KEY);
  if (existing) return existing;
  const minted = generateFingerprint();
  await rawDeviceStore.set(DEVICE_FINGERPRINT_KEY, minted);
  return minted;
}

/** The fingerprint trimmed to what `device_id` accepts. */
export async function getOfflineDeviceId(): Promise<string> {
  return (await getDeviceFingerprint()).slice(0, DEVICE_ID_MAX);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_RE.test(value);

/** Records the patient UUID seen on an auth response. */
export async function rememberPatientId(value: unknown): Promise<void> {
  if (!isUuid(value)) return;
  await offlineStorage.setString(OFFLINE_KEYS.patientId, value);
}

export async function forgetPatientId(): Promise<void> {
  await offlineStorage.remove(OFFLINE_KEYS.patientId);
}

export async function getStoredPatientId(): Promise<string | null> {
  const stored = await offlineStorage.getString(OFFLINE_KEYS.patientId);
  return isUuid(stored) ? stored : null;
}

/**
 * Resolves the patient UUID the policy endpoint needs.
 *
 * The mobile surface never returns it on a plain read — `GET /mobile/me`
 * answers with the health_id and demographics only. It is carried solely on
 * the auth responses (`login-email`, `otp/verify`, `register`, `refresh`), so:
 *
 *  1. use the value captured by the auth interceptor (installed in ./index),
 *     which covers every session opened after this feature shipped; otherwise
 *  2. fall back to `POST /mobile/auth/refresh`, which returns `patient_id`
 *     alongside a fresh token. That call rotates the token exactly the way
 *     lib/api/client.ts's own refresh does, so the new one is persisted
 *     immediately. This is the path an already-signed-in patient takes once.
 */
export async function resolvePatientId(): Promise<string> {
  const stored = await getStoredPatientId();
  if (stored) return stored;

  const current = await tokenStorage.get();
  if (!current) throw new Error('OFFLINE_NO_SESSION');

  const { data } = await axios.post(
    `${API_BASE_URL}${endpoints.refresh}`,
    {},
    { headers: { Authorization: `Bearer ${current}`, Accept: 'application/json' } },
  );

  const nextToken: string | undefined = data?.access_token;
  if (nextToken) await tokenStorage.set(nextToken);

  const patientId: unknown = data?.patient_id;
  if (!isUuid(patientId)) throw new Error('OFFLINE_PATIENT_ID_UNRESOLVED');

  await rememberPatientId(patientId);
  return patientId;
}
