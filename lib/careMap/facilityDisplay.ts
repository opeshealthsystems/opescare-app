import type { ComponentType } from 'react';
import { Platform } from 'react-native';
import {
  Building2,
  Camera,
  FlaskConical,
  Hospital,
  MapPinned,
  Pill,
  ScanLine,
  Stethoscope,
  type LucideProps,
} from 'lucide-react-native';
import { Tooth } from '../../components/icons/Tooth';

/**
 * Presentation helpers shared by the Care Access map (`app/care-map.tsx`) and
 * the facility profile (`app/facility/[id].tsx`).
 *
 * Everything here is derived from the live `care_facilities` directory — 903
 * real Cameroonian institutions sourced from the MINSANTE annuaire, the
 * MINSANTE/DPML licensed-labs register and OpenStreetMap. Two properties of
 * that dataset drive most of the code below:
 *
 *  1. Only 395 of the 903 rows carry GPS coordinates, so distance is a
 *     sometimes-absent attribute, never a guaranteed one. Nothing may render
 *     "NaN km" and nothing may silently drop a coordinate-less row.
 *  2. `verification_status` is uniformly `unverified` and `integration_status`
 *     uniformly `none` across all 903 rows, so there is no server-side
 *     "verified" or "featured" signal to sort on. Prominence is therefore
 *     inferred from the fields that DO vary — facility type, contact
 *     completeness, presence of coordinates, and the naming conventions the
 *     MINSANTE register uses for tertiary/referral hospitals.
 */

export type Coords = { lat: number; lng: number };

/** The subset of a facility record both the list and the profile can rely on. */
export interface FacilityLike {
  id: string;
  facility_name: string;
  facility_type: string;
  ownership_type: string | null;
  city: string | null;
  region: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone_primary: string | null;
  email: string | null;
  website: string | null;
}

/** Lucide icons and our own `Tooth` are both plain `LucideProps` components. */
export type FacilityIcon = ComponentType<LucideProps>;

/**
 * Facility-type filter vocabulary. Every `value` is a literal `facility_type`
 * string as stored in `care_facilities` — the API filters with `where('facility_type', $type)`,
 * an exact match, so a typo here silently returns zero rows. Ordered to match
 * the "Care Access Map" reference chip row (All / Hospitals / Clinics / …).
 */
export const TYPE_FILTERS = [
  { value: '', key: 'all' },
  { value: 'hospital', key: 'hospital' },
  { value: 'clinic', key: 'clinic' },
  { value: 'health_center', key: 'healthCenter' },
  { value: 'pharmacy', key: 'pharmacy' },
  { value: 'laboratory', key: 'laboratory' },
  { value: 'imaging_center', key: 'imagingCenter' },
  { value: 'diagnostic_center', key: 'diagnosticCenter' },
  { value: 'dental', key: 'dental' },
] as const;

/**
 * City scopes offered by the area selector.
 *
 * These are the ten regional capitals plus the largest secondary towns, spelled
 * exactly as they appear in `care_facilities.city` (note "Limbe" carries no
 * accent in the register while "Buéa" and "Ngaoundéré" do — the API matches
 * with `city LIKE %value%`, which is accent-sensitive in PostgreSQL).
 *
 * This is a filter vocabulary, the same kind of static list as TYPE_FILTERS
 * above; the facilities themselves always come from the API.
 */
export const CITY_SCOPES = [
  'Yaoundé',
  'Douala',
  'Bafoussam',
  'Garoua',
  'Ngaoundéré',
  'Maroua',
  'Bamenda',
  'Buéa',
  'Bertoua',
  'Ebolowa',
  'Limbe',
  'Dschang',
  'Kribi',
] as const;

/**
 * Where the directory opens when the patient has not granted location access.
 *
 * The endpoint applies no ORDER BY, so an unscoped `GET /mobile/facilities`
 * returns rows in physical table order — which starts on rural integrated
 * health centres ("CSI Ndogbessol, Eseka"). Scoping to the capital instead
 * lands the first screen on CHU de Yaoundé, the Hôpital Gynéco-Obstétrique et
 * Pédiatrique, Centre Pasteur and the district hospitals. Yaoundé is also the
 * single largest listing (229 of 903 facilities).
 */
export const DEFAULT_CITY_SCOPE: string = CITY_SCOPES[0];

const TYPE_ICONS: Record<string, FacilityIcon> = {
  hospital: Hospital,
  clinic: Stethoscope,
  health_center: Building2,
  pharmacy: Pill,
  laboratory: FlaskConical,
  dental: Tooth,
  diagnostic_center: ScanLine,
  imaging_center: Camera,
};

export function iconForFacilityType(type: string): FacilityIcon {
  return TYPE_ICONS[type] ?? MapPinned;
}

/** Accent- and case-insensitive normalisation, used for de-duping and matching. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Joins location parts, dropping any that a previous part already covers.
 *
 * Most registry-sourced facilities have no street address, so `address` falls
 * back to the city — without this, "Yaoundé" + "Yaoundé" would render as
 * "Yaoundé, Yaoundé". Compared case/accent-insensitively so "YAOUNDE" and
 * "Yaoundé" are treated as the same place.
 */
export function joinLocationParts(...parts: (string | null | undefined)[]): string {
  const kept: string[] = [];
  for (const part of parts) {
    const value = part?.trim();
    if (!value) continue;
    const key = normalizeText(value);
    if (kept.some((existing) => normalizeText(existing).includes(key))) continue;
    kept.push(value);
  }
  return kept.join(', ');
}

/** Great-circle distance between two coordinates, in kilometers (haversine). */
export function distanceKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Distance from `origin` to a facility, or `null` when either side lacks
 * coordinates. Returning null rather than NaN is deliberate: 508 of the 903
 * directory rows have no latitude/longitude at all, and every caller has to
 * render those rows without a distance rather than with a broken one.
 */
export function facilityDistanceKm(origin: Coords | null, facility: FacilityLike): number | null {
  if (!origin || facility.latitude == null || facility.longitude == null) return null;
  const value = distanceKm(origin, { lat: facility.latitude, lng: facility.longitude });
  return Number.isFinite(value) ? value : null;
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.max(1, Math.round(km * 1000))} m` : `${km.toFixed(1)} km`;
}

/**
 * Naming conventions the MINSANTE register uses for tertiary, referral and
 * teaching institutions. Matching one of these is the strongest "this is a
 * major facility" signal available, since `verification_status` never varies.
 */
const MAJOR_NAME_PATTERN =
  /\b(chu|chr|hopital central|hopital general|hopital regional|hopital de district|centre hospitalier|centre pasteur|laquintinie|fondation|teaching hospital|central hospital|general hospital|regional hospital|district hospital|baptist hospital|polyclinique|national)\b/;

/** Relative prominence of each facility type when browsing "All". */
const TYPE_WEIGHT: Record<string, number> = {
  hospital: 60,
  clinic: 50,
  laboratory: 40,
  imaging_center: 38,
  diagnostic_center: 36,
  health_center: 20,
  pharmacy: 18,
  dental: 14,
};

/**
 * Heuristic "how likely is this the facility the patient meant" score.
 *
 * Built only from fields that actually vary across the dataset: facility type,
 * whether the register carries coordinates/contact details for the row (a proxy
 * for how completely it is documented), and the naming conventions above.
 * Higher is better.
 */
export function prominenceScore(facility: FacilityLike): number {
  let score = TYPE_WEIGHT[facility.facility_type] ?? 10;
  if (MAJOR_NAME_PATTERN.test(normalizeText(facility.facility_name))) score += 45;
  if (facility.latitude != null && facility.longitude != null) score += 8;
  if (facility.phone_primary) score += 4;
  if (facility.website) score += 3;
  if (facility.email) score += 2;
  return score;
}

export type FacilitySort = 'relevance' | 'distance' | 'name';

/**
 * Orders the rows the client currently holds.
 *
 * `GET /mobile/facilities` accepts no sort parameter and applies no ORDER BY,
 * so this can only reorder the pages already fetched — which is why the screen
 * shows a "showing N of M" count next to the sort control rather than implying
 * a globally-sorted list.
 *
 * Under `distance`, facilities without coordinates are pushed to the end but
 * never removed, and keep their relative order among themselves.
 */
export function sortFacilities<T extends FacilityLike>(
  facilities: T[],
  sort: FacilitySort,
  origin: Coords | null,
  locale: string,
): T[] {
  const rows = [...facilities];
  const collator = new Intl.Collator(locale === 'fr' ? 'fr' : 'en', { sensitivity: 'base' });

  if (sort === 'name') {
    return rows.sort((a, b) => collator.compare(a.facility_name, b.facility_name));
  }

  if (sort === 'distance' && origin) {
    return rows.sort((a, b) => {
      const da = facilityDistanceKm(origin, a);
      const db = facilityDistanceKm(origin, b);
      if (da != null && db != null) return da - db;
      if (da != null) return -1;
      if (db != null) return 1;
      return prominenceScore(b) - prominenceScore(a);
    });
  }

  return rows.sort((a, b) => {
    const delta = prominenceScore(b) - prominenceScore(a);
    if (delta !== 0) return delta;
    return collator.compare(a.facility_name, b.facility_name);
  });
}

/**
 * Deep-link to the device's maps app. Prefers real coordinates and falls back
 * to a text query built from address/city/region for the 508 rows without GPS,
 * so "Directions" is never a dead button on a row we can still name a place for.
 */
export function directionsUrl(facility: FacilityLike): string | null {
  const label = encodeURIComponent(facility.facility_name);
  if (facility.latitude != null && facility.longitude != null) {
    const { latitude: lat, longitude: lng } = facility;
    return (
      Platform.select({
        ios: `maps:0,0?q=${label}@${lat},${lng}`,
        android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
        default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      }) ?? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    );
  }
  const query = joinLocationParts(facility.facility_name, facility.address, facility.city, facility.region);
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

/** `tel:` URL with everything but digits and a leading + stripped. */
export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^+\d]/g, '')}`;
}

/** Website values in the register are inconsistently missing their scheme. */
export function websiteUrl(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

export interface FacilityHourLike {
  day_of_week: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean | null;
  is_24_hours: boolean | null;
}

export type OpenState =
  | { kind: 'unknown' }
  | { kind: 'open24' }
  | { kind: 'closed' }
  | { kind: 'open'; until: string }
  | { kind: 'closedNow'; opensAt: string };

/** Postgres `time` columns arrive as HH:MM:SS — show HH:MM. */
export function trimTime(value: string | null): string | null {
  if (!value) return null;
  return value.length >= 5 ? value.slice(0, 5) : value;
}

function minutesOf(value: string | null): number | null {
  const trimmed = trimTime(value);
  if (!trimmed) return null;
  const [h, m] = trimmed.split(':');
  const hours = Number.parseInt(h, 10);
  const mins = Number.parseInt(m, 10);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  return hours * 60 + mins;
}

/**
 * Resolves today's opening state from the facility's published hours.
 *
 * `day_of_week` follows Carbon/PHP's `w` (0 = Sunday), which is the same
 * numbering as JavaScript's `Date#getDay()`. Rows with no entry for today —
 * common, since most directory facilities publish no hours at all — resolve to
 * `unknown` so the UI can stay silent instead of guessing "Closed".
 */
export function openStateToday(hours: FacilityHourLike[], now = new Date()): OpenState {
  const today = hours.find((h) => h.day_of_week === now.getDay());
  if (!today) return { kind: 'unknown' };
  if (today.is_24_hours) return { kind: 'open24' };
  if (today.is_closed) return { kind: 'closed' };

  const opens = minutesOf(today.opens_at);
  const closes = minutesOf(today.closes_at);
  if (opens == null || closes == null) return { kind: 'unknown' };

  const current = now.getHours() * 60 + now.getMinutes();
  // A closing time earlier than the opening time means the shift runs past midnight.
  const isOpen = closes > opens ? current >= opens && current < closes : current >= opens || current < closes;

  return isOpen
    ? { kind: 'open', until: trimTime(today.closes_at) as string }
    : { kind: 'closedNow', opensAt: trimTime(today.opens_at) as string };
}

/** ISO weekday name rendered through the active locale rather than hardcoded. */
export function weekdayLabel(dayOfWeek: number, locale: string): string {
  // 2024-01-07 was a Sunday; day_of_week is 0=Sunday..6=Saturday (Carbon/PHP `w`).
  const base = new Date(Date.UTC(2024, 0, 7 + dayOfWeek));
  return base.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
}
