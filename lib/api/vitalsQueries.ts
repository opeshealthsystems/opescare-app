/**
 * Health Vitals data layer — additive companion to `lib/api/queries.ts`.
 *
 * Backend: `GET /mobile/vitals/latest` (MobileVitalsController::latest), added
 * alongside this file. It is READ-ONLY over data the platform already stores —
 * `triage_vital_signs`, the visit-scoped `vital_signs` table, and a published
 * glucose `lab_results` row for blood sugar. Nothing is invented server-side
 * and nothing is invented here.
 *
 * Two rules this module exists to enforce on the UI:
 *
 *   1. A measure the patient has never had recorded is ABSENT from the
 *      response. It must render as an empty state, never as `0` or `--/--`.
 *   2. Every measure carries its OWN `recorded_at`. A reading from three weeks
 *      ago is not "today's vitals", so `readingAge()` below turns that
 *      timestamp into an explicit freshness bucket the card can show.
 */
import { useQuery } from '@tanstack/react-query';
import { apiClient } from './client';

/** Path is spelled out here rather than in `endpoints.ts`, which is owned elsewhere. */
export const VITALS_LATEST_ENDPOINT = '/mobile/vitals/latest';

/**
 * Advisory only. The API is explicit that this flags a value for a human to
 * look at — it is not a diagnosis, and `unknown` means the API declined to
 * classify (unrecognised unit, or a context where a range would be unsafe).
 */
export type VitalStatus = 'normal' | 'low' | 'high' | 'critical' | 'abnormal' | 'unknown';

/** The measures the endpoint can return, in the order it returns them. */
export type VitalKey =
  | 'heart_rate'
  | 'blood_pressure'
  | 'blood_sugar'
  | 'oxygen_saturation'
  | 'temperature'
  | 'respiratory_rate';

export interface VitalMeasure {
  key: VitalKey;
  /** Pre-formatted by the API: "72", "120/80", "36.8". Never null. */
  value: string;
  /** "bpm", "mmHg", "mg/dL", "%", "°C", "/min" — null only if the lab published none. */
  unit: string | null;
  status: VitalStatus;
  /** ISO-8601. When this measure was actually taken, not when it was fetched. */
  recorded_at: string;
  /** Which real table it came from — vitals capture, or a laboratory result. */
  source: 'vitals' | 'lab';
}

export interface LatestVitals {
  measures: VitalMeasure[];
  /** Newest `recorded_at` across all measures, or null when there are none. */
  recorded_at: string | null;
}

interface LatestVitalsResponse {
  data: LatestVitals;
  meta: { count: number };
}

/**
 * The patient's latest reading per measure.
 *
 * Scope comes from the bearer token alone — there is no patient parameter to
 * pass, by design. Vitals change slowly and a stale number is a clinical
 * hazard, so this is cached briefly and refetched when the app is refocused
 * rather than being held for the session.
 */
export function useLatestVitals() {
  return useQuery({
    queryKey: ['vitals', 'latest'],
    queryFn: async () => (await apiClient.get<LatestVitalsResponse>(VITALS_LATEST_ENDPOINT)).data.data,
    staleTime: 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Reading age
//
// The design reference prints "Last updated: Today, 7:30 AM". That is only
// honest while the reading IS from today, so the age is computed and the label
// changes with it instead of always claiming freshness.
// ---------------------------------------------------------------------------

export type ReadingFreshness = 'today' | 'recent' | 'stale' | 'unknown';

export interface ReadingAge {
  freshness: ReadingFreshness;
  /** Whole days between the reading and now. Null when unparseable. */
  days: number | null;
}

/** Older than this and the card stops presenting the reading as current. */
export const STALE_AFTER_DAYS = 30;

/**
 * Bucket a reading timestamp. `recent` is "within the last month"; beyond that
 * a vital is `stale` and must be visibly marked as such — an old blood
 * pressure displayed as if it were this morning's is the failure mode this
 * whole function exists to prevent.
 */
export function readingAge(recordedAt: string | null | undefined, now: Date = new Date()): ReadingAge {
  if (!recordedAt) return { freshness: 'unknown', days: null };

  const taken = new Date(recordedAt);
  if (Number.isNaN(taken.getTime())) return { freshness: 'unknown', days: null };

  const days = Math.floor((now.getTime() - taken.getTime()) / 86_400_000);

  // A future timestamp is a clock or data problem, not freshness — say so.
  if (days < 0) return { freshness: 'unknown', days: null };

  const sameCalendarDay =
    taken.getFullYear() === now.getFullYear() &&
    taken.getMonth() === now.getMonth() &&
    taken.getDate() === now.getDate();

  if (sameCalendarDay) return { freshness: 'today', days: 0 };
  if (days >= STALE_AFTER_DAYS) return { freshness: 'stale', days };
  return { freshness: 'recent', days };
}

/** True when a measure should carry the out-of-range treatment. */
export function isOutOfRange(status: VitalStatus): boolean {
  return status === 'low' || status === 'high' || status === 'critical' || status === 'abnormal';
}
