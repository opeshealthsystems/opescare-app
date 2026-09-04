/**
 * Reference bands for the vitals a patient can see.
 *
 * SOURCE OF TRUTH — these numbers are not invented here. They mirror, value for
 * value, the server-side constant `App\Http\Controllers\VitalSignsController::BANDS`
 * (`app/Http/Controllers/VitalSignsController.php:29-36`), which is the same set
 * `TriageController::vitalBreaches()` (`app/Http/Controllers/TriageController.php:231`)
 * and the desktop vitals screen (`resources/views/clinical/vitals.blade.php:23-32`)
 * band against. The classification rule below is a direct transcription of
 * `vitalBreaches()`: outside the wide band is `critical`, outside the normal band
 * is `outside`, otherwise `normal`.
 *
 * `GET /patient/vitals` does not return ranges, so any measurement not listed
 * here (weight, BMI) has NO band and the screen says so rather than guessing.
 * Do not add a metric to this table without a source in the codebase.
 */
import { StatusTone } from '../theme/theme';

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
  return present.sort((x, y) => rank[x] - rank[y])[0];
}

/**
 * Band → design tone, mirroring `diagnostics/shared.tsx:184 toneForFlag`
 * (in range green, off-range amber, critical red).
 */
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

/** Short, non-diagnostic wording for the badge next to an out-of-range value. */
export function bandLabel(band: VitalBand | null): string | null {
  switch (band) {
    case 'normal':
      return 'In range';
    case 'outside':
      return 'Outside usual range';
    case 'critical':
      return 'Well outside usual range';
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
