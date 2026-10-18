

import { Linking } from 'react-native';





import {
  radii,
  type IconName,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';




import { useBloodSearch, type BloodBankResult, type BloodComponentValue } from '@/lib/api/queries';
/** Split verbatim out of app/blood-finder.tsx. */

export interface City {
  key: string;
  name: string;
  lat: number;
  lng: number;
}

export const CITIES: City[] = [
  { key: 'douala', name: 'Douala', lat: 4.0511, lng: 9.7679 },
  { key: 'yaounde', name: 'Yaounde', lat: 3.848, lng: 11.5021 },
  { key: 'bafoussam', name: 'Bafoussam, Cameroon', lat: 5.4737, lng: 10.4179 },
  { key: 'bamenda', name: 'Bamenda, Cameroon', lat: 5.9631, lng: 10.1591 },
  { key: 'buea', name: 'Buea, Cameroon', lat: 4.1527, lng: 9.292 },
  { key: 'garoua', name: 'Garoua, Cameroon', lat: 9.3017, lng: 13.3921 },
];

/**
 * Blood travels further than a pharmacy trip — the radii start wider.
 * MobileBloodController::MAX_RADIUS_KM is 200, so none of these is refused.
 */
export const RADIUS_OPTIONS = [10, 25, 50, 100];

/**
 * MobileBloodController::search() defaults `limit` to 25 and `useBloodSearch`
 * sends none, so a full page of results may be a truncated one. Said out loud
 * below rather than left for the patient to assume they saw everything.
 */
export const LOCAL_RESULT_LIMIT = 25;

/** Nationwide sweep rows shown inline before the "show all" toggle. */
export const NATIONWIDE_PREVIEW = 5;

/** The backed values of App\Enums\BloodComponentType, in display order. */
export const COMPONENT_FALLBACK: BloodComponentValue[] = [
  'whole_blood',
  'red_cells',
  'platelets',
  'plasma',
];

/**
 * Maps the `icon` key App\Enums\BloodComponentType returns onto a kit glyph.
 * The kit has no `circle-dot` or `hexagon`; `target` and `shield` stand in.
 */
export const COMPONENT_ICONS: Record<string, IconName> = {
  droplet: 'droplet',
  'circle-dot': 'target',
  hexagon: 'shield',
  'flask-conical': 'flask',
};

/**
 * Kit glyph per `care_facilities.facility_type`, matching the map already used
 * on `app/care-map.tsx` so a blood bank carries the same mark on both screens.
 */
export const FACILITY_TYPE_ICON: Record<string, IconName> = {
  hospital: 'building',
  clinic: 'stethoscope',
  health_center: 'first-aid',
  blood_bank: 'droplet',
  laboratory: 'flask',
};

export const facilityIcon = (type: string | undefined): IconName =>
  FACILITY_TYPE_ICON[type ?? ''] ?? 'building';

/**
 * DESIGN_SPEC §1: red is the critical tint, and on this screen every row IS
 * blood — so the tint circle is red throughout rather than per facility type.
 */
export const BLOOD_TINT: Tint = 'red';

/**
 * English fallbacks for the stock-status word. Deliberately phrased as a
 * report ("Reported available"), never as a fact: `availability_status` is
 * what the facility last told the projector, not what is in the fridge now.
 * (See the i18n note in the report — `bloodFinder.stock.*` does not exist yet.)
 */
export const STOCK_FALLBACK: Record<string, string> = {
  available: 'Reported available',
  in_stock: 'Reported available',
  low: 'Reported low',
  limited: 'Reported low',
  none: 'Reported none left',
  out_of_stock: 'Reported none left',
  unavailable: 'No longer reported',
  unknown: 'Stock not reported',
};

/**
 * `blood_availability.freshness_status`, written by BloodAvailabilityProjector:
 * fresh ≤ 2 h, recent ≤ 6 h, stale beyond that (or never stamped). Anything
 * older than six hours is a caution, not a neutral fact.
 */
export const FRESHNESS_TONE: Record<string, StatusTone> = {
  fresh: 'normal',
  recent: 'pending',
  stale: 'warning',
};

export const freshnessRank = (value: string | null | undefined): number => {
  switch ((value ?? '').toLowerCase()) {
    case 'fresh':
      return 0;
    case 'recent':
      return 1;
    case 'stale':
      return 2;
    default:
      return 3;
  }
};

/**
 * `care_facilities.verification_status` is one of unverified / self_reported /
 * license_verified / government_verified. All four are shown, spelled out —
 * hiding "self_reported" behind the absence of a green badge tells the patient
 * nothing, and on a blood listing who checked the facility is part of the
 * answer.
 */
export const VERIFICATION_FALLBACK: Record<string, string> = {
  government_verified: 'Government verified',
  license_verified: 'Licence verified',
  self_reported: 'Listed by the facility itself',
  unverified: 'Not verified',
};

export function isVerified(status: string | null | undefined): boolean {
  return status === 'license_verified' || status === 'government_verified';
}

/** A tel: URI wants digits and a leading +, nothing else. */
export const normaliseNumber = (value: string): string => value.replace(/[^+\d]/g, '');

export function dial(number: string | null | undefined): void {
  if (!number) return;
  Linking.openURL(`tel:${normaliseNumber(number)}`).catch(() => undefined);
}

/** Pulls the backend's `error_code` out of an axios failure, if there is one. */
export function errorCodeOf(error: unknown): string | null {
  const body = (error as { response?: { data?: { error_code?: string } } })?.response?.data;
  return body?.error_code ?? null;
}

/**
 * The numbers to try, most useful first, with `emergency_contact` and
 * `phone_primary` de-duplicated — MobileBloodController falls back to the
 * facility's main line when the availability row carries no emergency contact,
 * so the two fields are very often the same string.
 */
export function phoneLines(
  facility: Pick<BloodBankResult, 'phone' | 'emergency_contact'>,
): { key: 'emergency' | 'main'; number: string }[] {
  const out: { key: 'emergency' | 'main'; number: string }[] = [];
  const push = (key: 'emergency' | 'main', value: string | null) => {
    const digits = value ? normaliseNumber(value) : '';
    if (!value || digits.length < 3) return;
    if (out.some((line) => normaliseNumber(line.number) === digits)) return;
    out.push({ key, number: value });
  };
  push('emergency', facility.emergency_contact);
  push('main', facility.phone);
  return out;
}

export type SheetKey = 'city' | 'radius' | 'component' | 'group' | null;

/**
 * Urgency, as the reference finder card offers it (PM-BLOOD-01, step 3) and as
 * `POST api/mobile/blood/requests` already accepts it.
 *
 * Emergency leads because the screen exists for emergencies; the tones follow
 * the kit's semantic scale rather than the accent, so "routine" never borrows
 * the alarm colour.
 */
export type UrgencyValue = 'emergency' | 'urgent' | 'routine';

export const URGENCY_OPTIONS: { value: UrgencyValue; icon: IconName }[] = [
  { value: 'emergency', icon: 'alert-triangle' },
  { value: 'urgent', icon: 'clock' },
  { value: 'routine', icon: 'clock' },
];

/**
 * The four assurances the reference strips across the finder, under the search
 * card. Each one is a claim this platform can actually stand behind: screening
 * and verification are facility attributes the directory already carries, the
 * freshness stamp is on every stock row, and the privacy line is the Health ID
 * consent model. Nothing here is a number.
 */
export const TRUST_POINTS: { key: string; icon: IconName }[] = [
  { key: 'screened', icon: 'shield-check' },
  { key: 'realtime', icon: 'clock' },
  { key: 'lives', icon: 'heart-pulse' },
  { key: 'private', icon: 'lock' },
];

