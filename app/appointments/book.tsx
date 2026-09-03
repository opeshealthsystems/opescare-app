import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
  type ViewToken,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CheckCircle2,
  ChevronRight,
  Clock,
  FlaskConical,
  Hospital,
  Info,
  MapPin,
  Microscope,
  Navigation,
  Phone,
  Pill,
  Scan,
  Search,
  Share2,
  Stethoscope,
  Sun,
  Sunset,
  Timer,
  TriangleAlert,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
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
} from '../../lib/api/queries';
import {
  bookingErrorKey,
  daysCoveredBySlots,
  firstSlotAfterDay,
  flattenFacilityPages,
  groupSlotsByPeriod,
  localDateKey,
  slotDurationMinutes,
  slotsOnDay,
  useFacilityBookability,
  useInfiniteFacilities,
  UNKNOWN_BOOKABILITY,
  type FacilityBookability,
  type SlotPeriod,
} from '../../lib/api/bookingQueries';
import { colors } from '../../theme/tokens';

/**
 * Book an appointment — facility → clinician → time → confirm.
 *
 * Two realities shape this screen and are worth stating up front, because the
 * naive version of each is wrong:
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

const FACILITY_TYPE_META: Record<FacilityType, { key: string; icon: LucideIcon }> = {
  hospital: { key: 'filterHospital', icon: Hospital },
  clinic: { key: 'filterClinic', icon: Stethoscope },
  health_center: { key: 'filterHealthCenter', icon: Building2 },
  pharmacy: { key: 'filterPharmacy', icon: Pill },
  laboratory: { key: 'filterLab', icon: FlaskConical },
  imaging_center: { key: 'filterImaging', icon: Scan },
  diagnostic_center: { key: 'filterDiagnostic', icon: Microscope },
  dental: { key: 'filterDental', icon: BadgeCheck },
};

const APPOINTMENT_TYPES: { value: string; key: string }[] = [
  { value: 'consultation', key: 'typeConsultation' },
  { value: 'follow_up', key: 'typeFollowUp' },
  { value: 'check_up', key: 'typeCheckUp' },
  { value: 'vaccination', key: 'typeVaccination' },
  { value: 'lab_test', key: 'typeLabTest' },
  { value: 'other', key: 'typeOther' },
];

const PERIOD_META: Record<SlotPeriod, { key: string; icon: LucideIcon }> = {
  morning: { key: 'periodMorning', icon: Sun },
  afternoon: { key: 'periodAfternoon', icon: Sunset },
  evening: { key: 'periodEvening', icon: Clock },
};

/** Slots are opened on a rolling 14-day horizon by the backend seeder. */
const HORIZON_DAYS = 14;
/** Hard ceiling on concurrent bookability probes — one request each, no batch endpoint. */
const MAX_PROBES = 60;
const REASON_MAX_LENGTH = 1000;

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

function formatTime(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(localeTagFor(locale), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateMedium(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(localeTagFor(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatDateLong(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(localeTagFor(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatFullDateTime(iso: string, locale: string) {
  return `${formatDateLong(iso, locale)}, ${formatTime(iso, locale)}`;
}

/** Two-letter monogram — `staff_profiles` carries no photo column. */
function providerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Deep-link to a maps app for directions, same pattern as care-map.tsx. */
function directionsUrl(facility: BookingFacility): string | null {
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
  const address = [facility.address, facility.city, facility.region].filter(Boolean).join(', ');
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
}

const openUrl = (url: string) => {
  Linking.openURL(url).catch(() => {});
};

// ── presentational pieces ─────────────────────────────────────────────────

function WizardHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
}) {
  return (
    <View className="flex-row items-center px-6 pt-2">
      <Pressable
        onPress={onBack}
        hitSlop={8}
        className="h-11 w-11 items-center justify-center rounded-full border border-brand-300"
      >
        <ArrowLeft size={18} color={colors.brand[600]} />
      </Pressable>
      <View className="ml-4 flex-1">
        <Text className="text-lg font-extrabold text-navy-text" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-xs text-navy-muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Four labelled segments — the patient always knows how much is left. */
function ProgressRail({ step, labels }: { step: Step; labels: string[] }) {
  const activeIndex = WIZARD_STEPS.indexOf(step);
  if (activeIndex < 0) return null;
  return (
    <View className="mt-4 flex-row gap-2 px-6">
      {WIZARD_STEPS.map((wizardStep, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        return (
          <View key={wizardStep} className="flex-1">
            <View
              className="h-1.5 rounded-full"
              style={{
                backgroundColor: done || active ? colors.brand[500] : colors.cream[300],
              }}
            />
            <Text
              className="mt-1.5 text-[10px] font-semibold"
              numberOfLines={1}
              style={{ color: active ? colors.brand[600] : colors.navy.muted }}
            >
              {labels[index]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Chip({
  label,
  active,
  icon: Icon,
  onPress,
}: {
  label: string;
  active: boolean;
  icon?: LucideIcon;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center rounded-full border px-4 py-2"
      style={{
        borderColor: active ? colors.brand[500] : colors.cream[300],
        backgroundColor: active ? colors.brand[50] : colors.white,
      }}
    >
      {Icon ? (
        <Icon
          size={13}
          color={active ? colors.brand[600] : colors.navy.muted}
          style={{ marginRight: 6 }}
        />
      ) : null}
      <Text
        className="text-xs font-semibold"
        style={{ color: active ? colors.brand[600] : colors.navy.secondary }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The honest availability badge. Every state is distinct on purpose — "we have
 * not looked yet" must never read the same as "this place cannot be booked".
 */
function BookabilityBadge({
  bookability,
  locale,
}: {
  bookability: FacilityBookability;
  locale: string;
}) {
  const { t } = useTranslation();

  if (bookability.state === 'unknown' || bookability.state === 'error') return null;

  if (bookability.state === 'checking') {
    return (
      <View className="flex-row items-center rounded-full bg-cream-200 px-2.5 py-1">
        <ActivityIndicator size="small" color={colors.navy.muted} />
        <Text className="ml-1.5 text-[10px] font-semibold text-navy-muted">
          {t('appointments.book.badgeChecking')}
        </Text>
      </View>
    );
  }

  if (bookability.state === 'bookable') {
    return (
      <View
        className="flex-row items-center rounded-full px-2.5 py-1"
        style={{ backgroundColor: colors.semantic.successSurface }}
      >
        <CalendarCheck size={11} color={colors.semantic.success} />
        <Text
          className="ml-1.5 text-[10px] font-bold"
          style={{ color: colors.semantic.success }}
        >
          {bookability.nextSlotAt
            ? t('appointments.book.nextOpening', {
                when: formatDateMedium(bookability.nextSlotAt, locale),
              })
            : t('appointments.book.badgeBookable')}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-row items-center rounded-full bg-cream-200 px-2.5 py-1">
      <CalendarX size={11} color={colors.navy.muted} />
      <Text className="ml-1.5 text-[10px] font-semibold text-navy-muted">
        {bookability.state === 'unlinked'
          ? t('appointments.book.badgeNoOnlineBooking')
          : t('appointments.book.badgeNoOpenings')}
      </Text>
    </View>
  );
}

function FacilityCard({
  facility,
  bookability,
  locale,
  typeLabel,
  onPress,
  onViewDetails,
}: {
  facility: CareFacilitySummary;
  bookability: FacilityBookability;
  locale: string;
  typeLabel: string;
  onPress: () => void;
  onViewDetails: () => void;
}) {
  const { t } = useTranslation();
  const bookable = bookability.state === 'bookable';
  return (
    <Pressable
      onPress={onPress}
      className="mb-3 rounded-2xl border bg-white p-4"
      style={{ borderColor: bookable ? colors.brand[300] : colors.cream[300] }}
    >
      <View className="flex-row items-start">
        <View
          className="mr-3 h-11 w-11 items-center justify-center rounded-full"
          style={{
            backgroundColor: bookable ? colors.semantic.successSurface : colors.brand[50],
          }}
        >
          <Building2
            size={20}
            color={bookable ? colors.semantic.success : colors.brand[600]}
          />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-navy-text" numberOfLines={2}>
            {facility.facility_name}
          </Text>
          <View className="mt-1 flex-row items-center">
            <MapPin size={12} color={colors.navy.muted} />
            <Text className="ml-1 flex-1 text-xs text-navy-secondary" numberOfLines={1}>
              {[facility.address, facility.city].filter(Boolean).join(', ') || '—'}
            </Text>
          </View>
          <View className="mt-2 flex-row flex-wrap items-center gap-2">
            <View className="rounded-full bg-cream-200 px-2.5 py-1">
              <Text className="text-[10px] font-semibold uppercase text-navy-secondary">
                {typeLabel}
              </Text>
            </View>
            <BookabilityBadge bookability={bookability} locale={locale} />
          </View>
        </View>
      </View>

      <View
        className="mt-3 flex-row items-center justify-between pt-3"
        style={{ borderTopWidth: 1, borderTopColor: colors.cream[300] }}
      >
        {/* Look before you commit — opens the facility profile (services,
            hours, and the clinicians who practise there) without leaving the
            booking flow's back stack. */}
        <Pressable onPress={onViewDetails} hitSlop={8} className="flex-row items-center">
          <Text className="text-xs font-semibold text-brand-600">
            {t('appointments.book.viewFacility')}
          </Text>
          <ChevronRight size={14} color={colors.brand[600]} />
        </Pressable>
        <View className="flex-row items-center">
          <Text className="text-xs font-bold text-navy-text">
            {t('appointments.book.select')}
          </Text>
          <ChevronRight size={16} color={colors.navy.text} />
        </View>
      </View>
    </Pressable>
  );
}

/** A deliberate, actionable dead-end — never a blank list. */
function EmptyState({
  icon: Icon,
  tone = 'neutral',
  title,
  body,
  children,
}: {
  icon: LucideIcon;
  tone?: 'neutral' | 'warning' | 'danger';
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  const surface =
    tone === 'danger'
      ? colors.semantic.dangerSurface
      : tone === 'warning'
        ? colors.semantic.warningSurface
        : colors.cream[200];
  const accent =
    tone === 'danger'
      ? colors.semantic.danger
      : tone === 'warning'
        ? colors.semantic.warning
        : colors.brand[600];
  return (
    <View className="items-center rounded-2xl bg-white px-5 py-8">
      <View
        className="h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: surface }}
      >
        <Icon size={24} color={accent} />
      </View>
      <Text className="mt-4 text-center text-base font-bold text-navy-text">{title}</Text>
      {body ? (
        <Text className="mt-1.5 text-center text-sm leading-5 text-navy-secondary">{body}</Text>
      ) : null}
      {children ? <View className="mt-5 w-full">{children}</View> : null}
    </View>
  );
}

function SecondaryAction({
  icon: Icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-2 flex-row items-center justify-center rounded-2xl border py-3"
      style={{ borderColor: colors.brand[300] }}
    >
      <Icon size={16} color={colors.brand[600]} />
      <Text className="ml-2 text-sm font-semibold text-brand-600">{label}</Text>
    </Pressable>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  caption,
  first = false,
  action,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  caption?: string | null;
  first?: boolean;
  action?: ReactNode;
}) {
  return (
    <View
      className="flex-row items-start py-3"
      style={first ? undefined : { borderTopWidth: 1, borderTopColor: colors.cream[300] }}
    >
      <Icon size={16} color={colors.brand[600]} style={{ marginTop: 2 }} />
      <View className="ml-3 flex-1">
        <Text className="text-xs text-navy-muted">{label}</Text>
        <Text className="mt-0.5 text-sm font-semibold text-navy-text">{value}</Text>
        {caption ? <Text className="mt-0.5 text-xs text-navy-muted">{caption}</Text> : null}
      </View>
      {action}
    </View>
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
  return (
    <View className="mb-4 rounded-2xl border bg-white p-4" style={{ borderColor: colors.cream[300] }}>
      <View className="flex-row items-start">
        <View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-brand-50">
          <Building2 size={20} color={colors.brand[600]} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-navy-text" numberOfLines={2}>
            {facility.facility_name}
          </Text>
          <View className="mt-1 flex-row items-center">
            <MapPin size={12} color={colors.navy.muted} />
            <Text className="ml-1 flex-1 text-xs text-navy-secondary" numberOfLines={1}>
              {[facility.address, facility.city].filter(Boolean).join(', ') || '—'}
            </Text>
          </View>
          <View className="mt-2 self-start rounded-full bg-cream-200 px-2.5 py-1">
            <Text className="text-[10px] font-semibold uppercase text-navy-secondary">
              {typeLabel}
            </Text>
          </View>
        </View>
        <Pressable onPress={onChangeFacility} hitSlop={8}>
          <Text className="text-xs font-semibold text-brand-600">
            {t('appointments.book.changeFacility')}
          </Text>
        </Pressable>
      </View>

      {children}

      <Pressable
        onPress={onViewFacility}
        className="mt-3 flex-row items-center pt-3"
        style={{ borderTopWidth: 1, borderTopColor: colors.cream[300] }}
      >
        <Text className="text-xs font-semibold text-brand-600">
          {t('appointments.book.viewFacility')}
        </Text>
        <ChevronRight size={14} color={colors.brand[600]} />
      </Pressable>
    </View>
  );
}

// ── screen ────────────────────────────────────────────────────────────────

export default function BookAppointmentScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const router = useRouter();
  const queryClient = useQueryClient();
  const patient = useAuthStore((s) => s.patient);

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

  const facilitiesQuery = useInfiniteFacilities({
    q: appliedSearch || undefined,
    type: typeFilter || undefined,
  });
  const facilities = useMemo(
    () => flattenFacilityPages(facilitiesQuery.data?.pages),
    [facilitiesQuery.data],
  );
  const totalFacilities = facilitiesQuery.data?.pages[0]?.pagination.total ?? 0;

  // Bookability is probed only for cards that have actually been on screen —
  // one request each, and there is no batch endpoint to do better.
  const [probeIds, setProbeIds] = useState<string[]>([]);
  const probeIdsRef = useRef<Set<string>>(new Set());
  // A new search or type filter is a new result set; keeping the old ids would
  // burn the probe budget on facilities that are no longer on the list.
  useEffect(() => {
    probeIdsRef.current = new Set();
    setProbeIds([]);
  }, [appliedSearch, typeFilter]);
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

  const facilityPhone = selectedFacility?.phone_primary ?? null;
  const facilityMapsUrl = selectedFacility ? directionsUrl(selectedFacility) : null;

  const facilityTypeLabel = useCallback(
    (value: string | null | undefined) => {
      const meta = value ? FACILITY_TYPE_META[value as FacilityType] : undefined;
      return meta ? t(`appointments.book.${meta.key}`) : (value ?? '—');
    },
    [t],
  );

  const appointmentTypeLabel = useCallback(
    (value: string | null | undefined) => {
      const match = APPOINTMENT_TYPES.find((type) => type.value === value);
      return match ? t(`appointments.book.${match.key}`) : (value ?? '—');
    },
    [t],
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

  const handleGetDirections = () => {
    if (facilityMapsUrl) openUrl(facilityMapsUrl);
  };

  const handleCallFacility = () => {
    if (facilityPhone) openUrl(`tel:${facilityPhone.replace(/\s+/g, '')}`);
  };

  const handleShareAppointment = async () => {
    if (!bookedAppointment) return;
    try {
      await Share.share({
        message: t('appointments.book.shareMessage', {
          type: appointmentTypeLabel(bookedAppointment.appointment_type),
          facility: bookedAppointment.facility_name ?? selectedFacility?.facility_name ?? '',
          datetime: bookedAppointment.scheduled_at
            ? formatFullDateTime(bookedAppointment.scheduled_at, locale)
            : '',
          id: bookedAppointment.id.slice(0, 8).toUpperCase(),
        }),
      });
    } catch {
      // Share sheet dismissed/cancelled — nothing to surface.
    }
  };

  const stepLabels = [
    t('appointments.book.railFacility'),
    t('appointments.book.railDoctor'),
    t('appointments.book.railSlot'),
    t('appointments.book.railConfirm'),
  ];
  const stepTitle =
    step === 'facility'
      ? t('appointments.book.stepFacility')
      : step === 'doctor'
        ? t('appointments.book.stepDoctor')
        : step === 'slot'
          ? t('appointments.book.stepSlot')
          : t('appointments.book.stepConfirm');

  const bookedDuration =
    selectedSlot != null ? slotDurationMinutes(selectedSlot) : null;

  return (
    <Screen className="px-0">
      {step !== 'success' ? (
        <>
          <WizardHeader
            title={stepTitle}
            subtitle={t('appointments.book.stepOf', {
              current: WIZARD_STEPS.indexOf(step) + 1,
              total: WIZARD_STEPS.length,
            })}
            onBack={goBack}
          />
          <ProgressRail step={step} labels={stepLabels} />
        </>
      ) : null}

      {/* ── Deep link in flight ──────────────────────────────────────────
          Resolving the facility already chosen on the previous screen.
          Showing the picker here would flicker back to a decision the
          patient has already made. */}
      {step === 'facility' && !hydratedFromLink ? (
        <View className="flex-1 items-center justify-center px-6">
          {linkedFacilityQuery.isError ? (
            <EmptyState
              icon={TriangleAlert}
              tone="danger"
              title={t('appointments.book.loadFacilityErrorTitle')}
              body={t('appointments.book.loadFacilityErrorBody')}
            >
              <SecondaryAction
                icon={Building2}
                label={t('appointments.book.chooseAnother')}
                onPress={() => setHydratedFromLink(true)}
              />
            </EmptyState>
          ) : (
            <>
              <ActivityIndicator color={colors.brand[500]} />
              <Text className="mt-3 text-xs text-navy-muted">
                {t('appointments.book.openingFacility')}
              </Text>
            </>
          )}
        </View>
      ) : null}

      {/* ── Step 1 · Facility ─────────────────────────────────────────── */}
      {step === 'facility' && hydratedFromLink ? (
        <View className="flex-1 px-6 pt-4">
          <TextField
            placeholder={t('appointments.book.searchPlaceholder')}
            icon={Search}
            value={searchInput}
            onChangeText={setSearchInput}
            onSubmitEditing={() => setAppliedSearch(searchInput.trim())}
            returnKeyType="search"
            autoCorrect={false}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mt-1"
            // A horizontal ScrollView in a column flex parent will happily grow
            // to eat the rest of the screen; pin it to its content height.
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ gap: 8, paddingRight: 8 }}
          >
            <Chip
              label={t('appointments.book.filterAll')}
              active={typeFilter === ''}
              onPress={() => setTypeFilter('')}
            />
            {FACILITY_TYPES.map((value) => (
              <Chip
                key={value}
                label={t(`appointments.book.${FACILITY_TYPE_META[value].key}`)}
                icon={FACILITY_TYPE_META[value].icon}
                active={typeFilter === value}
                onPress={() => setTypeFilter(value)}
              />
            ))}
          </ScrollView>

          {/* Only a fraction of the directory is connected to scheduling; say
              so once, plainly, instead of letting the patient discover it one
              dead end at a time. */}
          <View
            className="mb-4 mt-4 flex-row items-start rounded-2xl p-3"
            style={{ backgroundColor: colors.semantic.infoSurface }}
          >
            <Info size={15} color={colors.semantic.info} style={{ marginTop: 1 }} />
            <Text className="ml-2 flex-1 text-xs leading-4 text-navy-secondary">
              {t('appointments.book.bookabilityNote')}
            </Text>
          </View>

          {facilitiesQuery.isPending ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={colors.brand[500]} />
            </View>
          ) : facilitiesQuery.isError ? (
            <EmptyState
              icon={TriangleAlert}
              tone="danger"
              title={t('appointments.book.loadFacilitiesError')}
              body={t('appointments.book.loadFacilitiesErrorBody')}
            >
              <SecondaryAction
                icon={Search}
                label={t('appointments.book.retry')}
                onPress={() => facilitiesQuery.refetch()}
              />
            </EmptyState>
          ) : (
            <FlatList
              data={facilities}
              keyExtractor={(item) => item.id}
              extraData={bookabilityByFacility}
              contentContainerStyle={{ paddingBottom: 24 }}
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
                  <View className="mb-3 flex-row items-center justify-between">
                    <Text className="text-xs font-semibold text-navy-muted">
                      {t('appointments.book.facilityCount', {
                        shown: facilities.length,
                        total: totalFacilities,
                      })}
                    </Text>
                    {appliedSearch ? (
                      <Pressable
                        hitSlop={8}
                        className="flex-row items-center"
                        onPress={() => {
                          setSearchInput('');
                          setAppliedSearch('');
                        }}
                      >
                        <X size={12} color={colors.brand[600]} />
                        <Text className="ml-1 text-xs font-semibold text-brand-600">
                          {t('appointments.book.clearSearch')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null
              }
              renderItem={({ item }) => (
                <FacilityCard
                  facility={item}
                  bookability={bookabilityByFacility.get(item.id) ?? UNKNOWN_BOOKABILITY}
                  locale={locale}
                  typeLabel={facilityTypeLabel(item.facility_type)}
                  onPress={() => handleSelectFacility(item)}
                  onViewDetails={() => router.push(`/facility/${item.id}`)}
                />
              )}
              ListFooterComponent={
                facilitiesQuery.isFetchingNextPage ? (
                  <View className="items-center py-4">
                    <ActivityIndicator color={colors.brand[500]} />
                  </View>
                ) : facilitiesQuery.hasNextPage ? (
                  <Pressable
                    onPress={() => facilitiesQuery.fetchNextPage()}
                    className="items-center rounded-2xl border py-3"
                    style={{ borderColor: colors.cream[300] }}
                  >
                    <Text className="text-sm font-semibold text-brand-600">
                      {t('appointments.book.loadMore')}
                    </Text>
                  </Pressable>
                ) : null
              }
              ListEmptyComponent={
                <EmptyState
                  icon={Search}
                  title={t('appointments.book.searchEmptyTitle')}
                  body={t('appointments.book.searchEmptyBody')}
                >
                  {appliedSearch || typeFilter ? (
                    <SecondaryAction
                      icon={X}
                      label={t('appointments.book.clearFilters')}
                      onPress={() => {
                        setSearchInput('');
                        setAppliedSearch('');
                        setTypeFilter('');
                      }}
                    />
                  ) : null}
                </EmptyState>
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
          className="flex-1 px-6 pt-4"
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          <ChosenFacilityCard
            facility={selectedFacility}
            typeLabel={facilityTypeLabel(selectedFacility.facility_type)}
            onViewFacility={() => router.push(`/facility/${selectedFacility.id}`)}
            onChangeFacility={handleChangeFacility}
          />

          {providersQuery.isPending ? (
            <View className="items-center py-10">
              <ActivityIndicator color={colors.brand[500]} />
            </View>
          ) : facilityIsUnlinked ? (
            /* The directory listing has no linked operational facility, so it
               can never hold a slot. Say that, and give the patient the two
               things that still work. */
            <EmptyState
              icon={CalendarX}
              tone="warning"
              title={t('appointments.book.unavailableTitle')}
              body={t('appointments.book.unavailableBody', {
                name: selectedFacility.facility_name,
              })}
            >
              {facilityPhone ? (
                <SecondaryAction
                  icon={Phone}
                  label={t('appointments.book.callFacility')}
                  onPress={handleCallFacility}
                />
              ) : null}
              {facilityMapsUrl ? (
                <SecondaryAction
                  icon={Navigation}
                  label={t('appointments.book.getDirections')}
                  onPress={handleGetDirections}
                />
              ) : null}
              <Button
                label={t('appointments.book.chooseAnother')}
                leftIcon={Building2}
                showChevron={false}
                onPress={handleChangeFacility}
              />
            </EmptyState>
          ) : (
            <>
              <Text className="mb-1 text-sm font-bold text-navy-text">
                {t('appointments.book.chooseDoctorPrompt')}
              </Text>
              <Text className="mb-3 text-xs text-navy-muted">
                {t('appointments.book.doctorStepSubtitle')}
              </Text>

              {/* "Any available clinician" is always offered, even when the
                  roster is empty or failed to load — the flow must never
                  dead-end on a clinician list. */}
              <Pressable
                onPress={() => handleSelectProvider(null)}
                className="mb-3 flex-row items-center rounded-2xl border bg-white p-4"
                style={{
                  borderColor: selectedProviderId === null ? colors.brand[500] : colors.cream[300],
                }}
              >
                <View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-brand-50">
                  <Users size={20} color={colors.brand[600]} />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-navy-text">
                    {t('appointments.book.anyDoctor')}
                  </Text>
                  <Text className="mt-0.5 text-xs text-navy-secondary">
                    {t('appointments.book.anyDoctorHint')}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.navy.muted} />
              </Pressable>

              {providersQuery.isError ? (
                <EmptyState
                  icon={TriangleAlert}
                  tone="danger"
                  title={t('appointments.book.loadDoctorsError')}
                  body={t('appointments.book.loadDoctorsErrorBody')}
                >
                  <SecondaryAction
                    icon={Stethoscope}
                    label={t('appointments.book.retry')}
                    onPress={() => providersQuery.refetch()}
                  />
                </EmptyState>
              ) : providers.length === 0 ? (
                /* No published roster — the "any available clinician" card
                   directly above already IS the way forward, so this explains
                   the gap rather than repeating the same button under it. The
                   slot still carries a clinician; they are simply not listed
                   in the public directory yet. */
                <View
                  className="flex-row items-start rounded-2xl p-4"
                  style={{ backgroundColor: colors.cream[200] }}
                >
                  <Stethoscope size={16} color={colors.navy.muted} style={{ marginTop: 1 }} />
                  <View className="ml-3 flex-1">
                    <Text className="text-sm font-bold text-navy-text">
                      {t('appointments.book.noDoctors')}
                    </Text>
                    <Text className="mt-1 text-xs leading-4 text-navy-secondary">
                      {t('appointments.book.noDoctorsBody')}
                    </Text>
                  </View>
                </View>
              ) : (
                <>
                  <Text className="mb-2 mt-2 text-xs font-semibold uppercase text-navy-muted">
                    {t('appointments.book.cliniciansHeading', { count: providers.length })}
                  </Text>
                  {providers.map((provider) => {
                    const active = selectedProviderId === provider.id;
                    const subtitle = [provider.job_title, provider.department]
                      .filter(Boolean)
                      .join(' · ');
                    const licence = provider.licenses[0]?.profession ?? provider.profession;
                    return (
                      <Pressable
                        key={provider.id}
                        onPress={() => handleSelectProvider(provider.id)}
                        className="mb-3 rounded-2xl border bg-white p-4"
                        style={{ borderColor: active ? colors.brand[500] : colors.cream[300] }}
                      >
                        <View className="flex-row items-center">
                          <View className="mr-3 h-12 w-12 items-center justify-center rounded-full bg-brand-50">
                            <Text className="text-sm font-extrabold text-brand-600">
                              {providerInitials(provider.name)}
                            </Text>
                          </View>
                          <View className="flex-1">
                            <View className="flex-row items-center">
                              <Text
                                className="flex-1 text-base font-bold text-navy-text"
                                numberOfLines={1}
                              >
                                {provider.name}
                              </Text>
                              {provider.credentials.length > 0 ? (
                                <BadgeCheck size={15} color={colors.semantic.success} />
                              ) : null}
                            </View>
                            {subtitle ? (
                              <Text
                                className="mt-0.5 text-xs text-navy-secondary"
                                numberOfLines={1}
                              >
                                {subtitle}
                              </Text>
                            ) : null}
                            {licence ? (
                              <Text className="mt-0.5 text-[10px] uppercase text-navy-muted">
                                {licence}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        <View
                          className="mt-3 flex-row items-center justify-between pt-3"
                          style={{ borderTopWidth: 1, borderTopColor: colors.cream[300] }}
                        >
                          <Pressable
                            hitSlop={8}
                            onPress={() => router.push(`/doctor/${provider.id}`)}
                            className="flex-row items-center"
                          >
                            <Text className="text-xs font-semibold text-brand-600">
                              {t('appointments.book.viewDoctorProfile')}
                            </Text>
                            <ChevronRight size={14} color={colors.brand[600]} />
                          </Pressable>
                          <View className="flex-row items-center">
                            <Text className="text-xs font-bold text-navy-text">
                              {t('appointments.book.seeTimes')}
                            </Text>
                            <ChevronRight size={16} color={colors.navy.text} />
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </>
              )}
            </>
          )}
        </ScrollView>
      ) : null}

      {/* ── Step 3 · Date & time ──────────────────────────────────────── */}
      {step === 'slot' && selectedFacility ? (
        <View className="flex-1 px-6 pt-4">
          <ScrollView
            className="flex-1"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            <ChosenFacilityCard
              facility={selectedFacility}
              typeLabel={facilityTypeLabel(selectedFacility.facility_type)}
              onViewFacility={() => router.push(`/facility/${selectedFacility.id}`)}
              onChangeFacility={handleChangeFacility}
            >
              <View
                className="mt-3 flex-row items-center pt-3"
                style={{ borderTopWidth: 1, borderTopColor: colors.cream[300] }}
              >
                <Stethoscope size={14} color={colors.brand[600]} />
                <Text
                  className="ml-2 flex-1 text-xs font-semibold text-navy-secondary"
                  numberOfLines={1}
                >
                  {selectedProviderId
                    ? t('appointments.book.withDoctor', {
                        name: selectedProvider?.name ?? '…',
                      })
                    : t('appointments.book.anyDoctor')}
                </Text>
                <Pressable onPress={() => setStep('doctor')} hitSlop={8}>
                  <Text className="text-xs font-semibold text-brand-600">
                    {t('appointments.book.changeDoctor')}
                  </Text>
                </Pressable>
              </View>
            </ChosenFacilityCard>

            <View className="mb-2 flex-row items-end justify-between">
              <Text className="text-sm font-bold text-navy-text">
                {t('appointments.book.selectDate')}
              </Text>
              <Text className="text-xs capitalize text-navy-muted">
                {formatMonth(new Date(`${selectedDate}T12:00:00`), locale)}
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
            >
              {days.map(({ date, key }, index) => {
                const { weekday, day } = formatDayChip(date, locale);
                const active = selectedDate === key;
                // A dot means "we have seen open slots on this day" — only the
                // window we actually fetched can say that, so absence of a dot
                // is silence, not a claim that the day is full.
                const known = daysWithSlots.has(key);
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      setSelectedDate(key);
                      setSelectedSlot(null);
                    }}
                    className="items-center rounded-2xl border px-3 py-3"
                    style={{
                      minWidth: 58,
                      backgroundColor: active ? colors.brand[500] : colors.white,
                      borderColor: active ? colors.brand[500] : colors.cream[300],
                    }}
                  >
                    <Text
                      className="text-[10px] font-semibold uppercase"
                      style={{ color: active ? colors.white : colors.navy.muted }}
                    >
                      {index === 0 ? t('appointments.book.today') : weekday}
                    </Text>
                    <Text
                      className="mt-1 text-base font-bold"
                      style={{ color: active ? colors.white : colors.navy.text }}
                    >
                      {day}
                    </Text>
                    <View
                      className="mt-1.5 h-1 w-1 rounded-full"
                      style={{
                        backgroundColor: known
                          ? active
                            ? colors.white
                            : colors.semantic.success
                          : 'transparent',
                      }}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text className="mb-3 mt-5 text-sm font-bold text-navy-text">
              {t('appointments.book.chooseSlotPrompt')}
            </Text>

            {slotsQuery.isPending ? (
              <View className="items-center py-10">
                <ActivityIndicator color={colors.brand[500]} />
              </View>
            ) : slotsQuery.isError ? (
              <EmptyState
                icon={TriangleAlert}
                tone="danger"
                title={t('appointments.book.loadSlotsError')}
                body={t('appointments.book.loadSlotsErrorBody')}
              >
                <SecondaryAction
                  icon={CalendarClock}
                  label={t('appointments.book.retry')}
                  onPress={() => slotsQuery.refetch()}
                />
              </EmptyState>
            ) : facilityIsUnlinked ? (
              <EmptyState
                icon={CalendarX}
                tone="warning"
                title={t('appointments.book.unavailableTitle')}
                body={t('appointments.book.unavailableBody', {
                  name: selectedFacility.facility_name,
                })}
              >
                {facilityPhone ? (
                  <SecondaryAction
                    icon={Phone}
                    label={t('appointments.book.callFacility')}
                    onPress={handleCallFacility}
                  />
                ) : null}
                <Button
                  label={t('appointments.book.chooseAnother')}
                  leftIcon={Building2}
                  showChevron={false}
                  onPress={handleChangeFacility}
                />
              </EmptyState>
            ) : daySlots.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title={
                  selectedProviderId && facilityHasSlotsOnDay
                    ? t('appointments.book.noSlotsForDoctorTitle')
                    : slotWindow.length === 0
                      ? t('appointments.book.noSlotsAheadTitle')
                      : t('appointments.book.noSlotsTitle')
                }
                body={
                  selectedProviderId && facilityHasSlotsOnDay
                    ? t('appointments.book.noSlotsForDoctorBody')
                    : slotWindow.length === 0
                      ? t('appointments.book.noSlotsAheadBody')
                      : t('appointments.book.noSlotsBody')
                }
              >
                {nextSlotAhead ? (
                  <SecondaryAction
                    icon={CalendarCheck}
                    label={t('appointments.book.jumpToNext', {
                      when: formatDateMedium(nextSlotAhead.starts_at, locale),
                    })}
                    onPress={() => {
                      setSelectedDate(localDateKey(nextSlotAhead.starts_at));
                      setSelectedSlot(null);
                    }}
                  />
                ) : null}
                {selectedProviderId && facilityHasSlotsOnDay ? (
                  <SecondaryAction
                    icon={Users}
                    label={t('appointments.book.chooseAnyDoctor')}
                    onPress={() => {
                      setSelectedProviderId(null);
                      setSelectedSlot(null);
                    }}
                  />
                ) : null}
                {selectedDate !== days[0].key ? (
                  <SecondaryAction
                    icon={Calendar}
                    label={t('appointments.book.backToToday')}
                    onPress={() => {
                      setSelectedDate(days[0].key);
                      setSelectedSlot(null);
                    }}
                  />
                ) : null}
              </EmptyState>
            ) : (
              slotGroups.map((group) => (
                <View key={group.period} className="mb-5">
                  <View className="mb-2 flex-row items-center">
                    {(() => {
                      const PeriodIcon = PERIOD_META[group.period].icon;
                      return <PeriodIcon size={14} color={colors.brand[600]} />;
                    })()}
                    <Text className="ml-2 flex-1 text-xs font-bold uppercase text-navy-secondary">
                      {t(`appointments.book.${PERIOD_META[group.period].key}`)}
                    </Text>
                    <Text className="text-xs text-navy-muted">
                      {t('appointments.book.slotsOpen', { count: group.slots.length })}
                    </Text>
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    {group.slots.map((slot) => {
                      const active = selectedSlot?.id === slot.id;
                      const scarce = slot.available_count <= 1;
                      return (
                        <Pressable
                          key={slot.id}
                          onPress={() => setSelectedSlot(slot)}
                          className="items-center rounded-xl border px-4 py-2.5"
                          style={{
                            borderColor: active ? colors.brand[500] : colors.cream[300],
                            backgroundColor: active ? colors.brand[500] : colors.white,
                            minWidth: 88,
                          }}
                        >
                          <Text
                            className="text-sm font-bold"
                            style={{ color: active ? colors.white : colors.navy.text }}
                          >
                            {formatTime(slot.starts_at, locale)}
                          </Text>
                          {/* Seeded capacity is 3, so "3 places left" on every
                              chip would be pure noise. Show the slot's end time
                              by default and switch to the remaining-places
                              warning only when it is genuinely running out. */}
                          <Text
                            className="mt-0.5 text-[10px] font-semibold"
                            style={{
                              color: active
                                ? colors.white
                                : scarce
                                  ? colors.semantic.warning
                                  : colors.navy.muted,
                            }}
                          >
                            {scarce
                              ? t('appointments.book.spotsLeft', { count: slot.available_count })
                              : `– ${formatTime(slot.ends_at, locale)}`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {daySlots.length > 0 ? (
            <View className="pb-4 pt-2">
              {selectedSlot ? (
                <View className="mb-3 flex-row items-center justify-center">
                  <Clock size={13} color={colors.navy.muted} />
                  <Text className="ml-1.5 text-xs text-navy-secondary">
                    {formatDateMedium(selectedSlot.starts_at, locale)} ·{' '}
                    {formatTime(selectedSlot.starts_at, locale)}
                    {slotDurationMinutes(selectedSlot)
                      ? ` · ${t('appointments.book.minutes', { count: slotDurationMinutes(selectedSlot) })}`
                      : ''}
                  </Text>
                </View>
              ) : (
                <Text className="mb-3 text-center text-xs text-navy-muted">
                  {t('appointments.book.noSlotSelected')}
                </Text>
              )}
              <Button
                label={t('appointments.book.next')}
                onPress={() => setStep('confirm')}
                disabled={!selectedSlot}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── Step 4 · Confirm ──────────────────────────────────────────── */}
      {step === 'confirm' && selectedFacility && selectedSlot ? (
        <ScrollView
          className="flex-1 px-6 pt-4"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Text className="mb-1 text-sm font-bold text-navy-text">
            {t('appointments.book.typeLabel')}
          </Text>
          <Text className="mb-3 text-xs text-navy-muted">
            {t('appointments.book.typeHint')}
          </Text>
          <View className="mb-6 flex-row flex-wrap gap-2">
            {APPOINTMENT_TYPES.map((type) => (
              <Chip
                key={type.value}
                label={t(`appointments.book.${type.key}`)}
                active={appointmentType === type.value}
                onPress={() => setAppointmentType(type.value)}
              />
            ))}
          </View>

          {/* Reason is a free-text note the facility reads before the visit;
              the API accepts up to 1000 characters, so give it real room and
              show the budget rather than truncating silently. */}
          <Text className="mb-1 text-sm font-bold text-navy-text">
            {t('appointments.book.reasonLabel')}
          </Text>
          <Text className="mb-2 text-xs text-navy-muted">
            {t('appointments.book.reasonHint')}
          </Text>
          <View
            className="rounded-2xl border bg-white px-4 py-3"
            style={{ borderColor: colors.cream[300] }}
          >
            <TextInput
              className="text-base text-navy-text"
              placeholder={t('appointments.book.reasonPlaceholder')}
              placeholderTextColor={colors.navy.muted}
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={REASON_MAX_LENGTH}
              textAlignVertical="top"
              style={{ minHeight: 88 }}
            />
          </View>
          <Text className="mb-6 mt-1 text-right text-[10px] text-navy-muted">
            {t('appointments.book.reasonCounter', {
              used: reason.length,
              max: REASON_MAX_LENGTH,
            })}
          </Text>

          <Text className="mb-2 text-sm font-bold text-navy-text">
            {t('appointments.book.reviewTitle')}
          </Text>
          <View
            className="rounded-2xl border bg-white px-4"
            style={{ borderColor: colors.cream[300] }}
          >
            <SummaryRow
              first
              icon={Building2}
              label={t('appointments.book.reviewFacility')}
              value={selectedFacility.facility_name}
              caption={
                [selectedFacility.address, selectedFacility.city].filter(Boolean).join(', ') || null
              }
            />
            <SummaryRow
              icon={Stethoscope}
              label={t('appointments.book.reviewDoctor')}
              value={
                selectedProviderId
                  ? (selectedProvider?.name ?? '—')
                  : t('appointments.book.anyDoctor')
              }
              caption={selectedProvider?.job_title ?? null}
            />
            <SummaryRow
              icon={Calendar}
              label={t('appointments.book.reviewDateTime')}
              value={formatFullDateTime(selectedSlot.starts_at, locale)}
              caption={
                bookedDuration
                  ? t('appointments.book.minutes', { count: bookedDuration })
                  : null
              }
            />
            <SummaryRow
              icon={CalendarCheck}
              label={t('appointments.book.reviewType')}
              value={appointmentTypeLabel(appointmentType)}
              caption={reason.trim() || t('appointments.book.noReasonGiven')}
            />
            {patient ? (
              <SummaryRow
                icon={CheckCircle2}
                label={t('appointments.book.reviewPatient')}
                value={patient.display_name}
                caption={`${t('appointments.book.healthId')}: ${patient.health_id}`}
              />
            ) : null}
          </View>

          <View
            className="mt-4 flex-row items-start rounded-2xl p-4"
            style={{ backgroundColor: colors.semantic.infoSurface }}
          >
            <Info size={16} color={colors.semantic.info} style={{ marginTop: 1 }} />
            <Text className="ml-3 flex-1 text-xs leading-4 text-navy-secondary">
              {t('appointments.book.confirmNote')}
            </Text>
          </View>

          {bookMutation.isError ? (
            <View
              className="mt-4 flex-row items-start rounded-2xl p-4"
              style={{ backgroundColor: colors.semantic.dangerSurface }}
            >
              <TriangleAlert size={16} color={colors.semantic.danger} style={{ marginTop: 1 }} />
              <View className="ml-3 flex-1">
                <Text
                  className="text-sm font-bold"
                  style={{ color: colors.semantic.danger }}
                >
                  {t(`appointments.book.${bookingErrorKey(bookMutation.error)}`)}
                </Text>
                {bookingErrorKey(bookMutation.error) === 'bookErrorSlotTaken' ? (
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      setSelectedSlot(null);
                      bookMutation.reset();
                      slotsQuery.refetch();
                      setStep('slot');
                    }}
                    className="mt-2 flex-row items-center"
                  >
                    <Text className="text-xs font-bold text-brand-600">
                      {t('appointments.book.pickAnotherTime')}
                    </Text>
                    <ChevronRight size={13} color={colors.brand[600]} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          <View className="mt-6">
            <Button
              label={
                bookMutation.isPending
                  ? t('appointments.book.booking')
                  : t('appointments.book.confirmButton')
              }
              onPress={handleConfirmBooking}
              loading={bookMutation.isPending}
              showChevron={false}
              leftIcon={CheckCircle2}
            />
          </View>
        </ScrollView>
      ) : null}

      {/* ── Success ───────────────────────────────────────────────────── */}
      {step === 'success' && bookedAppointment ? (
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingTop: 24, paddingBottom: 44 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="items-center">
            <View
              className="h-16 w-16 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.semantic.successSurface }}
            >
              <CheckCircle2 size={32} color={colors.semantic.success} />
            </View>
            <Text className="mt-4 text-2xl font-extrabold text-navy-text">
              {t('appointments.book.confirmedTitle')}
            </Text>
            <Text className="mt-1 text-center text-sm text-navy-secondary">
              {t('appointments.book.confirmedBody')}
            </Text>
          </View>

          <View
            className="mt-5 flex-row items-center justify-between rounded-2xl px-4 py-3"
            style={{ backgroundColor: colors.semantic.successSurface }}
          >
            <Text className="text-xs font-semibold" style={{ color: colors.semantic.success }}>
              {t('appointments.book.bookingIdLabel')}
            </Text>
            <Text className="text-xs font-extrabold" style={{ color: colors.semantic.success }}>
              {bookedAppointment.id.slice(0, 8).toUpperCase()}
            </Text>
          </View>

          {/* Clinician card — mirrors the confirmation reference's doctor
              block. `staff_profiles` has no photo column, so the avatar is a
              monogram rather than an invented portrait. */}
          {selectedProvider ? (
            <View
              className="mt-4 rounded-2xl border bg-white p-4"
              style={{ borderColor: colors.cream[300] }}
            >
              <View className="flex-row items-center">
                <View className="mr-3 h-14 w-14 items-center justify-center rounded-full bg-brand-50">
                  <Text className="text-base font-extrabold text-brand-600">
                    {providerInitials(selectedProvider.name)}
                  </Text>
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <Text className="flex-1 text-base font-extrabold text-navy-text" numberOfLines={1}>
                      {selectedProvider.name}
                    </Text>
                    {selectedProvider.credentials.length > 0 ? (
                      <BadgeCheck size={16} color={colors.semantic.success} />
                    ) : null}
                  </View>
                  {selectedProvider.job_title ? (
                    <Text className="mt-0.5 text-xs font-semibold text-brand-600">
                      {selectedProvider.job_title}
                    </Text>
                  ) : null}
                  <Text className="mt-0.5 text-xs text-navy-secondary" numberOfLines={1}>
                    {selectedProvider.facility_name}
                  </Text>
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() => router.push(`/doctor/${selectedProvider.id}`)}
                  className="ml-2 rounded-full border px-3 py-1.5"
                  style={{ borderColor: colors.brand[300] }}
                >
                  <Text className="text-xs font-semibold text-brand-600">
                    {t('appointments.book.viewDoctorProfile')}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <Text className="mb-2 mt-6 text-sm font-bold text-navy-text">
            {t('appointments.book.detailsTitle')}
          </Text>
          <View
            className="rounded-2xl border bg-white px-4"
            style={{ borderColor: colors.cream[300] }}
          >
            <SummaryRow
              first
              icon={CalendarCheck}
              label={t('appointments.book.reviewType')}
              value={appointmentTypeLabel(bookedAppointment.appointment_type)}
              caption={bookedAppointment.reason ?? null}
            />
            <SummaryRow
              icon={Clock}
              label={t('appointments.book.reviewDateTime')}
              value={
                bookedAppointment.scheduled_at
                  ? formatFullDateTime(bookedAppointment.scheduled_at, locale)
                  : '—'
              }
              caption={
                bookedDuration
                  ? `${t('appointments.book.durationLabel')}: ${t('appointments.book.minutes', { count: bookedDuration })}`
                  : null
              }
            />
            <SummaryRow
              icon={MapPin}
              label={t('appointments.book.reviewFacility')}
              value={
                bookedAppointment.facility_name ?? selectedFacility?.facility_name ?? '—'
              }
              caption={
                selectedFacility
                  ? [selectedFacility.address, selectedFacility.city, selectedFacility.region]
                      .filter(Boolean)
                      .join(', ') || null
                  : null
              }
              action={
                facilityMapsUrl ? (
                  <Pressable
                    onPress={handleGetDirections}
                    hitSlop={8}
                    className="ml-2 flex-row items-center rounded-full border px-3 py-1.5"
                    style={{ borderColor: colors.brand[300] }}
                  >
                    <Navigation size={12} color={colors.brand[600]} />
                    <Text className="ml-1 text-xs font-semibold text-brand-600">
                      {t('appointments.book.getDirections')}
                    </Text>
                  </Pressable>
                ) : undefined
              }
            />
            {/* "Any available clinician" still books a real person — the API
                copies the locked slot's provider onto the appointment — so name
                them here even though the patient never picked them. */}
            {!selectedProvider && bookedAppointment.provider_name ? (
              <SummaryRow
                icon={Stethoscope}
                label={t('appointments.book.reviewDoctor')}
                value={bookedAppointment.provider_name}
              />
            ) : null}
            {patient ? (
              <SummaryRow
                icon={CheckCircle2}
                label={t('appointments.book.reviewPatient')}
                value={patient.display_name}
                caption={`${t('appointments.book.healthId')}: ${patient.health_id}`}
              />
            ) : null}
          </View>

          <View
            className="mt-4 flex-row items-start rounded-2xl p-4"
            style={{ backgroundColor: colors.semantic.infoSurface }}
          >
            <Info size={18} color={colors.semantic.info} style={{ marginTop: 1 }} />
            <View className="ml-3 flex-1">
              <Text className="text-sm font-bold text-navy-text">
                {t('appointments.book.whatToExpectTitle')}
              </Text>
              <Text className="mt-1 text-xs leading-4 text-navy-secondary">
                {t('appointments.book.whatToExpectArrive')}
              </Text>
              <Text className="mt-1 text-xs leading-4 text-navy-secondary">
                {t('appointments.book.whatToExpectBring')}
              </Text>
            </View>
          </View>

          <Text className="mb-2 mt-6 text-sm font-bold text-navy-text">
            {t('appointments.book.nextStepsTitle')}
          </Text>
          <View
            className="rounded-2xl border bg-white px-4"
            style={{ borderColor: colors.cream[300] }}
          >
            <SummaryRow
              first
              icon={Timer}
              label={t('appointments.book.nextStepPrepareTitle')}
              value={t('appointments.book.nextStepPrepareBody')}
            />
            <SummaryRow
              icon={CalendarX}
              label={t('appointments.book.nextStepRescheduleTitle')}
              value={t('appointments.book.nextStepRescheduleBody')}
            />
          </View>

          <View className="mt-6 gap-2">
            {facilityPhone ? (
              <SecondaryAction
                icon={Phone}
                label={t('appointments.book.callFacility')}
                onPress={handleCallFacility}
              />
            ) : null}
            <SecondaryAction
              icon={Share2}
              label={t('appointments.book.shareAppointment')}
              onPress={handleShareAppointment}
            />
          </View>

          <View className="mt-4">
            <Button
              label={t('appointments.book.viewAppointment')}
              leftIcon={CalendarCheck}
              onPress={() => router.replace(`/appointments/${bookedAppointment.id}`)}
            />
          </View>
          <Pressable
            onPress={() => router.replace('/appointments')}
            className="mt-4 items-center"
          >
            <Text className="text-sm font-semibold text-brand-600">
              {t('appointments.book.viewAppointments')}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.replace('/(tabs)/home')} className="mt-3 items-center">
            <Text className="text-sm font-semibold text-navy-muted">
              {t('appointments.book.done')}
            </Text>
          </Pressable>
        </ScrollView>
      ) : null}
    </Screen>
  );
}
