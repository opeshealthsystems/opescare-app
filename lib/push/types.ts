/**
 * The `data` object every OpesCare push carries — the contract between
 * `App\Services\ExpoPushService` on the API and this app.
 *
 *   { title, body, sound: '<file>.wav', channelId, priority: 'high',
 *     data: { type, <one id>, action_url } }
 *
 * `type` decides everything on this side: which queries to refresh when it
 * arrives, which screen a tap opens, and (for `consent_request`) whether the
 * consent prompt should open at once. The ids are optional on purpose — a
 * server that omits one degrades to the list screen rather than to nothing.
 */

export const PUSH_DATA_TYPES = [
  'consent_request',
  'family_invitation',
  'lab_result',
  'appointment',
  'message',
  'emergency_access',
] as const;

export type PushDataType = (typeof PUSH_DATA_TYPES)[number];

export interface PushData {
  type?: string;
  consent_request_id?: string;
  family_link_id?: string;
  lab_order_id?: string;
  appointment_id?: string;
  thread_id?: string;
  action_url?: string;
  [key: string]: unknown;
}

export function isPushDataType(value: unknown): value is PushDataType {
  return typeof value === 'string' && (PUSH_DATA_TYPES as readonly string[]).includes(value);
}

/** A string id, or null — numbers are tolerated because ids have crossed the wire as both. */
export function pushId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * `request.content.data` as this app expects it.
 *
 * expo-notifications hands the Expo push `data` object back already parsed,
 * but on Android an FCM message that did not come through Expo's service puts
 * the JSON in a `body` string, and a payload that failed to parse can arrive
 * as a string. Both are folded in here so nothing downstream has to know.
 */
export function parsePushData(raw: unknown): PushData {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object') return {};

  const record = value as Record<string, unknown>;
  if (typeof record.body === 'string' && record.type === undefined) {
    try {
      const inner = JSON.parse(record.body);
      if (inner && typeof inner === 'object') return { ...record, ...(inner as Record<string, unknown>) };
    } catch {
      // Not JSON — it was a human-readable body after all.
    }
  }
  return record as PushData;
}
