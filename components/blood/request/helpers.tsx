import { Linking } from 'react-native';

import { type IconName, type StatusTone, type Tint } from '@/components/opes-ui';

import { type BloodUrgencyValue } from '@/lib/api/queries';
/** Split verbatim out of app/blood-finder/request.tsx. */

export const URGENCIES: BloodUrgencyValue[] = ['routine', 'urgent', 'emergency'];

/** The kit has no `timer` or `siren`; `clock` / `refresh` / `alert-triangle` carry it. */
export const URGENCY_ICON: Record<BloodUrgencyValue, IconName> = {
  routine: 'clock',
  urgent: 'refresh',
  emergency: 'alert-triangle',
};

export const URGENCY_TONE: Record<BloodUrgencyValue, StatusTone> = {
  routine: 'neutral',
  urgent: 'warning',
  emergency: 'critical',
};

export type FieldTone = 'default' | 'warning' | 'critical';

/** How the urgency FIELD paints itself — PM-BLOOD-03 tints it red on Emergency. */
export const URGENCY_FIELD_TONE: Record<BloodUrgencyValue, FieldTone> = {
  routine: 'default',
  urgent: 'warning',
  emergency: 'critical',
};

/** DESIGN_SPEC §1: red is the critical tint, and every row on this screen is blood. */
export const BLOOD_TINT: Tint = 'red';

/** `note` is validated `max:500` server-side; the counter mirrors that exactly. */
export const NOTE_MAX_LENGTH = 500;

/** `contact_phone` is validated `max:32` server-side. */
export const PHONE_MAX_LENGTH = 32;

/** Shortest string that could be a real Cameroonian number once punctuation goes. */
export const PHONE_MIN_DIGITS = 7;

/** Folded into `note`, so it has to leave room for the note itself. */
export const REQUEST_FOR_MAX_LENGTH = 60;

/** `needed_by` is `after_or_equal:today`, so every offer below starts at today. */
export const NEEDED_BY_OFFSETS = [0, 1, 3, 7];

/**
 * How the blood bank should reach the patient. There is no `contact_preference`
 * column on the request, so this choice travels as a labelled line inside
 * `note` — and `in_app` genuinely sends no number at all.
 */
export const CONTACT_CHOICES = ['phone', 'sms', 'in_app'] as const;
export type ContactChoice = (typeof CONTACT_CHOICES)[number];

export const CONTACT_ICON: Record<ContactChoice, IconName> = {
  phone: 'phone',
  sms: 'chat',
  in_app: 'bell',
};

export const CONTACT_FALLBACK: Record<ContactChoice, string> = {
  phone: 'Phone call',
  sms: 'SMS',
  in_app: 'In-app',
};

/** Kit glyph per `care_facilities.facility_type` (same map as the finder list). */
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
 * English fallbacks for the stock-status word, phrased as the report it is
 * rather than as a fact.
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
 * `blood_availability.freshness_status`: fresh ≤ 2 h, recent ≤ 6 h, stale
 * beyond that or never stamped (BloodAvailabilityProjector::freshness).
 */
export const FRESHNESS_TONE: Record<string, StatusTone> = {
  fresh: 'normal',
  recent: 'pending',
  stale: 'warning',
};

/** All four `care_facilities.verification_status` values, spelled out. */
export const VERIFICATION_FALLBACK: Record<string, string> = {
  government_verified: 'Government verified',
  license_verified: 'Licence verified',
  self_reported: 'Listed by the facility itself',
  unverified: 'Not verified',
};

export function isVerified(status: string | null | undefined): boolean {
  return status === 'license_verified' || status === 'government_verified';
}

export const normaliseNumber = (value: string): string => value.replace(/[^+\d]/g, '');

export function dial(number: string | null | undefined): void {
  if (!number) return;
  Linking.openURL(`tel:${normaliseNumber(number)}`).catch(() => undefined);
}

/** `YYYY-MM-DD` in the device's own calendar day — what Laravel's `date` rule wants. */
export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dayFromNow(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}

/** Whole years between `dob` and today, or null when there is no usable date. */
export function yearsSince(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const monthDelta = now.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) years -= 1;
  return years >= 0 && years < 130 ? years : null;
}

/**
 * App\Enums\BloodRequestStatus, in the order a request travels. `rejected`,
 * `cancelled` and `expired` are terminal and never reach this strip.
 */
export const LIFECYCLE: string[] = ['pending', 'confirmed', 'ready', 'fulfilled'];

/* ── Failures ─────────────────────────────────────────────────────────────── */

export type FailureKind =
  | 'not_available'
  | 'facility_missing'
  | 'too_many'
  | 'duplicate'
  | 'validation'
  | 'network'
  | 'generic';

export interface SubmitFailure {
  kind: FailureKind;
  /** The backend's `error_code`, when it sent one. */
  code: string | null;
  /** Field-level validation text, when the failure was a 422 with `errors`. */
  detail: string | null;
}

export interface ApiErrorShape {
  response?: {
    status?: number;
    data?: {
      error_code?: string;
      message?: string;
      errors?: Record<string, string[]>;
    };
  };
}

/**
 * Sorts one failure into the five things that can actually have happened, so
 * the screen can say which — "we couldn't send it" and "they haven't got it"
 * are not the same sentence, and only one of them is worth retrying.
 */
export function classifyFailure(error: unknown): SubmitFailure {
  const response = (error as ApiErrorShape)?.response;

  // No response at all: DNS, timeout, aeroplane mode. Nothing was created.
  if (!response) return { kind: 'network', code: null, detail: null };

  const data = response.data ?? {};
  const code = data.error_code ?? null;

  switch (code) {
    case 'BLOOD_NOT_AVAILABLE':
      return { kind: 'not_available', code, detail: null };
    case 'FACILITY_NOT_FOUND':
      return { kind: 'facility_missing', code, detail: null };
    case 'TOO_MANY_OPEN_REQUESTS':
      return { kind: 'too_many', code, detail: null };
    case 'REQUEST_ALREADY_OPEN':
      return { kind: 'duplicate', code, detail: null };
    default:
      break;
  }

  if (response.status === 422 && data.errors) {
    const detail = Object.values(data.errors).flat().join('\n');
    return { kind: 'validation', code, detail: detail || null };
  }

  return { kind: 'generic', code, detail: null };
}

export type Phase = 'form' | 'review';

/** Which inline dropdown is expanded. Only one at a time, like a real picker. */
export type OpenMenu = 'urgency' | 'neededBy' | null;

