import { type IconName, type StatusTone } from '@/components/opes-ui';

import { type Medicine } from '@/lib/api/queries';
import { formatXaf, formatXafBare, useMedicineCatalog } from '@/lib/api/pharmacyQueries';
/** Split verbatim out of app/pharmacy.tsx. */

export interface City {
  key: string;
  name: string;
  lat: number;
  lng: number;
}

/** Search origins. Coordinates are the city centres the API's Haversine filter
 *  measures from — the real pharmacy rows carry OpenStreetMap coordinates. */
export const CITIES: City[] = [
  { key: 'douala', name: 'Douala, Cameroon', lat: 4.0511, lng: 9.7679 },
  { key: 'yaounde', name: 'Yaounde, Cameroon', lat: 3.848, lng: 11.5021 },
  { key: 'bafoussam', name: 'Bafoussam, Cameroon', lat: 5.4737, lng: 10.4179 },
  { key: 'bamenda', name: 'Bamenda, Cameroon', lat: 5.9631, lng: 10.1591 },
  { key: 'buea', name: 'Buea, Cameroon', lat: 4.1527, lng: 9.292 },
  { key: 'garoua', name: 'Garoua, Cameroon', lat: 9.3017, lng: 13.3921 },
];

/** MedicineFinderService::MAX_RADIUS_KM is 50 — never offer more than that. */
export const RADIUS_OPTIONS = [2, 5, 10, 25, 50];

/** Nearby pharmacies shown before the "show all" toggle (the API returns 25). */
export const NEARBY_PREVIEW = 6;

/**
 * MobilePharmacyController::nearbyPharmacies defaults `limit` to 25 and the
 * hook sends none, so a full page is a TRUNCATED page, not "all of them".
 */
export const NEARBY_API_LIMIT = 25;

/** `useMedicineCatalog` asks for 25 rows; the total it reports can exceed that. */
export const CATALOG_PAGE_SIZE = 25;

/** MedicineReservationService::MAX_OPEN_RESERVATIONS — the server enforces it too. */
export const MAX_OPEN_HOLDS = 10;

/**
 * Maps the `category_icon` key MedicineCategory::iconKey() returns onto a kit
 * glyph. Every value the enum can emit is covered; `first-aid` is the
 * defensive fallback if the enum gains a case before this map does.
 */
export const CATEGORY_ICONS: Record<string, IconName> = {
  pill: 'pill',
  'shield-plus': 'shield',
  droplet: 'droplet',
  'heart-pulse': 'heart-pulse',
  'flask-conical': 'flask',
  wind: 'lungs',
  sparkles: 'sun',
  'circle-dot': 'target',
  bug: 'microscope',
  baby: 'baby',
  package: 'first-aid',
};

export const FALLBACK_CATEGORY_ICON: IconName = 'first-aid';

/**
 * The tint each category wears on the rail, keyed by the same icon key the API
 * sends. The reference gives every tile its own colour and that variety IS the
 * rail — a rail in one grey reads as a row of chips. Values are palette keys,
 * so both brands and both themes resolve them themselves.
 */
export type TintKey = 'tintRed' | 'tintGreen' | 'tintBlue' | 'tintAmber' | 'tintPurple';

export const CATEGORY_TINTS: Record<string, TintKey> = {
  pill: 'tintRed',
  'shield-plus': 'tintGreen',
  droplet: 'tintPurple',
  'heart-pulse': 'tintRed',
  'flask-conical': 'tintBlue',
  wind: 'tintGreen',
  sparkles: 'tintAmber',
  'circle-dot': 'tintAmber',
  bug: 'tintPurple',
  baby: 'tintBlue',
  package: 'tintBlue',
};

export const FALLBACK_CATEGORY_TINT: TintKey = 'tintBlue';

/**
 * `care_facilities.verification_status` is a free-form column, so only values
 * this app actually understands are rendered. Anything else — including null —
 * shows no verification line at all: silence is honest, a guess is not.
 */
export const VERIFIED_STATUSES = new Set(['verified', 'verified_by_facility', 'facility_verified', 'approved']);
export const UNVERIFIED_STATUSES = new Set(['unverified', 'pending', 'provisional', 'rejected', 'suspended']);

/** Reservation status → badge tone. Enum: App\Enums\MedicineReservationStatus. */
export const RESERVATION_TONES: Record<string, StatusTone> = {
  pending: 'pending',
  confirmed: 'normal',
  ready_for_pickup: 'normal',
  collected: 'normal',
  rejected: 'critical',
  cancelled: 'neutral',
  expired: 'critical',
};

/**
 * Which dropdown pill is currently open. The MED-01 render draws these four
 * controls as dropdowns, not as toggle chips, so only one panel is open at a
 * time and the pill that owns it shows a chevron-up.
 */
export type SheetKey = 'city' | 'radius' | 'type' | 'filters' | null;
/** null = both kinds, true = prescription-only, false = over-the-counter. */
export type RxFilter = boolean | null;

/**
 * XAF quoted the way the counter says it, and never relabelled.
 *
 * `formatXaf` hard-codes the FCFA label, which is right for the only currency
 * this deployment carries. Every price in these payloads travels with its own
 * `currency` field, though, so a row that is not XAF is printed with its own
 * ISO code rather than silently renamed to francs.
 */
export function money(value: number | null | undefined, currency?: string | null): string | null {
  const code = (currency ?? 'XAF').toUpperCase();
  if (code === 'XAF' || code === 'FCFA' || code === '') return formatXaf(value);
  const bare = formatXafBare(value);
  return bare === null ? null : `${bare} ${code}`;
}

/** Bare left half of a "200 – 500 FCFA" range (the right half carries the unit). */
export function moneyBare(value: number | null | undefined): string | null {
  return formatXafBare(value);
}

/**
 * What the price figures on a catalogue row actually are.
 *
 * `medicinePayload()` builds `availability.price_min` as
 * `$availability['price_min'] ?? $medicine->price_min` — so when no pharmacy
 * has reported a priced stock row, the "range" is the catalogue's own
 * reference price, not something anybody is charging. `pharmacy_count === 0`
 * is the case we can prove, and it is labelled as indicative rather than
 * presented as a real quote.
 */
export function priceQuote(
  medicine: Medicine,
  t: (key: string, params?: Record<string, unknown>) => string,
): { label: string; reported: boolean } | null {
  const { price_min: min, price_max: max, currency, pharmacy_count: count } = medicine.availability;
  if (min === null && max === null) return null;

  const label =
    min !== null && max !== null && min !== max
      ? t('pharmacy.priceRangeValue', { min: moneyBare(min), max: money(max, currency) })
      : (money(min ?? max, currency) ?? '');

  return label ? { label, reported: count > 0 } : null;
}

/** "500mg · Tablet", or whichever half exists. */
export function strengthForm(
  medicine: Pick<Medicine, 'strength' | 'form'>,
  t: (key: string, params?: Record<string, unknown>) => string,
): string | null {
  if (medicine.strength && medicine.form) {
    return t('pharmacy.strengthForm', { strength: medicine.strength, form: medicine.form });
  }
  return medicine.strength ?? medicine.form ?? null;
}

/**
 * The care_facilities directory stores a placeholder where a pharmacy has no
 * published number — the live rows literally hold the string "N/A", which
 * would otherwise become a `tel:N/A` link that does nothing but look broken.
 * Anything without at least four digits is treated as absent.
 */
export function callablePhone(phone: string | null | undefined): string | null {
  const raw = phone?.trim();
  if (!raw) return null;
  return raw.replace(/\D/g, '').length >= 4 ? raw : null;
}

