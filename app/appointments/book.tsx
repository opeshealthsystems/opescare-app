import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ViewToken,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../lib/api/client';
import { endpoints } from '../../lib/api/endpoints';
import { Screen } from '../../components/ui/Screen';
import { FacilityMap } from '@/components/map/FacilityMap';
import {
  Card,
  Chip,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  PillInput,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  StepProgress,
  formatDate,
  formatDateLong,
  formatTime,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
  type TFunction,
  type Tint,
} from '@/components/opes-ui';
import {
  CareButton,
  InfoRow,
  NoticeBanner,
  ProviderAvatar,
  SummaryLine,
  fmtDuration,
} from '@/components/care/shared';
import {
  appointmentReference,
  statusIconOf,
  statusLabelOf,
  statusToneOf,
  typeIconOf,
  typeLabelOf,
} from '@/components/care/apptLabels';
import { useAuthStore } from '../../lib/store/auth';
import {
  useFacilityDetail,
  useFacilityProviders,
  useFacilitySlots,
  useBookAppointment,
  type AppointmentDetail,
  type AppointmentSlotOption,
  type CareFacilitySummary,
  type FacilityProviderSummary,
  type PaginatedFacilities,
} from '../../lib/api/queries';
import {
  bookingErrorKey,
  daysCoveredBySlots,
  firstSlotAfterDay,
  groupSlotsByPeriod,
  localDateKey,
  slotDurationMinutes,
  slotsOnDay,
  useFacilityBookability,
  UNKNOWN_BOOKABILITY,
  type FacilityBookability,
  type SlotPeriod,
} from '../../lib/api/bookingQueries';
import { telUrl, usablePhone } from '../../lib/phone';

/**
 * Book an appointment — facility → clinician → time → confirm.
 *
 * Presentation is the OPES kit (CARE-008 Available Time Slots, CARE-009 Book
 * Appointment Form, CARE-011 Appointment Confirmed) laid over the Finder's own
 * four-step state machine. The data layer and every decision below are
 * unchanged from the flow the patient has verified end-to-end:
 *
 *  1. **Most of the directory cannot be booked.** 903 `care_facilities` rows
 *     are listed; only the ones carrying a linked internal `facilities` id can
 *     hold slots (17 today). `GET /mobile/facilities` neither exposes nor
 *     filters on that link, so the picker probes the slots endpoint for the
 *     cards actually on screen and labels each one. A listing that cannot take
 *     a booking says so — and offers a phone number and directions — rather
 *     than dropping the patient into an empty slot grid.
 *  2. **`GET /facilities/{id}/slots` returns everything from `date` onward**,
 *     capped at 50 — not one day's worth. Rendered raw, tomorrow's 08:00 sits
 *     beside today's 08:00 with nothing to tell them apart. Every slot list
 *     here is filtered to the selected day; the rest of the window is used for
 *     the date strip's availability dots and the "next opening" jump.
 *
 * The id sent to `POST /mobile/appointments` is the **internal** `facilities`
 * id echoed back by the slots response, never the `care_facilities` id the
 * patient browsed — that endpoint validates `exists:facilities,id` and the
 * directory id is a 422.
 */

type Step = 'facility' | 'doctor' | 'slot' | 'confirm' | 'success';

const WIZARD_STEPS: Step[] = ['facility', 'doctor', 'slot', 'confirm'];

/**
 * The facility shape this flow needs. The picker hands over a
 * CareFacilitySummary; a deep link from the facility/doctor screens hydrates
 * from CareFacilityDetail instead, which carries everything except
 * `listing_status` (the detail endpoint only ever returns active listings).
 */
type BookingFacility = Omit<CareFacilitySummary, 'listing_status'>;

/**
 * Filter values are the raw `care_facilities.facility_type` strings and must
 * match the column exactly — a `'lab'`-for-`'laboratory'` slip silently returns
 * zero rows with no error anywhere. Verified against the live table:
 * pharmacy 385 · health_center 263 · laboratory 119 · hospital 98 ·
 * imaging_center 15 · diagnostic_center 11 · clinic 10 · dental 2.
 */
const FACILITY_TYPES = [
  'hospital',
  'clinic',
  'health_center',
  'pharmacy',
  'laboratory',
  'imaging_center',
  'diagnostic_center',
  'dental',
] as const;

type FacilityType = (typeof FACILITY_TYPES)[number];

const FACILITY_TYPE_META: Record<FacilityType, { key: string; icon: IconName }> = {
  hospital: { key: 'filterHospital', icon: 'building' },
  clinic: { key: 'filterClinic', icon: 'stethoscope' },
  health_center: { key: 'filterHealthCenter', icon: 'heart-pulse' },
  pharmacy: { key: 'filterPharmacy', icon: 'pill' },
  laboratory: { key: 'filterLab', icon: 'flask' },
  imaging_center: { key: 'filterImaging', icon: 'image' },
  diagnostic_center: { key: 'filterDiagnostic', icon: 'microscope' },
  dental: { key: 'filterDental', icon: 'smile' },
};

const APPOINTMENT_TYPES: { value: string; key: string }[] = [
  { value: 'consultation', key: 'typeConsultation' },
  { value: 'follow_up', key: 'typeFollowUp' },
  { value: 'check_up', key: 'typeCheckUp' },
  { value: 'vaccination', key: 'typeVaccination' },
  { value: 'lab_test', key: 'typeLabTest' },
  { value: 'other', key: 'typeOther' },
];

const PERIOD_META: Record<SlotPeriod, { key: string; icon: IconName }> = {
  morning: { key: 'morning', icon: 'sun' },
  afternoon: { key: 'afternoon', icon: 'sun' },
  evening: { key: 'evening', icon: 'moon' },
};

/** Slots are opened on a rolling 14-day horizon by the backend seeder. */
const HORIZON_DAYS = 14;
/** Hard ceiling on concurrent bookability probes — one request each, no batch endpoint. */
const MAX_PROBES = 60;
const REASON_MAX_LENGTH = 1000;

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
type BookingScope = 'bookable' | 'connected' | 'all';

const BOOKING_SCOPE_PARAMS: Record<BookingScope, Record<string, number>> = {
  bookable: { bookable: 1 },
  connected: { connected: 1 },
  all: {},
};

/** Register-wide totals, exactly as `GET /mobile/facilities` reports them. */
type RegistryTotals = {
  directory_total: number;
  connected_total: number;
  bookable_total: number;
  with_providers_total: number;
};

/**
 * One page of the directory. `registry` is optional at the type level so an
 * older API build shows no denominator rather than a wrong one.
 */
type DirectoryPage = PaginatedFacilities & { registry?: RegistryTotals };

/**
 * The facility picker's list, narrowed to one slice of the register.
 *
 * A local hook rather than a widened `useInfiniteFacilities`: that one is
 * shared with the care map, whose question is "what is near me?" and not "what
 * can I book?". The query key stays distinct for the same reason — sharing it
 * would serve the map a bookable-only directory.
 */
function useBookingDirectory(params: { q?: string; type?: string; scope: BookingScope }) {
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

function nextDays(count: number): { key: string; date: Date }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    return { date, key: localDateKey(date) };
  });
}

const localeTagFor = (locale: string) => (locale.startsWith('fr') ? 'fr-FR' : 'en-US');

function formatDayChip(date: Date, locale: string) {
  const tag = localeTagFor(locale);
  return {
    weekday: date.toLocaleDateString(tag, { weekday: 'short' }),
    day: date.toLocaleDateString(tag, { day: 'numeric' }),
  };
}

function formatMonth(date: Date, locale: string) {
  return date.toLocaleDateString(localeTagFor(locale), { month: 'long', year: 'numeric' });
}

/** `Tuesday, 01 September 2026, 09:00 AM` — the kit's date + time, one string. */
function formatFullDateTime(iso: string) {
  return `${formatDateLong(iso)}, ${formatTime(iso)}`;
}

const openUrl = (url: string) => {
  Linking.openURL(url).catch(() => {});
};

// ── presentational pieces ─────────────────────────────────────────────────

function useStyles() {
  const { colors } = useTheme();
  return useMemo(() => makeStyles(colors), [colors]);
}

/** Small blue text link with an optional trailing chevron (card footers). */
function LinkAction({
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
function CardHead({
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
function BookabilityBadge({ bookability }: { bookability: FacilityBookability }) {
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

function FacilityCard({
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

function ProviderCard({
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
function EmptyCard({
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
function ChosenFacilityCard({
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

export default function BookAppointmentScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const router = useRouter();
  const queryClient = useQueryClient();
  const patient = useAuthStore((s) => s.patient);
  const { colors } = useTheme();
  const styles = useStyles();
  const dialog = useDialog();
  // The care helpers take the kit's narrow `t` contract; react-i18next's `t`
  // satisfies it, this just pins the return to `string` for TypeScript.
  const tt: TFunction = useCallback(
    (key: string, params?: Record<string, string | number>) => String(t(key, params)),
    [t],
  );

  // Deep-link entry: the facility and doctor screens push straight into this
  // flow with the facility (and optionally the clinician) already decided, so
  // the patient does not re-pick what they just tapped.
  const params = useLocalSearchParams<{ facilityId?: string; providerId?: string }>();
  const linkedFacilityId = typeof params.facilityId === 'string' ? params.facilityId : undefined;
  const linkedProviderId = typeof params.providerId === 'string' ? params.providerId : undefined;

  const [step, setStep] = useState<Step>('facility');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<FacilityType | ''>('');
  // Opens on the facilities that can actually take a booking. See BookingScope.
  const [scope, setScope] = useState<BookingScope>('bookable');
  const [selectedFacility, setSelectedFacility] = useState<BookingFacility | null>(null);

  // The clinician filter is held as an id, not an object: a deep link knows the
  // id before the provider list has loaded, and slot filtering must not wait.
  // `null` means "any available clinician" — the pre-existing behaviour.
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    linkedProviderId ?? null,
  );
  const [hydratedFromLink, setHydratedFromLink] = useState(!linkedFacilityId);

  const days = useMemo(() => nextDays(HORIZON_DAYS), []);
  const [selectedDate, setSelectedDate] = useState(days[0].key);
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlotOption | null>(null);

  const [appointmentType, setAppointmentType] = useState(APPOINTMENT_TYPES[0].value);
  const [reason, setReason] = useState('');
  const [bookedAppointment, setBookedAppointment] = useState<AppointmentDetail | null>(null);

  const facilitiesQuery = useBookingDirectory({
    q: appliedSearch || undefined,
    type: typeFilter || undefined,
    scope,
  });
  const facilities = useMemo<CareFacilitySummary[]>(
    () => (facilitiesQuery.data?.pages ?? []).flatMap((page) => page.data),
    [facilitiesQuery.data],
  );
  const totalFacilities = facilitiesQuery.data?.pages[0]?.pagination.total ?? 0;
  /** The honest denominator, straight from the response. Never computed here. */
  const registry = facilitiesQuery.data?.pages[0]?.registry;

  // Bookability is probed only for cards that have actually been on screen —
  // one request each, and there is no batch endpoint to do better.
  const [probeIds, setProbeIds] = useState<string[]>([]);
  const probeIdsRef = useRef<Set<string>>(new Set());
  // A new search, type filter or register slice is a new result set; keeping
  // the old ids would burn the probe budget on facilities no longer listed.
  useEffect(() => {
    probeIdsRef.current = new Set();
    setProbeIds([]);
  }, [appliedSearch, typeFilter, scope]);
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const additions = viewableItems
      .map((token) => (token.item as CareFacilitySummary | undefined)?.id)
      .filter((id): id is string => !!id && !probeIdsRef.current.has(id));
    if (additions.length === 0 || probeIdsRef.current.size >= MAX_PROBES) return;
    additions.forEach((id) => probeIdsRef.current.add(id));
    setProbeIds(Array.from(probeIdsRef.current).slice(0, MAX_PROBES));
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 }).current;

  const bookabilityByFacility = useFacilityBookability(probeIds, days[0].key);

  const linkedFacilityQuery = useFacilityDetail(hydratedFromLink ? undefined : linkedFacilityId);
  const providersQuery = useFacilityProviders(selectedFacility?.id);
  const slotsQuery = useFacilitySlots(selectedFacility?.id, selectedDate);
  const bookMutation = useBookAppointment();

  // Resolve a deep link once: adopt the facility, then land on the clinician
  // step (or skip straight to slots when the clinician came with the link).
  useEffect(() => {
    if (hydratedFromLink || !linkedFacilityId) return;
    const facility = linkedFacilityQuery.data;
    if (!facility) return;
    setSelectedFacility(facility);
    setStep(linkedProviderId ? 'slot' : 'doctor');
    setHydratedFromLink(true);
  }, [hydratedFromLink, linkedFacilityId, linkedProviderId, linkedFacilityQuery.data]);

  const providers = providersQuery.data?.data ?? [];
  const selectedProvider: FacilityProviderSummary | null =
    providers.find((p) => p.id === selectedProviderId) ?? null;

  /**
   * A directory listing with no linked internal facility can never produce a
   * slot. Both the providers and the slots endpoints report it the same way
   * (`facility_id: null`), and the picker's probe knows it earlier still.
   */
  const probedBookability = selectedFacility
    ? (bookabilityByFacility.get(selectedFacility.id) ?? UNKNOWN_BOOKABILITY)
    : UNKNOWN_BOOKABILITY;
  const facilityIsUnlinked =
    providersQuery.data?.facility_id === null ||
    slotsQuery.data?.facility_id === null ||
    (!providersQuery.data && !slotsQuery.data && probedBookability.state === 'unlinked');

  // Slots come back for the whole window from `selectedDate` onward, capped at
  // 50 — so the grid must be narrowed to the chosen day, and the remainder is
  // exactly what powers the strip's dots and the "next opening" shortcut.
  const slotWindow = slotsQuery.data?.data ?? [];
  const windowForProvider = useMemo(
    () =>
      selectedProviderId
        ? slotWindow.filter((slot) => slot.provider_id === selectedProviderId)
        : slotWindow,
    [slotWindow, selectedProviderId],
  );
  const daySlots = useMemo(
    () => slotsOnDay(windowForProvider, selectedDate),
    [windowForProvider, selectedDate],
  );
  const slotGroups = useMemo(() => groupSlotsByPeriod(daySlots), [daySlots]);
  const daysWithSlots = useMemo(() => daysCoveredBySlots(windowForProvider), [windowForProvider]);
  const nextSlotAhead = useMemo(
    () => firstSlotAfterDay(windowForProvider, selectedDate),
    [windowForProvider, selectedDate],
  );
  const facilityHasSlotsOnDay = slotsOnDay(slotWindow, selectedDate).length > 0;

  // Not `?? null`: the register stores the literal string "N/A" where a
  // facility publishes no number, and that read as "there is a phone" — so the
  // "call the facility instead" fallback, offered exactly when booking is
  // impossible, handed the patient a button that dialled nothing.
  const facilityPhone = usablePhone(selectedFacility?.phone_primary);

  const facilityTypeLabel = useCallback(
    (value: string | null | undefined) => {
      const meta = value ? FACILITY_TYPE_META[value as FacilityType] : undefined;
      return meta ? t(`appointments.book.${meta.key}`) : (value ?? '—');
    },
    [t],
  );

  const appointmentTypeLabel = useCallback(
    (value: string | null | undefined) => typeLabelOf(tt, value),
    [tt],
  );

  const goBack = () => {
    if (step === 'facility') router.back();
    else if (step === 'doctor') {
      // A deep link skipped the picker entirely; there is no picker to go back
      // to, so honour the real back stack instead of stranding the patient.
      if (linkedFacilityId) router.back();
      else setStep('facility');
    } else if (step === 'slot') {
      setSelectedSlot(null);
      if (linkedProviderId) router.back();
      else setStep('doctor');
    } else if (step === 'confirm') setStep('slot');
  };

  const handleSelectFacility = (facility: BookingFacility) => {
    setSelectedFacility(facility);
    setSelectedSlot(null);
    setSelectedProviderId(null);
    setSelectedDate(days[0].key);
    setStep('doctor');
  };

  const handleChangeFacility = () => {
    if (linkedFacilityId) {
      // Entered via deep link — the picker was never on the stack.
      router.back();
      return;
    }
    setSelectedSlot(null);
    setSelectedProviderId(null);
    setStep('facility');
  };

  /** `providerId === null` is the "any available clinician" path — no filtering. */
  const handleSelectProvider = (providerId: string | null) => {
    setSelectedProviderId(providerId);
    setSelectedSlot(null);
    setStep('slot');
  };

  const handleConfirmBooking = () => {
    // `slotsQuery.data.facility_id` is the INTERNAL `facilities` id the slots
    // endpoint echoes back. POST /mobile/appointments validates
    // `exists:facilities,id`; posting the `care_facilities` id the patient
    // browsed is a 422 every time.
    const internalFacilityId = slotsQuery.data?.facility_id;
    if (!selectedFacility || !selectedSlot || !internalFacilityId) return;
    bookMutation.mutate(
      {
        facility_id: internalFacilityId,
        appointment_slot_id: selectedSlot.id,
        appointment_type: appointmentType,
        reason: reason.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          // The slot we just took now has one less place on it. useBookAppointment
          // only invalidates ['appointments'], so drop this facility's cached
          // slot windows too — otherwise a second booking in the same session
          // would be offered a place that no longer exists.
          queryClient.invalidateQueries({
            queryKey: ['facilities', selectedFacility.id, 'slots'],
          });
          setBookedAppointment(data);
          setStep('success');
        },
      },
    );
  };

  /** The 409 path: the slot went while the patient was reviewing. */
  const handlePickAnotherTime = () => {
    setSelectedSlot(null);
    bookMutation.reset();
    slotsQuery.refetch();
    setStep('slot');
  };

  // A failed booking is surfaced in the kit's bottom sheet — `Alert.alert` is
  // a no-op on react-native-web — and mirrored inline under the review card
  // so the reason is still on screen once the sheet is dismissed. Keyed on the
  // error object, which only changes when a new attempt fails.
  const bookingError = bookMutation.isError ? bookMutation.error : null;
  const showDialog = dialog.show;
  useEffect(() => {
    if (!bookingError) return;
    const key = bookingErrorKey(bookingError);
    const slotTaken = key === 'bookErrorSlotTaken';
    const outcomeUnknown =
      key === 'bookErrorNetwork' || key === 'bookErrorServer' || key === 'bookErrorUnknown';
    showDialog({
      title: t(`appointments.book.${key}`),
      message: slotTaken
        ? t('opesCare.review.conflictMessage')
        : outcomeUnknown
          ? t('opesCare.review.checkHint')
          : undefined,
      tone: 'critical',
      actions: slotTaken
        ? [{ label: t('appointments.book.pickAnotherTime'), onPress: handlePickAnotherTime }]
        : [],
    });
    // `handlePickAnotherTime` closes over mutation/query objects that change
    // identity every render; re-running on those would re-open the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingError, showDialog, t]);

  const handleCallFacility = () => {
    const url = telUrl(facilityPhone);
    if (url) openUrl(url);
  };

  const handleShareAppointment = async () => {
    if (!bookedAppointment) return;
    try {
      await Share.share({
        message: t('appointments.book.shareMessage', {
          type: appointmentTypeLabel(bookedAppointment.appointment_type),
          facility: bookedAppointment.facility_name ?? selectedFacility?.facility_name ?? '',
          datetime: bookedAppointment.scheduled_at
            ? formatFullDateTime(bookedAppointment.scheduled_at)
            : '',
          id: appointmentReference(bookedAppointment.id),
        }),
      });
    } catch {
      // Share sheet dismissed/cancelled — nothing to surface.
    }
  };

  const progressSteps = useMemo(
    () => [
      { key: 'facility', label: t('appointments.book.railFacility') },
      { key: 'doctor', label: t('appointments.book.railDoctor') },
      { key: 'slot', label: t('appointments.book.railSlot') },
      { key: 'confirm', label: t('appointments.book.railConfirm') },
    ],
    [t],
  );
  const stepIndex = WIZARD_STEPS.indexOf(step);
  const stepTitle =
    step === 'facility'
      ? t('appointments.book.stepFacility')
      : step === 'doctor'
        ? t('appointments.book.stepDoctor')
        : step === 'slot'
          ? t('appointments.book.stepSlot')
          : t('appointments.book.stepConfirm');
  const stepOf = t('appointments.book.stepOf', {
    current: stepIndex + 1,
    total: WIZARD_STEPS.length,
  });

  const bookedDuration = selectedSlot != null ? slotDurationMinutes(selectedSlot) : null;
  const bookingErrorKeyNow = bookingError ? bookingErrorKey(bookingError) : null;

  const facilityAddress = (facility: BookingFacility) =>
    [facility.address, facility.city].filter(Boolean).join(', ');

  return (
    <Screen className="px-0">
      {step !== 'success' ? (
        <>
          <ScreenHeader title={stepTitle} subtitle={stepOf} onBack={goBack} />
          <View style={styles.progress}>
            <StepProgress
              steps={progressSteps}
              currentIndex={stepIndex}
              accessibilityLabel={`${stepOf}: ${stepTitle}`}
            />
          </View>
        </>
      ) : null}

      {/* ── Deep link in flight ──────────────────────────────────────────
          Resolving the facility already chosen on the previous screen.
          Showing the picker here would flicker back to a decision the
          patient has already made. */}
      {step === 'facility' && !hydratedFromLink ? (
        <View style={styles.centre}>
          {linkedFacilityQuery.isError ? (
            <EmptyCard
              icon="alert-circle"
              tint="red"
              title={t('appointments.book.loadFacilityErrorTitle')}
              message={t('appointments.book.loadFacilityErrorBody')}
            >
              <CareButton
                label={t('appointments.book.chooseAnother')}
                icon="building"
                variant="secondary"
                onPress={() => setHydratedFromLink(true)}
              />
            </EmptyCard>
          ) : (
            <View
              style={styles.loading}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={t('appointments.book.openingFacility')}
              accessibilityLiveRegion="polite"
            >
              <ActivityIndicator color={colors.blue} />
              <Text style={styles.loadingText}>{t('appointments.book.openingFacility')}</Text>
            </View>
          )}
        </View>
      ) : null}

      {/* ── Step 1 · Facility ─────────────────────────────────────────── */}
      {step === 'facility' && hydratedFromLink ? (
        <View style={styles.fill}>
          <View style={styles.gutter}>
            <PillInput
              icon={<Icon name="search" size={18} color={colors.blue} />}
              placeholder={t('appointments.book.searchPlaceholder')}
              value={searchInput}
              onChangeText={setSearchInput}
              onSubmitEditing={() => setAppliedSearch(searchInput.trim())}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel={t('appointments.book.searchPlaceholder')}
            />

            {/* WHAT a facility can do, before WHAT KIND it is: a pharmacy that
                holds an open slot is a better answer to "book an appointment"
                than a hospital that holds none. Counts are the server's own. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipStrip}
              contentContainerStyle={styles.chipStripContent}
            >
              <Chip
                icon="calendar-check"
                label={t('discovery.scope.bookable', { defaultValue: 'Bookable' })}
                count={registry?.bookable_total}
                selected={scope === 'bookable'}
                onPress={() => setScope('bookable')}
                accessibilityHint={t('discovery.scope.bookableHint', {
                  defaultValue: 'Show only facilities with an appointment slot open right now',
                })}
              />
              <Chip
                icon="shield-check"
                label={t('facilityRegistry.connectedOnly', { defaultValue: 'Connected' })}
                count={registry?.connected_total}
                selected={scope === 'connected'}
                onPress={() => setScope('connected')}
                accessibilityHint={t('facilityRegistry.connectedOnlyHint', {
                  defaultValue:
                    'Show only facilities that can publish clinicians and take bookings',
                })}
              />
              <Chip
                icon="grid"
                label={t('facilityRegistry.allListings', { defaultValue: 'All listings' })}
                count={registry?.directory_total}
                selected={scope === 'all'}
                onPress={() => setScope('all')}
                accessibilityHint={t('facilityRegistry.allListingsHint', {
                  defaultValue: 'Show every facility in the public directory, connected or not',
                })}
              />
            </ScrollView>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              // A horizontal ScrollView in a column flex parent will happily grow
              // to eat the rest of the screen; pin it to its content height.
              style={styles.chipStrip}
              contentContainerStyle={styles.chipStripContent}
            >
              <Chip
                label={t('appointments.book.filterAll')}
                selected={typeFilter === ''}
                onPress={() => setTypeFilter('')}
              />
              {FACILITY_TYPES.map((value) => (
                <Chip
                  key={value}
                  label={t(`appointments.book.${FACILITY_TYPE_META[value].key}`)}
                  icon={FACILITY_TYPE_META[value].icon}
                  selected={typeFilter === value}
                  onPress={() => setTypeFilter(value)}
                />
              ))}
            </ScrollView>

            {/* Only a fraction of the directory is connected to scheduling; say
                so once, plainly, with the register's own numbers, instead of
                letting the patient discover it one dead end at a time. */}
            <View style={styles.block}>
              <NoticeBanner
                icon="info"
                tone={scope === 'bookable' && (registry?.bookable_total ?? 0) > 0 ? 'normal' : 'pending'}
                message={
                  registry
                    ? scope === 'bookable'
                      ? t('discovery.explainer.bookable', {
                          bookable: registry.bookable_total,
                          connected: registry.connected_total,
                          total: registry.directory_total,
                          defaultValue:
                            '{{bookable}} of {{total}} listed facilities have an appointment slot open right now. {{connected}} are connected to OpesCare; the rest of the directory can still be found and called.',
                        })
                      : scope === 'connected'
                        ? t('facilityRegistry.connectedExplainer', {
                            connected: registry.connected_total,
                            total: registry.directory_total,
                            defaultValue:
                              '{{connected}} of {{total}} listed facilities are connected to OpesCare. Only these can publish clinicians or take an online booking — the rest can still be found and called.',
                          })
                        : t('facilityRegistry.allExplainer', {
                            connected: registry.connected_total,
                            total: registry.directory_total,
                            defaultValue:
                              'Showing all {{total}} listed facilities. Only {{connected}} are connected to OpesCare; the others can be found and called, but publish no clinicians.',
                          })
                    : t('appointments.book.bookabilityNote')
                }
              />
            </View>
          </View>

          {facilitiesQuery.isPending ? (
            <View style={styles.centre}>
              <ActivityIndicator color={colors.blue} />
            </View>
          ) : facilitiesQuery.isError ? (
            <View style={styles.gutter}>
              <EmptyCard
                icon="alert-circle"
                tint="red"
                title={t('appointments.book.loadFacilitiesError')}
                message={t('appointments.book.loadFacilitiesErrorBody')}
              >
                <CareButton
                  label={t('appointments.book.retry')}
                  icon="refresh"
                  variant="secondary"
                  onPress={() => facilitiesQuery.refetch()}
                />
              </EmptyCard>
            </View>
          ) : (
            <FlatList
              data={facilities}
              keyExtractor={(item) => item.id}
              extraData={bookabilityByFacility}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              onEndReachedThreshold={0.4}
              onEndReached={() => {
                if (facilitiesQuery.hasNextPage && !facilitiesQuery.isFetchingNextPage) {
                  facilitiesQuery.fetchNextPage();
                }
              }}
              ListHeaderComponent={
                facilities.length > 0 ? (
                  <SectionHeader
                    variant="overline"
                    title={t('appointments.book.facilityCount', {
                      shown: facilities.length,
                      total: totalFacilities,
                    })}
                    actionLabel={appliedSearch ? t('appointments.book.clearSearch') : undefined}
                    onAction={
                      appliedSearch
                        ? () => {
                            setSearchInput('');
                            setAppliedSearch('');
                          }
                        : undefined
                    }
                  />
                ) : null
              }
              renderItem={({ item }) => (
                <FacilityCard
                  facility={item}
                  bookability={bookabilityByFacility.get(item.id) ?? UNKNOWN_BOOKABILITY}
                  typeLabel={facilityTypeLabel(item.facility_type)}
                  onPress={() => handleSelectFacility(item)}
                  onViewDetails={() => router.push(`/facility/${item.id}`)}
                />
              )}
              ListFooterComponent={
                facilitiesQuery.isFetchingNextPage ? (
                  <View style={styles.footerSpinner}>
                    <ActivityIndicator color={colors.blue} />
                  </View>
                ) : facilitiesQuery.hasNextPage ? (
                  <CareButton
                    label={t('appointments.book.loadMore')}
                    variant="secondary"
                    onPress={() => facilitiesQuery.fetchNextPage()}
                  />
                ) : null
              }
              ListEmptyComponent={
                /* An empty BOOKABLE list is almost never an empty directory —
                   it is the register saying nobody has opened a calendar. Say
                   that, and offer the wider slice as a deliberate choice; the
                   old copy read as a failed search and sent the patient back
                   to the search box that was never the problem. */
                scope === 'bookable' ? (
                  <EmptyCard
                    icon="calendar"
                    tint="amber"
                    title={t('discovery.empty.bookableTitle', {
                      defaultValue: 'No open appointment slots right now',
                    })}
                    message={
                      appliedSearch || typeFilter
                        ? t('discovery.empty.bookableFilteredBody', {
                            defaultValue:
                              'No facility matching those filters has an appointment slot open. Widen to the connected facilities — you can call them to arrange a visit — or clear the filters.',
                          })
                        : t('discovery.empty.bookableBody', {
                            connected: registry?.connected_total ?? 0,
                            defaultValue:
                              'No facility on OpesCare has an appointment slot open at the moment, so there is nothing to book online yet. {{connected}} facilities are connected and can be called directly.',
                          })
                    }
                  >
                    <CareButton
                      label={t('facilityRegistry.connectedOnly', { defaultValue: 'Connected' })}
                      icon="shield-check"
                      variant="secondary"
                      onPress={() => setScope('connected')}
                    />
                  </EmptyCard>
                ) : (
                  <EmptyCard
                    icon="search"
                    title={t('appointments.book.searchEmptyTitle')}
                    message={
                      scope === 'connected'
                        ? t('facilityRegistry.noConnectedMatch', {
                            defaultValue:
                              'No connected facility matches that search. The place you are looking for may still be in the public directory — show all listings to find and call it.',
                          })
                        : t('appointments.book.searchEmptyBody')
                    }
                  >
                    {scope === 'connected' ? (
                      <CareButton
                        label={t('facilityRegistry.allListings', { defaultValue: 'All listings' })}
                        icon="grid"
                        variant="secondary"
                        onPress={() => setScope('all')}
                      />
                    ) : appliedSearch || typeFilter ? (
                      <CareButton
                        label={t('appointments.book.clearFilters')}
                        icon="close"
                        variant="secondary"
                        onPress={() => {
                          setSearchInput('');
                          setAppliedSearch('');
                          setTypeFilter('');
                        }}
                      />
                    ) : null}
                  </EmptyCard>
                )
              }
            />
          )}
        </View>
      ) : null}

      {/* ── Step 2 · Clinician ────────────────────────────────────────────
          Optional and always skippable. Picking "any available clinician"
          leaves selectedProviderId null and the slot list unfiltered. */}
      {step === 'doctor' && selectedFacility ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <ChosenFacilityCard
            facility={selectedFacility}
            typeLabel={facilityTypeLabel(selectedFacility.facility_type)}
            onViewFacility={() => router.push(`/facility/${selectedFacility.id}`)}
            onChangeFacility={handleChangeFacility}
          />

          {/* Embedded map — a real in-app OpenStreetMap view of the chosen
              facility with a locate-me/directions control that never leaves the
              app. */}
          {selectedFacility.latitude != null && selectedFacility.longitude != null ? (
            <View style={styles.block}>
              <FacilityMap facilities={selectedFacility} height={180} directions />
            </View>
          ) : null}

          {providersQuery.isPending ? (
            <View style={styles.centre}>
              <ActivityIndicator color={colors.blue} />
            </View>
          ) : facilityIsUnlinked ? (
            /* The directory listing has no linked operational facility, so it
               can never hold a slot. Say that, and give the patient the two
               things that still work. */
            <EmptyCard
              icon="calendar"
              tint="amber"
              title={t('appointments.book.unavailableTitle')}
              message={t('appointments.book.unavailableBody', {
                name: selectedFacility.facility_name,
              })}
            >
              {facilityPhone ? (
                <CareButton
                  label={t('appointments.book.callFacility')}
                  icon="phone"
                  variant="secondary"
                  onPress={handleCallFacility}
                />
              ) : null}
              <GradientButton
                label={t('appointments.book.chooseAnother')}
                icon="none"
                onPress={handleChangeFacility}
              />
            </EmptyCard>
          ) : (
            <>
              <View style={styles.sectionIntro}>
                <SectionHeader title={t('appointments.book.chooseDoctorPrompt')} />
                <Text style={styles.sectionHint}>{t('appointments.book.doctorStepSubtitle')}</Text>
              </View>

              {/* "Any available clinician" is always offered, even when the
                  roster is empty or failed to load — the flow must never
                  dead-end on a clinician list. */}
              <Card variant="flush" style={styles.listCard}>
                <ListRow
                  icon="users"
                  tint="purple"
                  title={t('appointments.book.anyDoctor')}
                  subtitle={t('appointments.book.anyDoctorHint')}
                  onPress={() => handleSelectProvider(null)}
                  accessibilityHint={t('appointments.book.seeTimes')}
                />
              </Card>

              {providersQuery.isError ? (
                <EmptyCard
                  icon="alert-circle"
                  tint="red"
                  title={t('appointments.book.loadDoctorsError')}
                  message={t('appointments.book.loadDoctorsErrorBody')}
                >
                  <CareButton
                    label={t('appointments.book.retry')}
                    icon="refresh"
                    variant="secondary"
                    onPress={() => providersQuery.refetch()}
                  />
                </EmptyCard>
              ) : providers.length === 0 ? (
                /* No published roster — the "any available clinician" card
                   directly above already IS the way forward, so this explains
                   the gap rather than repeating the same button under it. The
                   slot still carries a clinician; they are simply not listed
                   in the public directory yet. */
                <NoticeBanner
                  icon="stethoscope"
                  tone="pending"
                  title={t('appointments.book.noDoctors')}
                  message={t('appointments.book.noDoctorsBody')}
                />
              ) : (
                <>
                  <SectionHeader
                    variant="overline"
                    title={t('appointments.book.cliniciansHeading', { count: providers.length })}
                    style={styles.overline}
                  />
                  {providers.map((provider) => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      onSelect={() => handleSelectProvider(provider.id)}
                      onViewProfile={() => router.push(`/doctor/${provider.id}`)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      ) : null}

      {/* ── Step 3 · Date & time ──────────────────────────────────────── */}
      {step === 'slot' && selectedFacility ? (
        <View style={styles.fill}>
          <ScrollView
            style={styles.fill}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <ChosenFacilityCard
              facility={selectedFacility}
              typeLabel={facilityTypeLabel(selectedFacility.facility_type)}
              onViewFacility={() => router.push(`/facility/${selectedFacility.id}`)}
              onChangeFacility={handleChangeFacility}
            >
              <View style={styles.cardLine}>
                <Icon name="stethoscope" size={16} color={colors.blue} />
                <Text style={styles.cardLineText} numberOfLines={1}>
                  {selectedProviderId
                    ? t('appointments.book.withDoctor', {
                        name: selectedProvider?.name ?? '…',
                      })
                    : t('appointments.book.anyDoctor')}
                </Text>
                <LinkAction
                  label={t('appointments.book.changeDoctor')}
                  onPress={() => setStep('doctor')}
                  chevron={false}
                />
              </View>
            </ChosenFacilityCard>

            <View style={styles.rowBetween}>
              <SectionHeader title={t('opesCare.slots.selectDate')} style={styles.rowHeader} />
              <Text style={styles.monthLabel}>
                {formatMonth(new Date(`${selectedDate}T12:00:00`), locale)}
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipStrip}
              contentContainerStyle={styles.dayStrip}
            >
              {days.map(({ date, key }, index) => {
                const { weekday, day } = formatDayChip(date, locale);
                const active = selectedDate === key;
                // A dot means "we have seen open slots on this day" — only the
                // window we actually fetched can say that, so absence of a dot
                // is silence, not a claim that the day is full.
                const known = daysWithSlots.has(key);
                const weekdayLabel = index === 0 ? t('appointments.book.today') : weekday;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => {
                      setSelectedDate(key);
                      setSelectedSlot(null);
                    }}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={formatDateLong(date)}
                    style={[styles.dayChip, active ? styles.dayChipOn : styles.dayChipOff]}
                  >
                    <Text style={[styles.dayWeek, active && styles.dayTextOn]}>{weekdayLabel}</Text>
                    <Text style={[styles.dayDate, active && styles.dayTextOn]}>{day}</Text>
                    <View
                      style={[
                        styles.dayDot,
                        known && (active ? styles.dayDotOnActive : styles.dayDotOn),
                      ]}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <NoticeBanner icon="info" tone="pending" message={t('opesCare.slots.timezoneNote')} />

            <SectionHeader title={t('appointments.book.chooseSlotPrompt')} style={styles.slotsHeader} />

            {slotsQuery.isPending ? (
              <View style={styles.centre}>
                <ActivityIndicator color={colors.blue} />
              </View>
            ) : slotsQuery.isError ? (
              <EmptyCard
                icon="alert-circle"
                tint="red"
                title={t('appointments.book.loadSlotsError')}
                message={t('appointments.book.loadSlotsErrorBody')}
              >
                <CareButton
                  label={t('appointments.book.retry')}
                  icon="refresh"
                  variant="secondary"
                  onPress={() => slotsQuery.refetch()}
                />
              </EmptyCard>
            ) : facilityIsUnlinked ? (
              <EmptyCard
                icon="calendar"
                tint="amber"
                title={t('appointments.book.unavailableTitle')}
                message={t('appointments.book.unavailableBody', {
                  name: selectedFacility.facility_name,
                })}
              >
                {facilityPhone ? (
                  <CareButton
                    label={t('appointments.book.callFacility')}
                    icon="phone"
                    variant="secondary"
                    onPress={handleCallFacility}
                  />
                ) : null}
                <GradientButton
                  label={t('appointments.book.chooseAnother')}
                  icon="none"
                  onPress={handleChangeFacility}
                />
              </EmptyCard>
            ) : daySlots.length === 0 ? (
              <EmptyCard
                icon="clock"
                tint="amber"
                title={
                  selectedProviderId && facilityHasSlotsOnDay
                    ? t('appointments.book.noSlotsForDoctorTitle')
                    : slotWindow.length === 0
                      ? t('appointments.book.noSlotsAheadTitle')
                      : t('appointments.book.noSlotsTitle')
                }
                message={
                  selectedProviderId && facilityHasSlotsOnDay
                    ? t('appointments.book.noSlotsForDoctorBody')
                    : slotWindow.length === 0
                      ? t('appointments.book.noSlotsAheadBody')
                      : t('appointments.book.noSlotsBody')
                }
              >
                {nextSlotAhead ? (
                  <CareButton
                    label={t('appointments.book.jumpToNext', {
                      when: formatDate(nextSlotAhead.starts_at),
                    })}
                    icon="calendar-check"
                    variant="secondary"
                    onPress={() => {
                      setSelectedDate(localDateKey(nextSlotAhead.starts_at));
                      setSelectedSlot(null);
                    }}
                  />
                ) : null}
                {selectedProviderId && facilityHasSlotsOnDay ? (
                  <CareButton
                    label={t('appointments.book.chooseAnyDoctor')}
                    icon="users"
                    variant="secondary"
                    onPress={() => {
                      setSelectedProviderId(null);
                      setSelectedSlot(null);
                    }}
                  />
                ) : null}
                {selectedDate !== days[0].key ? (
                  <CareButton
                    label={t('appointments.book.backToToday')}
                    icon="calendar"
                    variant="secondary"
                    onPress={() => {
                      setSelectedDate(days[0].key);
                      setSelectedSlot(null);
                    }}
                  />
                ) : null}
              </EmptyCard>
            ) : (
              <View style={styles.buckets}>
                {slotGroups.map((group) => (
                  <View key={group.period}>
                    <View style={styles.bucketHead}>
                      <Icon
                        name={PERIOD_META[group.period].icon}
                        size={18}
                        color={colors.statusWarning}
                      />
                      <Text style={styles.bucketLabel}>
                        {t(`opesCare.slots.${PERIOD_META[group.period].key}`)}
                      </Text>
                      <View style={styles.bucketRule} />
                      <Text style={styles.bucketCount}>
                        {t('appointments.book.slotsOpen', { count: group.slots.length })}
                      </Text>
                    </View>
                    <View style={styles.slotGrid}>
                      {group.slots.map((slot) => {
                        const active = selectedSlot?.id === slot.id;
                        const scarce = slot.available_count <= 1;
                        const start = formatTime(slot.starts_at);
                        const end = formatTime(slot.ends_at);
                        // Seeded capacity is 3, so "3 places left" on every
                        // chip would be pure noise. Show the plain start time
                        // by default and add the remaining-places warning only
                        // when it is genuinely running out.
                        return (
                          <Chip
                            key={slot.id}
                            label={
                              scarce
                                ? `${start} · ${t('appointments.book.spotsLeft', {
                                    count: slot.available_count,
                                  })}`
                                : start
                            }
                            icon={scarce ? 'alert-circle' : undefined}
                            selected={active}
                            onPress={() => setSelectedSlot(slot)}
                            accessibilityLabel={`${start} – ${end}`}
                            accessibilityHint={
                              scarce
                                ? t('appointments.book.spotsLeft', { count: slot.available_count })
                                : undefined
                            }
                            style={styles.slotChip}
                          />
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {daySlots.length > 0 ? (
            <View style={styles.stickyFooter}>
              <Card style={styles.footerCard}>
                <View style={styles.footerRow}>
                  <View style={styles.footerIcon}>
                    <Icon name="calendar-check" size={24} color={colors.blue} />
                  </View>
                  <View style={styles.footerBody}>
                    <Text style={styles.footerTitle} numberOfLines={1}>
                      {t('opesCare.slots.selectedDate', {
                        date: formatDateLong(`${selectedDate}T12:00:00`),
                      })}
                    </Text>
                    <Text style={styles.footerText} numberOfLines={1}>
                      {selectedSlot
                        ? t('opesCare.slots.selectedSlot', {
                            time: formatTime(selectedSlot.starts_at),
                            minutes: slotDurationMinutes(selectedSlot) ?? '—',
                          })
                        : t('opesCare.slots.selectPrompt')}
                    </Text>
                  </View>
                </View>
              </Card>
              <GradientButton
                label={t('opesCare.slots.continue')}
                onPress={() => setStep('confirm')}
                disabled={!selectedSlot}
                accessibilityHint={t('appointments.book.stepConfirm')}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── Step 4 · Confirm ──────────────────────────────────────────── */}
      {step === 'confirm' && selectedFacility && selectedSlot ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.almost}>
            <View style={styles.almostIcon}>
              <Icon name="check" size={20} color={colors.textOnBrand} />
            </View>
            <View style={styles.almostBody}>
              <Text style={styles.almostTitle}>{t('opesCare.review.almostTitle')}</Text>
              <Text style={styles.almostText}>{t('opesCare.review.almostText')}</Text>
            </View>
          </View>

          <Card>
            <CardHead
              icon="clipboard"
              title={t('appointments.book.typeLabel')}
              hint={t('appointments.book.typeHint')}
            />
            <View style={styles.typeChips}>
              {APPOINTMENT_TYPES.map((type) => (
                <Chip
                  key={type.value}
                  label={t(`appointments.book.${type.key}`)}
                  icon={typeIconOf(type.value)}
                  selected={appointmentType === type.value}
                  onPress={() => setAppointmentType(type.value)}
                />
              ))}
            </View>
          </Card>

          {/* Reason is a free-text note the facility reads before the visit;
              the API accepts up to 1000 characters, so give it real room and
              show the budget rather than truncating silently. */}
          <Card>
            <CardHead
              icon="edit"
              title={t('appointments.book.reasonLabel')}
              hint={t('appointments.book.reasonHint')}
            />
            <TextInput
              style={styles.textarea}
              placeholder={t('appointments.book.reasonPlaceholder')}
              placeholderTextColor={colors.textMuted}
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={REASON_MAX_LENGTH}
              textAlignVertical="top"
              accessibilityLabel={t('appointments.book.reasonLabel')}
            />
            <Text style={styles.counter}>
              {t('appointments.book.reasonCounter', {
                used: reason.length,
                max: REASON_MAX_LENGTH,
              })}
            </Text>
          </Card>

          <View>
            <SectionHeader title={t('appointments.book.reviewTitle')} />
            <Card variant="flush">
              <View style={styles.rows}>
                <InfoRow
                  icon="building"
                  label={t('appointments.book.reviewFacility')}
                  value={
                    facilityAddress(selectedFacility)
                      ? `${selectedFacility.facility_name} · ${facilityAddress(selectedFacility)}`
                      : selectedFacility.facility_name
                  }
                  divider
                />
                <InfoRow
                  icon="stethoscope"
                  tint="purple"
                  label={t('appointments.book.reviewDoctor')}
                  value={
                    selectedProviderId
                      ? [selectedProvider?.name ?? '—', selectedProvider?.job_title]
                          .filter(Boolean)
                          .join(' · ')
                      : t('appointments.book.anyDoctor')
                  }
                  divider
                />
                <InfoRow
                  icon="calendar"
                  label={t('appointments.book.reviewDateTime')}
                  value={
                    bookedDuration
                      ? `${formatFullDateTime(selectedSlot.starts_at)} (${fmtDuration(bookedDuration)})`
                      : formatFullDateTime(selectedSlot.starts_at)
                  }
                  divider
                />
                <InfoRow
                  icon={typeIconOf(appointmentType)}
                  tint="green"
                  label={t('appointments.book.reviewType')}
                  value={appointmentTypeLabel(appointmentType)}
                  divider={!!patient}
                />
                {patient ? (
                  <InfoRow
                    icon="id-card"
                    label={t('appointments.book.reviewPatient')}
                    value={patient.display_name}
                  />
                ) : null}
              </View>
              <View style={styles.summary}>
                <SummaryLine
                  label={t('opesCare.review.reasonTitle')}
                  value={reason.trim() || t('appointments.book.noReasonGiven')}
                />
                {patient ? (
                  <SummaryLine label={t('appointments.book.healthId')} value={patient.health_id} strong />
                ) : null}
              </View>
            </Card>
          </View>

          <NoticeBanner icon="info" tone="pending" message={t('appointments.book.confirmNote')} />

          {bookingErrorKeyNow ? (
            <View style={styles.errorWrap}>
              <NoticeBanner
                icon="alert-circle"
                tone="critical"
                title={t(`appointments.book.${bookingErrorKeyNow}`)}
                message={
                  bookingErrorKeyNow === 'bookErrorSlotTaken'
                    ? t('opesCare.review.conflictMessage')
                    : t('opesCare.review.checkHint')
                }
              />
              {bookingErrorKeyNow === 'bookErrorSlotTaken' ? (
                <CareButton
                  label={t('appointments.book.pickAnotherTime')}
                  icon="clock"
                  variant="secondary"
                  onPress={handlePickAnotherTime}
                />
              ) : null}
            </View>
          ) : null}

          <GradientButton
            label={
              bookMutation.isPending
                ? t('appointments.book.booking')
                : t('appointments.book.confirmButton')
            }
            onPress={handleConfirmBooking}
            loading={bookMutation.isPending}
            icon="none"
            accessibilityHint={t('appointments.book.confirmNote')}
          />
        </ScrollView>
      ) : null}

      {/* ── Success ───────────────────────────────────────────────────── */}
      {step === 'success' && bookedAppointment ? (
        <>
          <ScreenHeader title={t('opesCare.confirmed.title')} align="center" showBack={false} />
          <ScrollView
            style={styles.fill}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.hero} accessibilityLiveRegion="polite">
              <View style={styles.heroMark}>
                <Icon name="check" size={38} color={colors.textOnBrand} />
              </View>
              <Text style={styles.heroTitle} accessibilityRole="header">
                {t('opesCare.confirmed.heroTitle')}
              </Text>
              <Text style={styles.heroText}>{t('appointments.book.confirmedBody')}</Text>
            </View>

            <Card variant="flush">
              <View style={styles.detailsHead}>
                <Icon name="calendar" size={22} color={colors.blue} />
                <Text style={styles.detailsTitle} accessibilityRole="header">
                  {t('opesCare.confirmed.detailsTitle')}
                </Text>
                {/* The status the API actually assigned — `booked` until the
                    facility acknowledges it — never an assumed "confirmed". */}
                <StatusBadge
                  status={bookedAppointment.status}
                  tone={statusToneOf(bookedAppointment.status)}
                  icon={statusIconOf(bookedAppointment.status)}
                  size="sm"
                  label={statusLabelOf(tt, bookedAppointment.status)}
                />
              </View>

              <View style={styles.summary}>
                <SummaryLine
                  label={t('appointments.book.bookingIdLabel')}
                  value={appointmentReference(bookedAppointment.id)}
                  strong
                />
              </View>

              {/* "Any available clinician" still books a real person — the API
                  copies the locked slot's provider onto the appointment — so
                  name them here even though the patient never picked them. */}
              <View style={styles.providerRow}>
                <ProviderAvatar
                  name={
                    selectedProvider?.name ??
                    bookedAppointment.provider_name ??
                    t('opesCare.appt.careTeam')
                  }
                  size={64}
                />
                <View style={styles.providerBody}>
                  <Text style={styles.providerLabel}>{t('opesCare.confirmed.providerLabel')}</Text>
                  <Text style={styles.providerName} numberOfLines={2}>
                    {selectedProvider?.name ??
                      bookedAppointment.provider_name ??
                      t('opesCare.appt.providerTbd')}
                  </Text>
                  {!!selectedProvider?.job_title && (
                    <Text style={styles.providerSpecialty}>{selectedProvider.job_title}</Text>
                  )}
                  <View style={styles.metaRow}>
                    <Icon name="building" size={15} color={colors.textSecondary} />
                    <Text style={styles.meta} numberOfLines={1}>
                      {bookedAppointment.facility_name ??
                        selectedFacility?.facility_name ??
                        t('opesCare.appt.facilityTbd')}
                    </Text>
                  </View>
                  {selectedFacility && facilityAddress(selectedFacility) ? (
                    <View style={styles.metaRow}>
                      <Icon name="location" size={15} color={colors.textSecondary} />
                      <Text style={styles.meta} numberOfLines={1}>
                        {facilityAddress(selectedFacility)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              {selectedProvider ? (
                <View style={styles.cardFoot}>
                  <LinkAction
                    label={t('appointments.book.viewDoctorProfile')}
                    onPress={() => router.push(`/doctor/${selectedProvider.id}`)}
                  />
                </View>
              ) : null}

              <View style={styles.rows}>
                <InfoRow
                  icon="calendar"
                  label={t('opesCare.confirmed.labelDate')}
                  value={
                    bookedAppointment.scheduled_at ? formatDateLong(bookedAppointment.scheduled_at) : '—'
                  }
                  divider
                />
                <InfoRow
                  icon="clock"
                  label={t('opesCare.confirmed.labelTime')}
                  value={
                    bookedAppointment.scheduled_at
                      ? selectedSlot
                        ? `${formatTime(bookedAppointment.scheduled_at)} – ${formatTime(selectedSlot.ends_at)}${
                            bookedDuration ? ` (${fmtDuration(bookedDuration)})` : ''
                          }`
                        : formatTime(bookedAppointment.scheduled_at)
                      : '—'
                  }
                  divider
                />
                <InfoRow
                  icon={typeIconOf(bookedAppointment.appointment_type)}
                  tint="green"
                  label={t('opesCare.confirmed.labelType')}
                  value={appointmentTypeLabel(bookedAppointment.appointment_type)}
                  divider
                />
                <InfoRow
                  icon="edit"
                  label={t('opesCare.confirmed.labelReason')}
                  value={bookedAppointment.reason ?? t('opesCare.appt.notSpecified')}
                  divider={!!patient}
                />
                {patient ? (
                  <InfoRow
                    icon="id-card"
                    label={t('appointments.book.reviewPatient')}
                    value={`${patient.display_name} · ${t('appointments.book.healthId')} ${patient.health_id}`}
                  />
                ) : null}
              </View>
            </Card>

            <NoticeBanner
              icon="info"
              tone="pending"
              title={t('appointments.book.whatToExpectTitle')}
              message={`${t('appointments.book.whatToExpectArrive')}\n${t('appointments.book.whatToExpectBring')}`}
            />

            <Card variant="flush">
              <View style={styles.detailsHead}>
                <Text style={styles.detailsTitle} accessibilityRole="header">
                  {t('opesCare.confirmed.nextTitle')}
                </Text>
              </View>
              <ListRow
                icon="share"
                tint="blue"
                title={t('opesCare.confirmed.shareTitle')}
                onPress={handleShareAppointment}
                divider
              />
              <ListRow
                icon="document-text"
                tint="blue"
                title={t('opesCare.confirmed.viewDetailsTitle')}
                subtitle={t('opesCare.confirmed.viewDetailsSub')}
                onPress={() => router.replace(`/appointments/${bookedAppointment.id}`)}
                divider
              />
              <ListRow
                icon="calendar"
                tint="purple"
                title={t('opesCare.confirmed.seeAllTitle')}
                onPress={() => router.replace('/appointments')}
                divider={!!facilityPhone}
              />
              {facilityPhone ? (
                <ListRow
                  icon="phone"
                  tint="green"
                  title={t('appointments.book.callFacility')}
                  subtitle={facilityPhone}
                  onPress={handleCallFacility}
                />
              ) : null}
            </Card>

            <View style={styles.ctaStack}>
              <GradientButton
                label={t('appointments.book.viewAppointment')}
                onPress={() => router.replace(`/appointments/${bookedAppointment.id}`)}
              />
              <CareButton
                label={t('opesCare.confirmed.goHome')}
                icon="home"
                variant="secondary"
                onPress={() => router.replace('/(tabs)/home')}
              />
            </View>
          </ScrollView>
        </>
      ) : null}

      {dialog.element}
    </Screen>
  );
}

// ── styles ────────────────────────────────────────────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    fill: { flex: 1 },
    gutter: { paddingHorizontal: spacing.md },
    content: { padding: spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl },
    listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
    progress: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
    block: { marginBottom: spacing.md },
    listCard: { marginBottom: spacing.sm + 4 },
    centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
    loading: { alignItems: 'center', gap: spacing.sm },
    loadingText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textMuted,
    },
    footerSpinner: { alignItems: 'center', paddingVertical: spacing.md },

    chipStrip: { flexGrow: 0, marginBottom: spacing.md },
    chipStripContent: { gap: spacing.sm, paddingRight: spacing.sm },

    linkAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    linkText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.link,
    },

    cardHeadWrap: { marginBottom: spacing.md - 4 },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    cardTitle: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    cardHint: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },

    cardFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, flexShrink: 1 },
    footHint: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    cardLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    cardLineText: {
      flex: 1,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },

    emptyActions: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },

    sectionIntro: { marginTop: spacing.xs },
    sectionHint: {
      marginTop: -4,
      marginBottom: spacing.sm + 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    overline: { marginTop: spacing.xs },

    rowBetween: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm },
    rowHeader: { marginBottom: 0, flexShrink: 1 },
    monthLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
      textTransform: 'capitalize',
    },
    slotsHeader: { marginBottom: 0 },

    dayStrip: { gap: spacing.sm, paddingRight: 2, paddingBottom: 2 },
    dayChip: {
      width: 66,
      borderRadius: radii.md,
      borderWidth: 1,
      paddingVertical: 9,
      alignItems: 'center',
      gap: 2,
    },
    dayChipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    dayChipOff: { backgroundColor: colors.surface, borderColor: colors.border },
    dayWeek: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 11,
      textTransform: 'uppercase',
      color: colors.textSecondary,
    },
    dayDate: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    dayTextOn: { color: colors.textOnBrand },
    dayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent', marginTop: 2 },
    dayDotOn: { backgroundColor: colors.statusNormal },
    dayDotOnActive: { backgroundColor: colors.textOnBrand },

    buckets: { gap: spacing.md },
    bucketHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm + 2 },
    bucketLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    bucketRule: { flex: 1, height: 1, backgroundColor: colors.border },
    bucketCount: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    slotChip: { minWidth: 92, justifyContent: 'center' },

    stickyFooter: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      gap: spacing.sm + 4,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    footerCard: { padding: spacing.sm + 4 },
    footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4 },
    footerIcon: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footerBody: { flex: 1, minWidth: 0 },
    footerTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    footerText: {
      marginTop: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },

    almost: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 4,
      padding: spacing.md - 2,
      borderRadius: radii.md,
      backgroundColor: colors.statusNormalBg,
    },
    almostIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.statusNormal,
      alignItems: 'center',
      justifyContent: 'center',
    },
    almostBody: { flex: 1, minWidth: 0 },
    almostTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.statusNormal,
    },
    almostText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },

    typeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    textarea: {
      minHeight: 92,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.sm + 4,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    counter: {
      alignSelf: 'flex-end',
      marginTop: 4,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },

    rows: { paddingHorizontal: spacing.md },
    summary: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    errorWrap: { gap: spacing.sm },

    hero: { alignItems: 'center', gap: spacing.sm + 2, paddingVertical: spacing.md },
    heroMark: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.statusNormal,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    heroText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
      textAlign: 'center',
    },

    detailsHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    detailsTitle: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },

    providerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md - 2,
      padding: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    providerBody: { flex: 1, minWidth: 0, gap: 1 },
    providerLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    providerName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      color: colors.textPrimary,
    },
    providerSpecialty: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    meta: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },

    ctaStack: { gap: spacing.sm + 4 },
  });
