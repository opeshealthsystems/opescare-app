import { makeStyles } from './styles';
import { openExternal } from '@/lib/openExternal';
import { useMemo, type ReactNode } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

import {
  Card,
  EmptyState,
  Icon,
  ListRow,
  StatusBadge,
  formatDate,
  formatDateLong,
  formatTime,
  useTheme,
  type IconName,
  type Tint,
} from '@/components/opes-ui';
import { ProviderAvatar } from '@/components/care/shared';

import { type CareFacilitySummary, type FacilityProviderSummary, type PaginatedFacilities } from '@/lib/api/queries';
import { localDateKey, type FacilityBookability, type SlotPeriod } from '@/lib/api/bookingQueries';

/** Split verbatim out of app/appointments/book.tsx. */

export type Step = 'facility' | 'doctor' | 'slot' | 'confirm' | 'success';

export const WIZARD_STEPS: Step[] = ['facility', 'doctor', 'slot', 'confirm'];

/**
 * The facility shape this flow needs. The picker hands over a
 * CareFacilitySummary; a deep link from the facility/doctor screens hydrates
 * from CareFacilityDetail instead, which carries everything except
 * `listing_status` (the detail endpoint only ever returns active listings).
 */
export type BookingFacility = Omit<CareFacilitySummary, 'listing_status'>;

/**
 * Filter values are the raw `care_facilities.facility_type` strings and must
 * match the column exactly — a `'lab'`-for-`'laboratory'` slip silently returns
 * zero rows with no error anywhere. Verified against the live table:
 * pharmacy 385 · health_center 263 · laboratory 119 · hospital 98 ·
 * imaging_center 15 · diagnostic_center 11 · clinic 10 · dental 2.
 */
export const FACILITY_TYPES = [
  'hospital',
  'clinic',
  'health_center',
  'pharmacy',
  'laboratory',
  'imaging_center',
  'diagnostic_center',
  'dental',
] as const;

export type FacilityType = (typeof FACILITY_TYPES)[number];

export const FACILITY_TYPE_META: Record<FacilityType, { key: string; icon: IconName }> = {
  hospital: { key: 'filterHospital', icon: 'building' },
  clinic: { key: 'filterClinic', icon: 'stethoscope' },
  health_center: { key: 'filterHealthCenter', icon: 'heart-pulse' },
  pharmacy: { key: 'filterPharmacy', icon: 'pill' },
  laboratory: { key: 'filterLab', icon: 'flask' },
  imaging_center: { key: 'filterImaging', icon: 'image' },
  diagnostic_center: { key: 'filterDiagnostic', icon: 'microscope' },
  dental: { key: 'filterDental', icon: 'smile' },
};

export const APPOINTMENT_TYPES: { value: string; key: string }[] = [
  { value: 'consultation', key: 'typeConsultation' },
  { value: 'follow_up', key: 'typeFollowUp' },
  { value: 'check_up', key: 'typeCheckUp' },
  { value: 'vaccination', key: 'typeVaccination' },
  { value: 'lab_test', key: 'typeLabTest' },
  { value: 'other', key: 'typeOther' },
];

export const PERIOD_META: Record<SlotPeriod, { key: string; icon: IconName }> = {
  morning: { key: 'morning', icon: 'sun' },
  afternoon: { key: 'afternoon', icon: 'sun' },
  evening: { key: 'evening', icon: 'moon' },
};

/** Slots are opened on a rolling 14-day horizon by the backend seeder. */
export const HORIZON_DAYS = 14;
/** Hard ceiling on concurrent bookability probes — one request each, no batch endpoint. */
export const MAX_PROBES = 60;
export const REASON_MAX_LENGTH = 1000;

// ── Which slice of the register the picker offers ──────────────────────────

/**
 * The first step is "choose a facility" and the flow it starts is a BOOKING,
 * so it opens on the facilities that can actually take one.
 *
 * It used to open on the whole directory — 2 728 listings, connected ones
 * first — and then discover, one card at a time, that a listing had no
 * calendar behind it. On the live register EVERY connected listing is a
 * pharmacy, so the booking wizard's first page was pharmacies offered as
 * places to book an appointment. The endpoint now answers the real question
 * directly (`?bookable=1` — linked AND holding an open, future, not-yet-full
 * slot) and its `registry` block carries the honest denominator, so the empty
 * case can state a fact instead of looking like a failed search.
 *
 * The wider slices stay one tap away and are never substituted silently: a
 * connected facility with no published calendar can still be worth a call, and
 * the whole directory is still findable.
 */
export type BookingScope = 'bookable' | 'connected' | 'all';

export const BOOKING_SCOPE_PARAMS: Record<BookingScope, Record<string, number>> = {
  bookable: { bookable: 1 },
  connected: { connected: 1 },
  all: {},
};

/** Register-wide totals, exactly as `GET /mobile/facilities` reports them. */
export type RegistryTotals = {
  directory_total: number;
  connected_total: number;
  bookable_total: number;
  with_providers_total: number;
};

/**
 * One page of the directory. `registry` is optional at the type level so an
 * older API build shows no denominator rather than a wrong one.
 */
export type DirectoryPage = PaginatedFacilities & { registry?: RegistryTotals };

/**
 * The facility picker's list, narrowed to one slice of the register.
 *
 * A local hook rather than a widened `useInfiniteFacilities`: that one is
 * shared with the care map, whose question is "what is near me?" and not "what
 * can I book?". The query key stays distinct for the same reason — sharing it
 * would serve the map a bookable-only directory.
 */
export function useBookingDirectory(params: { q?: string; type?: string; scope: BookingScope }) {
  return useInfiniteQuery({
    queryKey: ['facilities', 'booking-directory', params.q ?? '', params.type ?? '', params.scope],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await apiClient.get<DirectoryPage>(endpoints.facilities, {
          params: {
            ...(params.q ? { q: params.q } : {}),
            ...(params.type ? { type: params.type } : {}),
            ...BOOKING_SCOPE_PARAMS[params.scope],
            page: pageParam,
          },
        })
      ).data,
    getNextPageParam: (last) =>
      last.pagination.current_page < last.pagination.last_page
        ? last.pagination.current_page + 1
        : undefined,
  });
}

// ── formatting ────────────────────────────────────────────────────────────

export function nextDays(count: number): { key: string; date: Date }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    return { date, key: localDateKey(date) };
  });
}

export const localeTagFor = (locale: string) => (locale.startsWith('fr') ? 'fr-FR' : 'en-US');

export function formatDayChip(date: Date, locale: string) {
  const tag = localeTagFor(locale);
  return {
    weekday: date.toLocaleDateString(tag, { weekday: 'short' }),
    day: date.toLocaleDateString(tag, { day: 'numeric' }),
  };
}

export function formatMonth(date: Date, locale: string) {
  return date.toLocaleDateString(localeTagFor(locale), { month: 'long', year: 'numeric' });
}

/** `Tuesday, 01 September 2026, 09:00 AM` — the kit's date + time, one string. */
export function formatFullDateTime(iso: string) {
  return `${formatDateLong(iso)}, ${formatTime(iso)}`;
}

export const openUrl = (url: string) => {
  openExternal(url).catch(() => {});
};

// ── presentational pieces ─────────────────────────────────────────────────

export function useStyles() {
  const { colors } = useTheme();
  return useMemo(() => makeStyles(colors), [colors]);
}

/** Small blue text link with an optional trailing chevron (card footers). */
export function LinkAction({
  label,
  onPress,
  chevron = true,
}: {
  label: string;
  onPress: () => void;
  chevron?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={8}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.linkAction}
    >
      <Text style={styles.linkText}>{label}</Text>
      {chevron && <Icon name="chevron-right" size={16} color={colors.link} />}
    </TouchableOpacity>
  );
}

/** Icon + title (+ optional right-hand action) at the top of a padded card. */
export function CardHead({
  icon,
  title,
  hint,
  action,
  onAction,
}: {
  icon: IconName;
  title: string;
  hint?: string;
  action?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.cardHeadWrap}>
      <View style={styles.cardHead}>
        <Icon name={icon} size={22} color={colors.blue} />
        <Text style={styles.cardTitle} accessibilityRole="header">
          {title}
        </Text>
        {!!action && !!onAction && <LinkAction label={action} onPress={onAction} chevron={false} />}
      </View>
      {!!hint && <Text style={styles.cardHint}>{hint}</Text>}
    </View>
  );
}

/**
 * The honest availability badge. Every state is distinct on purpose — "we have
 * not looked yet" must never read the same as "this place cannot be booked".
 */
export function BookabilityBadge({ bookability }: { bookability: FacilityBookability }) {
  const { t } = useTranslation();

  if (bookability.state === 'unknown' || bookability.state === 'error') return null;

  if (bookability.state === 'checking') {
    return (
      <StatusBadge
        status="checking"
        tone="neutral"
        icon="clock"
        size="sm"
        label={t('appointments.book.badgeChecking')}
      />
    );
  }

  if (bookability.state === 'bookable') {
    return (
      <StatusBadge
        status="bookable"
        tone="normal"
        icon="calendar-check"
        size="sm"
        label={
          bookability.nextSlotAt
            ? t('appointments.book.nextOpening', { when: formatDate(bookability.nextSlotAt) })
            : t('appointments.book.badgeBookable')
        }
      />
    );
  }

  return (
    <StatusBadge
      status={bookability.state}
      tone="neutral"
      icon="x-circle"
      size="sm"
      label={
        bookability.state === 'unlinked'
          ? t('appointments.book.badgeNoOnlineBooking')
          : t('appointments.book.badgeNoOpenings')
      }
    />
  );
}

export function FacilityCard({
  facility,
  bookability,
  typeLabel,
  onPress,
  onViewDetails,
}: {
  facility: CareFacilitySummary;
  bookability: FacilityBookability;
  typeLabel: string;
  onPress: () => void;
  onViewDetails: () => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const bookable = bookability.state === 'bookable';
  return (
    <Card variant="flush" style={styles.listCard}>
      <ListRow
        icon="building"
        tint={bookable ? 'green' : 'blue'}
        title={facility.facility_name}
        meta={[facility.address, facility.city]}
        onPress={onPress}
        accessibilityHint={t('appointments.book.select')}
      />
      <View style={styles.cardFoot}>
        <View style={styles.badgeRow}>
          <StatusBadge status={facility.facility_type} tone="neutral" size="sm" label={typeLabel} />
          <BookabilityBadge bookability={bookability} />
        </View>
        {/* Look before you commit — opens the facility profile (services,
            hours, and the clinicians who practise there) without leaving the
            booking flow's back stack. A sibling of the row, never nested in
            it: a button inside a button is invalid HTML on the web build. */}
        <LinkAction label={t('appointments.book.viewFacility')} onPress={onViewDetails} />
      </View>
    </Card>
  );
}

export function ProviderCard({
  provider,
  onSelect,
  onViewProfile,
}: {
  provider: FacilityProviderSummary;
  onSelect: () => void;
  onViewProfile: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useStyles();
  const licence = provider.licenses[0]?.profession ?? provider.profession;
  return (
    <Card variant="flush" style={styles.listCard}>
      {/* `staff_profiles` carries no photo column, so the avatar is a
          monogram rather than an invented portrait. */}
      <ListRow
        leading={<ProviderAvatar name={provider.name} size={44} />}
        title={provider.name}
        meta={[provider.job_title, provider.department, licence]}
        trailing={
          provider.credentials.length > 0 ? (
            <Icon name="shield-check" size={18} color={colors.statusNormal} />
          ) : undefined
        }
        onPress={onSelect}
        accessibilityHint={t('appointments.book.seeTimes')}
      />
      <View style={styles.cardFoot}>
        <LinkAction label={t('appointments.book.viewDoctorProfile')} onPress={onViewProfile} />
        <Text style={styles.footHint}>{t('appointments.book.seeTimes')}</Text>
      </View>
    </Card>
  );
}

/** A deliberate, actionable dead-end — never a blank list. */
export function EmptyCard({
  icon,
  tint = 'blue',
  title,
  message,
  children,
}: {
  icon: IconName;
  tint?: Tint;
  title: string;
  message?: string;
  children?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <Card variant="flush" style={styles.block}>
      <EmptyState icon={icon} tint={tint} title={title} message={message} />
      {children ? <View style={styles.emptyActions}>{children}</View> : null}
    </Card>
  );
}

/** The chosen facility (and clinician), pinned above the steps that follow. */
export function ChosenFacilityCard({
  facility,
  typeLabel,
  onViewFacility,
  onChangeFacility,
  children,
}: {
  facility: BookingFacility;
  typeLabel: string;
  onViewFacility: () => void;
  onChangeFacility: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  return (
    <Card variant="flush" style={styles.block}>
      <ListRow
        icon="building"
        tint="blue"
        title={facility.facility_name}
        meta={[facility.address, facility.city]}
        chevron={false}
        trailing={
          <LinkAction
            label={t('appointments.book.changeFacility')}
            onPress={onChangeFacility}
            chevron={false}
          />
        }
      />

      {children}

      <View style={styles.cardFoot}>
        <StatusBadge status={facility.facility_type} tone="neutral" size="sm" label={typeLabel} />
        <LinkAction label={t('appointments.book.viewFacility')} onPress={onViewFacility} />
      </View>
    </Card>
  );
}

// ── screen ────────────────────────────────────────────────────────────────

