/**
 * Translated appointment vocabulary for the APPOINTMENTS list, detail and
 * BOOKING screens — the port of design reference `src/screens/care/apptLabels.ts` (archived prototype, see docs/DESIGN_REFERENCE.md).
 *
 * Why this file exists rather than a change to `./shared`:
 *
 *  - `shared.tsx` is imported by several screen clusters; the appointment
 *    screens need translated type / status / visit-mode labels without
 *    touching anyone else's render. These helpers are that map.
 *  - The kit's `formatLabel` deliberately refuses to translate API enums and
 *    says a screen "should carry an explicit `t()` map in its own namespace
 *    instead of guessing here". `opesCare.type.*` / `opesCare.apptStatus.*` /
 *    `opesCare.visitMode.*` are that map.
 *
 * What differs from the kit source, and why:
 *
 *  - The Finder API types `appointment_type` and `status` as plain strings
 *    (`lib/api/types.ts`), and its status lifecycle is
 *    `booked | confirmed | checked_in | completed | cancelled | no_show` —
 *    two of which (`booked`, `checked_in`) the OPES catalogue never had. Every
 *    lookup therefore falls through: kit key → the app's own
 *    `appointments.*` key → a humanised copy of the raw value. Nothing is
 *    ever rendered as a bare i18n key.
 *  - `scheduled_at` is nullable here, so `relativeDay` returns `''` for a
 *    missing/invalid date instead of silently reading "Today".
 *
 * Dates come from the kit's `format.ts`, which reads the app's i18next locale
 * (FR is 24-hour, French months) — the same strings the web portal shows.
 *
 * Every string goes through `t()`; no colour, no JSX, no navigation here.
 */
import { formatDate, type IconName, type StatusTone, type TFunction, type Tint } from '@/components/opes-ui';

// ── Vocabulary ─────────────────────────────────────────────────────────────

/** Types the booking flow can create plus the OPES catalogue's; the API column is free text. */
export const KNOWN_APPOINTMENT_TYPES = [
  'consultation',
  'follow_up',
  'check_up',
  'vaccination',
  'procedure',
  'lab',
  'lab_test',
  'imaging',
  'telemedicine',
  'antenatal',
  'other',
] as const;
export type KnownAppointmentType = (typeof KNOWN_APPOINTMENT_TYPES)[number];
/** Known values autocomplete; any other string is still accepted (facility-entered types). */
export type AppointmentType = KnownAppointmentType | (string & {});

/**
 * Every status the Finder API returns (MobileAppointmentController), in
 * lifecycle order, plus the OPES catalogue's extra ones so a row from a
 * future release still gets a label.
 */
export const APPOINTMENT_STATUSES = [
  'booked',
  'scheduled',
  'confirmed',
  'checked_in',
  'arrived',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled',
] as const;
export type KnownAppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export type AppointmentStatus = KnownAppointmentStatus | (string & {});

export type VisitMode = 'in_person' | 'telemedicine' | (string & {});

/** Only these two can be cancelled — the API answers 422 for anything else. */
export const CANCELLABLE_STATUSES: readonly string[] = ['booked', 'confirmed'];

/** True when the API will accept a cancellation for this status. */
export function canCancelStatus(status: AppointmentStatus | null | undefined): boolean {
  return CANCELLABLE_STATUSES.includes(norm(status));
}

/** True while the visit is still ahead (bookable-to-cancel or already on site). */
export function isUpcomingStatus(status: AppointmentStatus | null | undefined): boolean {
  const s = norm(status);
  return CANCELLABLE_STATUSES.includes(s) || s === 'scheduled' || s === 'checked_in' || s === 'arrived';
}

// ── Labels ─────────────────────────────────────────────────────────────────

/** Lower-cased, trimmed, `-`/space → `_`, so `Follow-Up` and `follow_up` hit one key. */
function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** `follow_up` → "Follow up" — the last-resort label for a value no catalogue knows. */
function humanise(raw: string): string {
  const spaced = raw.replace(/[_-]+/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : '';
}

/**
 * `t()` with a miss detectable: i18next hands back `defaultValue` when the key
 * is absent, so an empty default means "no translation" without ever showing
 * the raw key.
 */
function lookup(t: TFunction, key: string): string {
  const v = t(key, { defaultValue: '' });
  return v && v !== key ? v : '';
}

/** Where the booking flow already translated the two Finder-only types. */
const APP_TYPE_KEYS: Record<string, string> = {
  consultation: 'appointments.book.typeConsultation',
  follow_up: 'appointments.book.typeFollowUp',
  check_up: 'appointments.book.typeCheckUp',
  vaccination: 'appointments.book.typeVaccination',
  lab_test: 'appointments.book.typeLabTest',
  other: 'appointments.book.typeOther',
};

/** `consultation` → "Consultation" / « Consultation »; unknown free text is humanised; empty → "Appointment". */
export function typeLabelOf(t: TFunction, type: AppointmentType | null | undefined): string {
  const raw = norm(type);
  if (!raw) return t('opesCare.type.fallback');
  const kit = lookup(t, `opesCare.type.${raw}`);
  if (kit) return kit;
  const appKey = APP_TYPE_KEYS[raw];
  if (appKey) {
    const app = lookup(t, appKey);
    if (app) return app;
  }
  return humanise(raw) || t('opesCare.type.fallback');
}

/** `checked_in` → "Checked In" / « Enregistré ». Kit key first, then the app's own `appointments.status.*`. */
export function statusLabelOf(t: TFunction, status: AppointmentStatus | null | undefined): string {
  const raw = norm(status);
  if (!raw) return '';
  return (
    lookup(t, `opesCare.apptStatus.${raw}`) ||
    lookup(t, `appointments.status.${raw}`) ||
    humanise(raw)
  );
}

export function visitModeLabelOf(t: TFunction, mode: VisitMode | null | undefined): string {
  const raw = norm(mode);
  if (!raw) return '';
  return lookup(t, `opesCare.visitMode.${raw}`) || humanise(raw);
}

// ── Dates ──────────────────────────────────────────────────────────────────

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayDiff(a: Date, b: Date): number {
  const x = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const y = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((x - y) / 86_400_000);
}

/**
 * "Today" / "Tomorrow" / "Yesterday", else a short date.
 *
 * The fallback delegates to the kit's `formatDate`, so FR reads "01 sept. 2026"
 * — the same string the patient sees on the web portal — rather than an
 * English weekday abbreviation. A null / unparseable date yields `''`.
 */
export function relativeDay(t: TFunction, iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) return '';
  const diff = dayDiff(d, new Date());
  if (diff === 0) return t('opesCare.appt.today');
  if (diff === 1) return t('opesCare.appt.tomorrow');
  if (diff === -1) return t('opesCare.appt.yesterday');
  return formatDate(d);
}

/**
 * "Today" / "Tomorrow" / "In 4 days" / "3 days ago" — the Finder's own
 * relative wording (`appointments.inDays` / `daysAgo`), null beyond ±60 days
 * where a relative label stops being more useful than the date, and null for
 * a missing date. Kept for the rows' small brand-coloured footnote.
 */
export function relativeDayLabel(t: TFunction, iso: string | null | undefined): string | null {
  const d = toDate(iso);
  if (!d) return null;
  const days = dayDiff(d, new Date());
  if (days === 0) return t('opesCare.appt.today');
  if (days === 1) return t('opesCare.appt.tomorrow');
  if (days === -1) return t('opesCare.appt.yesterday');
  // `days`, not `count`: `count` would engage i18next plural resolution, which
  // needs `_one`/`_other` keys. ±1 never reaches here, so the plural is right.
  if (days > 1 && days <= 60) return t('appointments.inDays', { days });
  if (days < -1 && days >= -60) return t('appointments.daysAgo', { days: Math.abs(days) });
  return null;
}

/** Short human reference for an appointment UUID — `#A1B2C3D4`. */
export function appointmentReference(id: string | null | undefined): string {
  const compact = (id ?? '').replace(/-/g, '');
  return compact ? `#${compact.slice(-8).toUpperCase()}` : '';
}

// ── Tones, tints and glyphs (kit tokens only — no colours here) ────────────

/**
 * Status → kit `StatusBadge` tone. Mirrors the six distinct treatments the
 * Finder already used: `booked` is deliberately neutral (requested, not yet
 * acknowledged by the facility), the on-site states are `info`, `completed`
 * is `normal`, and the two failure terminals are `critical` / `warning`.
 */
export function statusToneOf(status: AppointmentStatus | null | undefined): StatusTone {
  switch (norm(status)) {
    case 'booked':
      return 'neutral';
    case 'scheduled':
    case 'confirmed':
      return 'pending';
    case 'checked_in':
    case 'arrived':
    case 'in_progress':
    case 'rescheduled':
      return 'info';
    case 'completed':
      return 'normal';
    case 'cancelled':
      return 'critical';
    case 'no_show':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** The glyph inside a status pill, so the six states stay apart without colour. */
export function statusIconOf(status: AppointmentStatus | null | undefined): IconName {
  switch (norm(status)) {
    case 'booked':
      return 'clock';
    case 'scheduled':
      return 'calendar';
    case 'confirmed':
      return 'check-circle';
    case 'checked_in':
    case 'arrived':
      return 'location';
    case 'in_progress':
      return 'activity';
    case 'rescheduled':
      return 'refresh';
    case 'completed':
      return 'check-circle';
    case 'cancelled':
      return 'x-circle';
    case 'no_show':
      return 'alert-circle';
    default:
      return 'clipboard';
  }
}

/** Tint for the date block / icon chip on a row (the kit's `statusTint`, on Finder statuses). */
export function statusTintOf(status: AppointmentStatus | null | undefined): Tint {
  const s = norm(status);
  if (s === 'completed') return 'green';
  if (s === 'cancelled' || s === 'no_show') return 'amber';
  return 'blue';
}

/** Category glyph for the round tint circle on a row (the kit's `typeIcon`, plus the Finder's two types). */
export function typeIconOf(type: AppointmentType | null | undefined): IconName {
  switch (norm(type)) {
    case 'lab':
    case 'lab_test':
      return 'flask';
    case 'imaging':
      return 'image';
    case 'telemedicine':
      return 'video';
    case 'vaccination':
      return 'syringe';
    case 'procedure':
      return 'first-aid';
    case 'antenatal':
      return 'baby';
    case 'follow_up':
      return 'refresh';
    case 'check_up':
      return 'heart-pulse';
    case 'consultation':
      return 'stethoscope';
    default:
      return 'clipboard';
  }
}
