/**
 * Shared presentation logic for the appointments list + detail screens.
 *
 * A NEW file under `components/appointments/` (not a change to `components/ui/*`)
 * so the two screens agree on exactly one status vocabulary, one type vocabulary
 * and one set of date formatters instead of drifting apart.
 *
 * Every colour comes from `theme/tokens.js` — no hardcoded hex anywhere.
 */
import { Text, View } from 'react-native';
import type { TFunction } from 'i18next';
import {
  CalendarClock,
  CircleCheck,
  CircleX,
  ClipboardList,
  FlaskConical,
  HeartPulse,
  Hourglass,
  MapPin,
  Stethoscope,
  Syringe,
  UserX,
  type LucideIcon,
} from 'lucide-react-native';
import { colors } from '../../theme/tokens';

/**
 * Every status the API can return, in lifecycle order.
 * Source: MobileAppointmentController + the appointments table's status column —
 * booked | confirmed | checked_in | completed | cancelled | no_show.
 */
export const APPOINTMENT_STATUSES = [
  'booked',
  'confirmed',
  'checked_in',
  'completed',
  'cancelled',
  'no_show',
] as const;

/** Only these two can be cancelled — the API returns 422 for anything else. */
export const CANCELLABLE_STATUSES: readonly string[] = ['booked', 'confirmed'];

export interface StatusVisual {
  bg: string;
  fg: string;
  border: string;
  icon: LucideIcon;
}

/**
 * Six visually distinct treatments, ordered along the appointment lifecycle:
 * neutral (awaiting the facility) → blue (facility confirmed) → brand gold
 * (patient has arrived) → green (done) and then the two failure terminals,
 * red (cancelled) and amber (missed). Each pill also carries its own icon, so
 * the six stay distinguishable without relying on colour alone.
 */
export function statusVisual(status: string): StatusVisual {
  switch (status) {
    case 'booked':
      // Requested but not yet acknowledged by the facility — deliberately neutral.
      return {
        bg: colors.cream[200],
        fg: colors.navy.secondary,
        border: colors.cream[300],
        icon: Hourglass,
      };
    case 'confirmed':
      return {
        bg: colors.semantic.infoSurface,
        fg: colors.semantic.info,
        border: colors.semantic.infoSurface,
        icon: CircleCheck,
      };
    case 'checked_in':
      return {
        bg: colors.brand[50],
        fg: colors.brand[600],
        border: colors.brand[100],
        icon: MapPin,
      };
    case 'completed':
      return {
        bg: colors.semantic.successSurface,
        fg: colors.semantic.success,
        border: colors.semantic.successSurface,
        icon: CircleCheck,
      };
    case 'cancelled':
      return {
        bg: colors.semantic.dangerSurface,
        fg: colors.semantic.danger,
        border: colors.semantic.dangerSurface,
        icon: CircleX,
      };
    case 'no_show':
      return {
        bg: colors.semantic.warningSurface,
        fg: colors.semantic.warning,
        border: colors.semantic.warningSurface,
        icon: UserX,
      };
    default:
      // Unknown status from a future API release — render it, don't hide it.
      return {
        bg: colors.cream[200],
        fg: colors.navy.secondary,
        border: colors.cream[300],
        icon: ClipboardList,
      };
  }
}

/** Translated status label, with the raw value as a last-resort fallback. */
export function statusLabel(status: string, t: TFunction): string {
  return t(`appointments.status.${status}`, { defaultValue: humanise(status) });
}

/**
 * A status pill: tinted surface, matching icon, translated label.
 * `sm` is for dense list rows, `md` for the detail hero.
 */
export function AppointmentStatusPill({
  status,
  label,
  size = 'sm',
}: {
  status: string;
  label: string;
  size?: 'sm' | 'md';
}) {
  const visual = statusVisual(status);
  const Icon = visual.icon;
  const compact = size === 'sm';
  return (
    <View
      className="flex-row items-center self-start rounded-full"
      style={{
        backgroundColor: visual.bg,
        borderWidth: 1,
        borderColor: visual.border,
        paddingHorizontal: compact ? 8 : 12,
        paddingVertical: compact ? 3 : 6,
        gap: compact ? 4 : 6,
      }}
    >
      <Icon size={compact ? 11 : 14} color={visual.fg} />
      <Text
        className="font-semibold"
        style={{ color: visual.fg, fontSize: compact ? 11 : 13 }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Appointment type
// ---------------------------------------------------------------------------

/**
 * The six types the booking flow can create (see APPOINTMENT_TYPES in
 * `app/appointments/book.tsx`) mapped onto the labels that already exist in the
 * `appointments.book.*` i18n block — no new keys needed, and the list, the
 * detail screen and the booking flow all say the same word.
 */
const TYPE_LABEL_KEYS: Record<string, string> = {
  consultation: 'appointments.book.typeConsultation',
  follow_up: 'appointments.book.typeFollowUp',
  check_up: 'appointments.book.typeCheckUp',
  vaccination: 'appointments.book.typeVaccination',
  lab_test: 'appointments.book.typeLabTest',
  other: 'appointments.book.typeOther',
};

/** Turn `follow_up` / `general check-up` into `Follow Up` / `General Check-up`. */
function humanise(raw: string): string {
  return raw
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Facility-booked appointments can carry free-text types the app has never seen
 * (the column is a plain string), so anything unmapped is title-cased rather
 * than dropped or shown raw.
 */
export function appointmentTypeLabel(type: string | null, t: TFunction): string {
  if (!type) return t('appointments.book.typeOther');
  const key = TYPE_LABEL_KEYS[type.toLowerCase()];
  return key ? t(key) : humanise(type);
}

/**
 * Category glyph for the round badge on each row.
 *
 * The reference mockup colour-codes these discs with pastel blues/pinks that do
 * not exist in `theme/tokens.js`, and inventing them would mean hardcoding hex.
 * They are rendered in brand gold instead and differentiated by ICON alone,
 * which also keeps every semantic colour reserved for the status pill.
 */
export function appointmentTypeIcon(type: string | null): LucideIcon {
  switch ((type ?? '').toLowerCase()) {
    case 'consultation':
      return Stethoscope;
    case 'follow_up':
      return CalendarClock;
    case 'check_up':
      return HeartPulse;
    case 'vaccination':
      return Syringe;
    case 'lab_test':
      return FlaskConical;
    default:
      return ClipboardList;
  }
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export function localeTag(locale: string): string {
  return locale?.startsWith('fr') ? 'fr-FR' : 'en-US';
}

/** `{ month: 'MAY', day: '24', weekday: 'FRI' }` for the tear-off date tile. */
export function calendarTile(iso: string | null, locale: string) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const tag = localeTag(locale);
  return {
    month: date.toLocaleDateString(tag, { month: 'short' }).replace('.', '').toUpperCase(),
    day: date.toLocaleDateString(tag, { day: '2-digit' }),
    weekday: date.toLocaleDateString(tag, { weekday: 'short' }).replace('.', '').toUpperCase(),
  };
}

export function formatTime(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(localeTag(locale), { hour: '2-digit', minute: '2-digit' });
}

export function formatLongDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(localeTag(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatLongDateTime(iso: string | null, locale: string, fallback: string): string {
  const day = formatLongDate(iso, locale);
  const time = formatTime(iso, locale);
  if (!day) return fallback;
  return time ? `${day}, ${time}` : day;
}

/**
 * "Today" / "Tomorrow" / "In 4 days" / "Yesterday" / "3 days ago".
 *
 * Compared on CALENDAR days (both sides normalised to local midnight) so an
 * appointment at 08:00 tomorrow reads "Tomorrow", not "In 0 days". Returns null
 * beyond ±60 days, where a relative label stops being more useful than the date.
 */
export function relativeDayLabel(iso: string | null, t: TFunction): string | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(target) - startOfDay(new Date())) / 86_400_000);

  if (days === 0) return t('appointments.today');
  if (days === 1) return t('appointments.tomorrow');
  if (days === -1) return t('appointments.yesterday');
  // Interpolated as `days`, not `count`: `count` would activate i18next's plural
  // resolution, which needs `_one`/`_other` suffixed keys. Neither branch can
  // ever be reached with 1 (±1 is handled above as Tomorrow/Yesterday), so the
  // plural form is always correct in both EN and FR without the suffixes.
  if (days > 1 && days <= 60) return t('appointments.inDays', { days });
  if (days < -1 && days >= -60) return t('appointments.daysAgo', { days: Math.abs(days) });
  return null;
}

/** Short human reference for an appointment UUID — `#A1B2C3D4`. */
export function shortReference(id: string): string {
  return `#${id.replace(/-/g, '').slice(-8).toUpperCase()}`;
}
