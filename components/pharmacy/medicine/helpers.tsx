import {
  StatusBadge,
  formatDate,
  type IconName,
  type StatusTone,
} from '@/components/opes-ui';

import {
  type NearbyPharmacy,
  type PharmacyPrescriptionOption,
  type PharmacyStock,
  type StockStatusValue,
} from '@/lib/api/queries';
import { formatXaf, formatXafBare } from '@/lib/api/pharmacyQueries';
/** Split verbatim out of app/pharmacy/[medicineId].tsx. */

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

/** MedicineReservationService::MAX_QUANTITY — the server clamps to this too. */
export const MAX_QUANTITY = 10;

/** MedicineReservationService::MAX_OPEN_RESERVATIONS. */
export const MAX_OPEN_HOLDS = 10;

/** MobilePharmacyController caps the reservation note at 500 characters. */
export const MAX_NOTE_LENGTH = 500;

/** Radius steps offered here, capped at MedicineFinderService::MAX_RADIUS_KM (50). */
export const RADIUS_LADDER = [5, 10, 25, 50];

/**
 * A stock report older than this is treated as history, not as the shelf.
 * Nothing on the server expires a stock row, so the honesty has to happen here.
 */
export const STOCK_STALE_DAYS = 30;

/** `care_facilities.verification_status` values this app is willing to interpret. */
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

/** Route params are strings and may be absent or junk — never trust `Number()`. */
export function numberParam(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * The kit's `toneForStatus` does not know the pharmacy stock vocabulary
 * (`in_stock` / `low_stock` / `out_of_stock`), so the tone is mapped here and
 * passed explicitly to `StatusBadge`.
 */
export function stockTone(status: StockStatusValue | undefined): StatusTone {
  switch (status) {
    case 'in_stock':
      return 'normal';
    case 'low_stock':
      return 'warning';
    case 'out_of_stock':
      return 'critical';
    default:
      return 'neutral';
  }
}

/**
 * XAF quoted the way the counter says it, and never relabelled. Every price in
 * these payloads travels with its own `currency`, so a row that is not XAF is
 * printed with its ISO code rather than silently renamed to francs.
 */
export function money(value: number | null | undefined, currency?: string | null): string | null {
  const code = (currency ?? 'XAF').toUpperCase();
  if (code === 'XAF' || code === 'FCFA' || code === '') return formatXaf(value);
  const bare = formatXafBare(value);
  return bare === null ? null : `${bare} ${code}`;
}

/** Whole days since an ISO timestamp, or null when it is absent or unparseable. */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  return Math.floor((Date.now() - at) / 86_400_000);
}

/**
 * "Verified pharmacy" / "Not verified", or nothing at all — never a guess for
 * a status value this app does not recognise.
 */
export function verificationLine(
  status: string | null | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
): string | null {
  const value = (status ?? '').trim().toLowerCase();
  if (VERIFIED_STATUSES.has(value)) return t('pharmacy.verified', { defaultValue: 'Verified pharmacy' });
  if (UNVERIFIED_STATUSES.has(value)) return t('pharmacy.notVerified', { defaultValue: 'Not verified' });
  return null;
}

/** Open / closed / 24h / hours-not-published, from the opening state the API sends. */
export function hoursLine(
  pharmacy: NearbyPharmacy,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (pharmacy.is_24_hours) return t('pharmacy.open24');
  if (pharmacy.is_open === null) return t('pharmacy.hoursUnknown');
  if (pharmacy.is_open) {
    return pharmacy.closes_at ? t('pharmacy.closesAt', { time: pharmacy.closes_at }) : t('pharmacy.open');
  }
  return pharmacy.opens_at ? t('pharmacy.opensAt', { time: pharmacy.opens_at }) : t('pharmacy.closed');
}

/**
 * When the pharmacy last said anything about this medicine, and whether that
 * is old enough to stop trusting. Shown on every stocking row without
 * exception — a pack count is not a substitute for a date.
 */
export function freshness(
  stock: PharmacyStock | null | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
): { date: string; line: string; stale: boolean } {
  const age = daysSince(stock?.last_reported_at);
  if (age === null) {
    return {
      date: t('prescriptions.notRecorded'),
      line: t('pharmacy.stockNotDated', { defaultValue: 'The pharmacy did not date this report' }),
      // An undated report cannot be presented as current either.
      stale: true,
    };
  }
  return {
    date: formatDate(stock?.last_reported_at),
    line: t('pharmacy.stockUpdated', { when: formatDate(stock?.last_reported_at) }),
    stale: age > STOCK_STALE_DAYS,
  };
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

/** Localised label for a prescription's status, falling back to readable text. */
export function prescriptionStatusLabel(
  status: string,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  switch (status) {
    case 'active':
      return t('prescriptions.statusActive');
    case 'dispensed':
      return t('prescriptions.statusDispensed');
    case 'partially_dispensed':
      return t('prescriptions.statusPartiallyDispensed');
    case 'expired':
      return t('prescriptions.statusExpired');
    case 'cancelled':
      return t('prescriptions.statusCancelled');
    default:
      return status.replace(/_/g, ' ');
  }
}

/** A prescription the pharmacy is likely to refuse: past its expiry, or void. */
export function prescriptionUnusable(rx: PharmacyPrescriptionOption): boolean {
  if (rx.status === 'expired' || rx.status === 'cancelled') return true;
  const age = daysSince(rx.expires_at);
  return age !== null && age > 0;
}

