/**
 * Reference bands for the vitals a chart shows.
 *
 * Port of design reference `src/utils/vitalBands.ts` (archived prototype, see docs/DESIGN_REFERENCE.md), which `chartShared.tsx` depends on
 * and this app did not yet carry. It lives under `components/doctor/` rather
 * than a shared `lib/` because the clinician chart is its only consumer today.
 *
 * SOURCE OF TRUTH — these numbers are not invented here. They mirror, value
 * for value, the server-side constant
 * `App\Http\Controllers\VitalSignsController::BANDS`, which is the same set
 * `TriageController::vitalBreaches()` and the desktop vitals screen band
 * against. The classification rule below is a direct transcription of
 * `vitalBreaches()`: outside the wide band is `critical`, outside the normal
 * band is `outside`, otherwise `normal`.
 *
 * The vitals endpoint does not return ranges, so any measurement not listed
 * here (weight, height, BMI, blood glucose, head circumference) has NO band
 * and the screen says so rather than guessing. DO NOT add a metric to this
 * table without a source in the platform codebase.
 */
import i18next from 'i18next';
import type { StatusTone } from '@/components/opes-ui';

/** [normal-low, normal-high, wide-low, wide-high] */
export type Band = readonly [number, number, number, number];

export const VITAL_BANDS = {
  bp_systolic: [90, 139, 80, 180],
  bp_diastolic: [60, 89, 50, 120],
  pulse: [60, 100, 40, 130],
  temperature: [36.0, 37.5, 35.0, 39.5],
  respiratory_rate: [12, 20, 8, 30],
  spo2: [95, 100, 88, 100],
} as const satisfies Record<string, Band>;

export type BandedVital = keyof typeof VITAL_BANDS;

/** `normal` in range · `outside` outside the usual range · `critical` outside the wide range. */
export type VitalBand = 'normal' | 'outside' | 'critical';

/** Transcription of `TriageController::vitalBreaches()`. `null` when there is nothing to band. */
export function bandOf(field: BandedVital, value: number | null | undefined): VitalBand | null {
  if (value == null || Number.isNaN(value)) return null;
  const [lo, hi, wideLo, wideHi] = VITAL_BANDS[field];
  if (value < wideLo || value > wideHi) return 'critical';
  if (value < lo || value > hi) return 'outside';
  return 'normal';
}

/** The more concerning of two bands — blood pressure is banded on both numbers. */
export function worstBand(a: VitalBand | null, b: VitalBand | null): VitalBand | null {
  const rank: Record<VitalBand, number> = { critical: 0, outside: 1, normal: 2 };
  const present = [a, b].filter((x): x is VitalBand => x !== null);
  if (present.length === 0) return null;
  return present.sort((x, y) => rank[x] - rank[y])[0] ?? null;
}

/** Band → design tone (in range green, off-range amber, critical red). */
export function toneForBand(band: VitalBand | null): StatusTone {
  switch (band) {
    case 'normal':
      return 'normal';
    case 'outside':
      return 'warning';
    case 'critical':
      return 'critical';
    default:
      return 'neutral';
  }
}

/**
 * Short, NON-DIAGNOSTIC wording for the badge next to an out-of-range value.
 * "Outside usual range" is a statement about a number; "hypertensive" would be
 * a diagnosis, and this app does not make those.
 */
export function bandLabel(band: VitalBand | null): string | null {
  switch (band) {
    case 'normal':
      return i18next.t('opesDoctor.vitals.bandNormal', { defaultValue: 'In range' }) as string;
    case 'outside':
      return i18next.t('opesDoctor.vitals.bandOutside', {
        defaultValue: 'Outside usual range',
      }) as string;
    case 'critical':
      return i18next.t('opesDoctor.vitals.bandCritical', {
        defaultValue: 'Well outside usual range',
      }) as string;
    default:
      return null;
  }
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

/** "90 – 139", the usual-range half of the band. */
export function usualRange(field: BandedVital): string {
  const [lo, hi] = VITAL_BANDS[field];
  return `${trim(lo)} – ${trim(hi)}`;
}
