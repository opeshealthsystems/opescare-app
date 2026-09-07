import { useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Screen } from '@/components/ui/Screen';
import { FacilityMap } from '@/components/map/FacilityMap';
import {
  Card,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  ResultList,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  formatLabel,
  formatTime,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import {
  CareButton,
  DEPARTMENT_TYPE_ICON,
  InfoRow,
  LoadingBlock,
  NoticeBanner,
  ProviderAvatar,
  departmentTypeLabel,
  describeFailure,
  type DepartmentType,
  type Translate,
} from '@/components/care/shared';
import {
  useFacilityDetail,
  useFacilityProviders,
  useFacilitySlots,
  type AppointmentSlotOption,
  type CareFacilityDetail,
  type CareFacilityHour,
  type CareFacilityService,
  type FacilityProviderSummary,
} from '@/lib/api/queries';
import {
  joinLocationParts,
  normalizeText,
  openStateToday,
  telUrl,
  trimTime,
  usablePhone,
  weekdayLabel,
  websiteUrl,
  type OpenState,
} from '@/lib/careMap/facilityDisplay';

/**
 * Facility profile — the drill-in from Care Access and the booking flow's
 * facility picker. Presentation is the OPES CARE-005 profile layout
 * (`UIUX/src/screens/care/FacilityProfileScreen.tsx`) ported onto this
 * app's existing data layer; nothing below fetches differently than before.
 *
 * ── What this screen may show ────────────────────────────────────────────
 * Everything here comes from three real responses and nothing else:
 *   • `GET /mobile/facilities/{id}` → CareFacilityDetail. Its payload is
 *     exactly: id, facility_name, facility_type, ownership_type, city, region,
 *     address, latitude, longitude, phone_primary, phone_secondary, email,
 *     website, integration_status, description, services[], hours[],
 *     insurances[]. Every one of those is surfaced below.
 *   • `GET /mobile/facilities/{id}/providers` → the clinicians, with their job
 *     title, department, profession, employment type and registry credentials.
 *   • `GET /mobile/facilities/{id}/slots` → live open appointment slots.
 *
 * There is deliberately NO rating, review count, photo, bed count, waiting
 * time, "verified" mark or "last updated" line: the directory carries none of
 * those (`care_facilities.verification_status` is uniformly `unverified`
 * across every row, so a verification badge would be decoration, not fact).
 * A section with nothing behind it renders an explicit empty state — "this has
 * not been published" — which is a different thing from a load failure, and
 * both are different from "we could not find this facility at all".
 *
 * ── The two facility registers ───────────────────────────────────────────
 * This screen reads `care_facilities`, the PUBLIC DIRECTORY: 2 728 active
 * listings, everything a patient can find and phone. Care actually happens in
 * `facilities`, the OPERATIONAL TENANT (482 rows) — staff, calendars,
 * prescriptions and consent are all scoped to it. The join is one nullable
 * column, `care_facilities.facility_id`, and only 468 listings carry it.
 *
 * The honest-bookability rule lives here. `GET /mobile/facilities/{id}` now
 * states the link directly (`connected`, `facility_id`, `provider_count`,
 * `open_slot_count`, `connectivity_note`) instead of leaving the screen to
 * infer it from an empty slots array, and the connectivity card below is the
 * first thing under the identity block — a patient learns what this place can
 * do before they scroll to a booking button that would not have worked. The
 * booking card still reads the live slots response and only offers a CTA when
 * something is genuinely open.
 *
 * ── Tile row ─────────────────────────────────────────────────────────────
 * The identity card's circular action row follows MED-04's "Selected
 * Pharmacy" panel (`reference/medicine/a_full_screen_mobile_app_ui_
 * screenshot_clean_whit.png`), which draws Call | Directions | Website as
 * equal tiles. This screen carries all three plus Email and Share, because
 * `care_facilities` publishes an email and this app can share a listing.
 * The reference's photo, rating and "Open 24/7" chip are NOT carried: the
 * directory holds no photo and no rating, and a 24/7 claim is only drawn
 * when every published `hours` row actually says 24 hours.
 *
 * Where the facility is stays an *embedded* map (`FacilityMap`, the finder's
 * in-app map with in-app directions). There is deliberately no external
 * maps link on this screen.
 */

/**
 * Kit glyph for each `care_facilities.facility_type`. The care map keeps its
 * Lucide set; this screen is kit-only. The kit has no tooth glyph yet, so
 * dental falls back to the first-aid cross.
 */
const FACILITY_TYPE_ICON: Record<string, IconName> = {
  hospital: 'building',
  clinic: 'stethoscope',
  health_center: 'first-aid',
  pharmacy: 'pill',
  laboratory: 'flask',
  dental: 'first-aid',
  diagnostic_center: 'microscope',
  imaging_center: 'image',
  blood_bank: 'droplet',
};

const facilityTypeIcon = (type: string): IconName => FACILITY_TYPE_ICON[type] ?? 'location';

/**
 * `care_facility_services.service_category` is free text seeded from a small
 * vocabulary ("emergency, diagnostic, consultation, lab, imaging…"). Fold it
 * onto the kit's department types so every service row gets the same icon its
 * department would in the finder.
 */
const SERVICE_CATEGORY_TYPE: Record<string, DepartmentType> = {
  clinic: 'clinic',
  clinical: 'clinic',
  consultation: 'clinic',
  procedure: 'clinic',
  surgery: 'clinic',
  laboratory: 'laboratory',
  lab: 'laboratory',
  diagnostic: 'laboratory',
  pharmacy: 'pharmacy',
  imaging: 'imaging',
  radiology: 'imaging',
  emergency: 'emergency',
};

const SERVICE_TINT: Record<DepartmentType, Tint> = {
  clinic: 'blue',
  laboratory: 'green',
  pharmacy: 'green',
  imaging: 'purple',
  emergency: 'red',
};

function serviceDepartmentType(category: string | null): DepartmentType | null {
  if (!category) return null;
  return SERVICE_CATEGORY_TYPE[category.trim().toLowerCase().replace(/[\s-]+/g, '_')] ?? null;
}

/**
 * `care_facility_services.availability_status` / `facility_insurances.status`
 * are free text. `toneForStatus` already knows "active"/"expired"; these are
 * the availability words it does not, mapped so a suspended service never
 * renders in the same neutral grey as an available one.
 */
const AVAILABILITY_TONE: Record<string, StatusTone> = {
  available: 'normal',
  open: 'normal',
  operational: 'normal',
  limited: 'warning',
  reduced: 'warning',
  seasonal: 'warning',
  unavailable: 'critical',
  suspended: 'critical',
  closed: 'critical',
};

const normalizeStatus = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, '_');

/** `undefined` hands the decision back to the badge's own keyword map. */
function availabilityTone(value: string): StatusTone | undefined {
  return AVAILABILITY_TONE[normalizeStatus(value)];
}

/**
 * `staff_profiles.profession` / `.employment_type` are fixed DB enums with
 * translations already published under `doctor.*` (the clinician profile reads
 * the same two vocabularies). Mapped, never printed raw.
 */
const PROFESSION_KEYS: Record<string, string> = {
  doctor: 'doctor.professionDoctor',
  nurse: 'doctor.professionNurse',
  pharmacist: 'doctor.professionPharmacist',
  lab_technician: 'doctor.professionLabTechnician',
  midwife: 'doctor.professionMidwife',
};

const EMPLOYMENT_KEYS: Record<string, string> = {
  full_time: 'doctor.employmentFullTime',
  part_time: 'doctor.employmentPartTime',
  contract: 'doctor.employmentContract',
  locum: 'doctor.employmentLocum',
};

/** Open slots listed inline before the card defers to the booking flow. */
const MAX_INLINE_SLOTS = 4;

/** "Mon, 7 Sep" / "lun. 7 sept." in the active language. */
function slotDayLabel(iso: string, language: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(language.toLowerCase().startsWith('fr') ? 'fr-FR' : 'en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(date);
  } catch {
    return null;
  }
}

/** "Open · closes 17:00" / "Closed · opens 08:00" as a kit status pill. */
function OpenStateBadge({ state }: { state: OpenState }) {
  const { t } = useTranslation();
  if (state.kind === 'unknown') return null;

  const isOpen = state.kind === 'open' || state.kind === 'open24';
  const label =
    state.kind === 'open24'
      ? t('facility.open24')
      : state.kind === 'open'
        ? t('facility.openUntil', { time: state.until })
        : state.kind === 'closedNow'
          ? t('facility.closedUntil', { time: state.opensAt })
          : t('facility.closedToday');

  return (
    <StatusBadge
      status={isOpen ? 'open' : 'closed'}
      tone={isOpen ? 'normal' : state.kind === 'closedNow' ? 'warning' : 'neutral'}
      label={label}
      icon="clock"
      size="sm"
      style={{ alignSelf: 'flex-start' }}
    />
  );
}

/** The circular quick action under the identity block (Call / Email / Website / Share). */
function CircleAction({
  icon,
  label,
  onPress,
  disabled,
  hint,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={[styles.action, disabled && styles.actionOff]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
    >
      <View style={styles.actionCircle}>
        <Icon name={icon} size={22} color={colors.blue} />
      </View>
      <Text style={styles.actionLabel} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ServiceRow({
  service,
  divider,
  tr,
}: {
  service: CareFacilityService;
  divider: boolean;
  tr: Translate;
}) {
  const type = serviceDepartmentType(service.service_category);
  const availability = service.availability_status?.trim();
  return (
    <ListRow
      icon={type ? DEPARTMENT_TYPE_ICON[type] : 'clipboard'}
      tint={type ? SERVICE_TINT[type] : 'blue'}
      title={service.service_name}
      meta={[
        service.service_category ? departmentTypeLabel(tr, type ?? service.service_category) : null,
        service.specialty,
        service.appointment_required ? tr('facility.appointmentRequired') : null,
        service.walk_in_allowed ? tr('facility.walkInAllowed') : null,
      ]}
      trailing={
        availability ? (
          <StatusBadge
            status={availability}
            tone={availabilityTone(availability)}
            size="sm"
            label={tr(`facility.availability.${normalizeStatus(availability)}`, {
              defaultValue: formatLabel(availability),
            })}
          />
        ) : undefined
      }
      divider={divider}
    />
  );
}

/** One published day of opening hours, with today picked out. */
function HourRow({
  hour,
  isToday,
  divider,
  language,
  tr,
  todayColor,
}: {
  hour: CareFacilityHour;
  isToday: boolean;
  divider: boolean;
  language: string;
  tr: Translate;
  todayColor: string;
}) {
  const day = weekdayLabel(hour.day_of_week, language);
  return (
    <InfoRow
      icon="clock"
      tint={isToday ? 'blue' : 'purple'}
      label={isToday ? `${day} · ${tr('facility.todayLabel')}` : day}
      value={
        hour.is_24_hours
          ? tr('facility.open24')
          : hour.is_closed
            ? tr('facility.closed')
            : `${trimTime(hour.opens_at) ?? '—'} – ${trimTime(hour.closes_at) ?? '—'}`
      }
      valueColor={isToday ? todayColor : undefined}
      divider={divider}
    />
  );
}

type HourGroup = { context: string | null; rows: CareFacilityHour[] };

/**
 * `GET /mobile/facilities/{id}`, with the register link it now reports.
 *
 * `CareFacilityDetail` in lib/api/queries.ts predates these fields and is
 * shared with the booking wizard, so the extra shape is declared here. Every
 * field is optional: against an older API build the connectivity card simply
 * does not render, rather than rendering a guess.
 */
type ConnectedFacilityDetail = CareFacilityDetail & {
  /** Internal `facilities` id, or null when this listing has no tenant. */
  facility_id?: string | null;
  /** `facility_id !== null` — whether care can actually happen here. */
  connected?: boolean;
  provider_count?: number;
  open_slot_count?: number;
  /** One translated sentence, authored server-side so EN/FR stay in step. */
  connectivity_note?: string;
};

/** `GET /mobile/facilities/{id}/providers`, with the reason for an empty list. */
type FacilityRoster = {
  facility_id: string | null;
  data: FacilityProviderSummary[];
  connected?: boolean;
  roster_status?: 'not_connected' | 'none_published' | 'published';
  provider_count?: number;
  open_slot_count?: number;
  message?: string;
};

export default function FacilityDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ id?: string }>();
  const facilityId = typeof params.id === 'string' && params.id ? params.id : undefined;

  // The shared care helpers take a plain `(key, params) => string`; i18next's
  // `t` is that, minus its overload noise.
  const tr: Translate = (key, options) => String(t(key, options));

  /**
   * MED-04 draws the selected pharmacy's actions as a Call | Directions |
   * Website tile row. "Directions" here scrolls to the embedded map further
   * down rather than handing off to an external maps app — the CSP blocks
   * outbound map hosts, and this screen has deliberately never carried an
   * external maps link.
   */
  const scrollRef = useRef<ScrollView>(null);
  const mapY = useRef(0);
  const jumpToMap = () =>
    scrollRef.current?.scrollTo({ y: Math.max(0, mapY.current - 8), animated: true });

  const facilityQuery = useFacilityDetail(facilityId);
  const providersQuery = useFacilityProviders(facilityId);
  const slotsQuery = useFacilitySlots(facilityId);

  const facility = facilityQuery.data as ConnectedFacilityDetail | undefined;
  const roster = providersQuery.data as FacilityRoster | undefined;
  const providers = roster?.data ?? [];
  const insurances = facility?.insurances ?? [];
  const services = facility?.services ?? [];

  /**
   * Is this listing joined to an operational facility?
   *
   * Prefer what the detail endpoint states outright; fall back to the roster
   * response's `facility_id`, which has carried the same fact all along. When
   * neither is present (an older API) the value is undefined and the
   * connectivity card is skipped rather than guessed.
   */
  const connected: boolean | undefined =
    facility?.connected ?? (roster ? roster.facility_id !== null : undefined);
  const rosterStatus =
    roster?.roster_status ??
    (roster
      ? roster.facility_id === null
        ? 'not_connected'
        : roster.data.length > 0
          ? 'published'
          : 'none_published'
      : undefined);

  const hours = useMemo(
    () =>
      [...(facility?.hours ?? [])].sort(
        (a: CareFacilityHour, b: CareFacilityHour) => a.day_of_week - b.day_of_week,
      ),
    [facility?.hours],
  );

  /**
   * `care_facility_hours.service_context` splits a facility's week into
   * separately-published timetables ("emergency", "pharmacy", "outpatient").
   * Rows with no context are the facility's general hours and lead the list;
   * every other context gets its own labelled block rather than being silently
   * interleaved with — or dropped in favour of — the general week.
   */
  const hourGroups = useMemo<HourGroup[]>(() => {
    const groups = new Map<string, HourGroup>();
    for (const hour of hours) {
      const key = hour.service_context?.trim() ?? '';
      const existing = groups.get(key);
      if (existing) existing.rows.push(hour);
      else groups.set(key, { context: key || null, rows: [hour] });
    }
    return [...groups.values()].sort((a, b) => {
      if (a.context === null) return -1;
      if (b.context === null) return 1;
      return a.context.localeCompare(b.context);
    });
  }, [hours]);

  /** Today's open/closed state reads the general week, never an ER-only row. */
  const generalHours = useMemo(() => {
    const general = hours.filter((hour) => !hour.service_context);
    return general.length > 0 ? general : hours;
  }, [hours]);

  const openState = useMemo<OpenState>(() => openStateToday(generalHours), [generalHours]);
  const todayIndex = new Date().getDay();

  // Round-the-clock cover, derived from the published week — not asserted.
  const allWeek24 = generalHours.length >= 7 && generalHours.every((hour) => !!hour.is_24_hours);
  const some24 = !allWeek24 && hours.some((hour) => !!hour.is_24_hours);

  const address = facility
    ? joinLocationParts(facility.address, facility.city, facility.region)
    : '';
  const hasCoords = facility?.latitude != null && facility?.longitude != null;

  /**
   * The register stores the literal string `"N/A"` where a facility publishes
   * no number — 1 840 of its 2 728 rows do. Testing the field for truthiness
   * therefore answered "yes, there is a phone" for two thirds of the directory
   * and the Call action dialled `tel:NA`, which does nothing. Both numbers go
   * through the one predicate; everything below reads these, never the raw
   * field.
   */
  const phonePrimary = usablePhone(facility?.phone_primary);
  const phoneSecondary = usablePhone(facility?.phone_secondary);

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  /* ── Bookability, read straight off the slots endpoint ─────────────── */
  const slots = slotsQuery.data?.data ?? [];
  const isLinkedForBooking = !!slotsQuery.data?.facility_id;
  const nextSlot = slots.length > 0 ? slots[0] : null;
  const inlineSlots = slots.slice(0, MAX_INLINE_SLOTS);

  /** `AppointmentSlotOption.provider_id` is a users.id — the same id the
   *  provider directory keys on, so a slot can name its clinician with no
   *  extra round trip. Absent from the map ⇒ the slot names no one. */
  const providerById = useMemo(
    () => new Map<string, FacilityProviderSummary>(providers.map((p) => [p.id, p])),
    [providers],
  );

  const nextSlotLabel = nextSlot
    ? new Date(nextSlot.starts_at).toLocaleString(i18n.language === 'fr' ? 'fr-FR' : 'en-US', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  /* ── Actions — every one the previous screen offered survives ──────── */
  const goToBooking = () => {
    if (!facility) return;
    router.push({ pathname: '/appointments/book', params: { facilityId: facility.id } });
  };

  const callFacility = () => {
    const url = telUrl(phonePrimary);
    if (url) openUrl(url);
  };

  const emailFacility = () => {
    if (facility?.email) openUrl(`mailto:${facility.email}`);
  };

  const openWebsite = () => {
    if (facility?.website) openUrl(websiteUrl(facility.website));
  };

  const shareFacility = () => {
    if (!facility) return;
    // Sharing "CHU de Yaoundé · Yaoundé · N/A" would pass the placeholder off
    // as a number to whoever receives it.
    const line = [facility.facility_name, address, phonePrimary].filter(Boolean).join(' · ');
    Share.share({ message: line }).catch(() => {});
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  };

  const findCareNearby = () => router.replace('/care-map');

  const refreshAll = () => {
    facilityQuery.refetch();
    providersQuery.refetch();
    slotsQuery.refetch();
  };

  const professionLabel = (value: string | null): string | null => {
    if (!value) return null;
    const key = PROFESSION_KEYS[value];
    return key ? t(key) : formatLabel(value);
  };

  const employmentLabel = (value: string | null): string | null => {
    if (!value) return null;
    const key = EMPLOYMENT_KEYS[value];
    return key ? t(key) : formatLabel(value);
  };

  const slotSubtitle = (slot: AppointmentSlotOption): (string | null)[] => {
    const provider = slot.provider_id ? providerById.get(slot.provider_id) : undefined;
    return [
      slotDayLabel(slot.starts_at, i18n.language),
      provider?.name ?? null,
      slot.available_count > 0
        ? tr('facility.booking.slotPlaces', {
            seats: slot.available_count,
            defaultValue: '{{seats}} places left',
          })
        : null,
    ];
  };

  const headerSubtitle = t('facility.profileSubtitle', {
    defaultValue: 'Details, services, clinicians and opening hours.',
  });

  /* ── State 1 — no id in the route, or the directory has no such row ── */
  const isNotFound =
    !facilityId ||
    (axios.isAxiosError(facilityQuery.error) && facilityQuery.error.response?.status === 404);

  if (isNotFound) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={t('facility.title')} onBack={goBack} />
        <View style={styles.center}>
          <EmptyState
            icon="building"
            tint="blue"
            title={t('facility.notFoundTitle', { defaultValue: 'This facility is no longer listed.' })}
            message={t('facility.notFoundBody', {
              defaultValue:
                'It may have been removed from the national register, or the link you followed may be out of date. You can browse the facilities near you instead.',
            })}
            actionLabel={t('facility.findAnother', { defaultValue: 'Find care nearby' })}
            onAction={findCareNearby}
          />
        </View>
      </Screen>
    );
  }

  /* ── State 2 — first load ───────────────────────────────────────────── */
  if (facilityQuery.isLoading) {
    return (
      <Screen className="px-0">
        <ScreenHeader title={t('facility.title')} subtitle={headerSubtitle} onBack={goBack} />
        <LoadingBlock label={t('facility.loading', { defaultValue: 'Loading facility…' })} />
      </Screen>
    );
  }

  /* ── State 3 — the load failed (offline, timeout, 5xx) ──────────────── */
  if (facilityQuery.isError || !facility) {
    const failure = describeFailure(facilityQuery.error, t('facility.loadError'));
    return (
      <Screen className="px-0">
        <ScreenHeader title={t('facility.title')} onBack={goBack} />
        <View style={styles.center}>
          <EmptyState
            icon="alert-circle"
            tint="red"
            title={t('facility.loadErrorTitle', { defaultValue: 'Facility unavailable' })}
            message={failure.message}
            actionLabel={t('facility.retry')}
            onAction={() => facilityQuery.refetch()}
          />
        </View>
      </Screen>
    );
  }

  /* ── State 4 — loaded. Every section below owns its own empty state. ── */

  const typeLabel = t(`careMap.types.${facility.facility_type}`, {
    defaultValue: formatLabel(facility.facility_type),
  });

  const ownershipLabel = facility.ownership_type
    ? t(`facility.ownership.${facility.ownership_type}`, {
        defaultValue: formatLabel(facility.ownership_type),
      })
    : null;

  // "Facility information" — one row per scalar the payload actually carries.
  const infoRows: { key: string; icon: IconName; tint?: Tint; label: string; value: string }[] = [
    {
      key: 'type',
      icon: facilityTypeIcon(facility.facility_type),
      label: t('facility.typeLabel', { defaultValue: 'Facility type' }),
      value: typeLabel,
    },
  ];
  if (ownershipLabel) {
    infoRows.push({
      key: 'ownership',
      icon: 'building',
      label: t('facility.ownershipLabel', { defaultValue: 'Ownership' }),
      value: ownershipLabel,
    });
  }
  // Most registry rows have no street address and fall back to the city, so an
  // "Address" row that just repeats the city below it would present one fact as
  // two. Compared accent-insensitively, the way the directory itself compares.
  const streetAddress = facility.address?.trim() ?? '';
  const showStreet =
    !!streetAddress &&
    normalizeText(streetAddress) !== normalizeText(facility.city ?? '') &&
    normalizeText(streetAddress) !== normalizeText(facility.region ?? '');
  if (showStreet) {
    infoRows.push({
      key: 'street',
      icon: 'location',
      label: t('facility.addressLabel', { defaultValue: 'Address' }),
      value: streetAddress,
    });
  }
  if (facility.city?.trim()) {
    infoRows.push({
      key: 'city',
      icon: 'location',
      label: t('facility.cityLabel', { defaultValue: 'City' }),
      value: facility.city.trim(),
    });
  }
  if (facility.region?.trim()) {
    infoRows.push({
      key: 'region',
      icon: 'location',
      label: t('facility.regionLabel', { defaultValue: 'Region' }),
      value: facility.region.trim(),
    });
  }
  // Derived from the published week only — never claimed when no hours exist.
  if (allWeek24 || some24) {
    infoRows.push({
      key: 'roundTheClock',
      icon: 'clock',
      tint: 'green',
      label: t('facility.roundTheClockLabel', { defaultValue: 'Round-the-clock' }),
      value: allWeek24
        ? t('opesCare.facilityProfile.emergency247')
        : t('facility.roundTheClockSomeDays', { defaultValue: '24 hours on some days' }),
    });
  }
  // `care_facilities.integration_status` is `none | connected | read_only` —
  // whether a visit here reaches the patient's OpesCare record. It is a
  // different question from whether the facility's appointment calendar is
  // linked (that is the booking card above, read live off the slots endpoint),
  // so it is labelled as record sharing and never as "bookable".
  if (facility.integration_status) {
    const integration = normalizeStatus(facility.integration_status);
    infoRows.push({
      key: 'integration',
      icon: 'shield',
      tint: integration === 'none' ? 'amber' : 'green',
      label: t('facility.integrationLabel', { defaultValue: 'Record sharing' }),
      value: t(`facility.integration.${integration}`, {
        defaultValue: formatLabel(facility.integration_status),
      }),
    });
  }

  const contactRows = [
    phonePrimary
      ? {
          key: 'phone',
          icon: 'phone' as IconName,
          title: t('facility.phone'),
          value: phonePrimary,
          onPress: callFacility,
        }
      : null,
    phoneSecondary
      ? {
          key: 'phone2',
          icon: 'phone' as IconName,
          title: t('facility.phoneSecondary', { defaultValue: 'Alternative phone' }),
          value: phoneSecondary,
          onPress: () => {
            const url = telUrl(phoneSecondary);
            if (url) openUrl(url);
          },
        }
      : null,
    facility.email
      ? {
          key: 'email',
          icon: 'mail' as IconName,
          title: t('facility.email'),
          value: facility.email,
          onPress: emailFacility,
        }
      : null,
    facility.website
      ? {
          key: 'website',
          icon: 'globe' as IconName,
          title: t('facility.website'),
          value: facility.website,
          onPress: openWebsite,
        }
      : null,
  ].filter((row): row is NonNullable<typeof row> => row !== null);

  /**
   * When the register carries no number, the phone row says so rather than
   * vanishing — but only if the facility publishes *something* else, because a
   * card holding a single "Not listed" line reads worse than the "no contact
   * details published" empty state below. The row has no `onPress`, so
   * `ListRow` renders it flat: no chevron, nothing to tap, nothing to dial.
   */
  const showPhoneMissingRow = !phonePrimary && contactRows.length > 0;
  const renderedContactRows = showPhoneMissingRow
    ? [
        {
          key: 'phone',
          icon: 'phone' as IconName,
          title: t('facility.phone'),
          value: t('facility.phoneNotListed'),
          onPress: undefined,
        },
        ...contactRows,
      ]
    : contactRows;

  const refreshing =
    facilityQuery.isRefetching || providersQuery.isRefetching || slotsQuery.isRefetching;

  return (
    <Screen className="px-0">
      <ScreenHeader title={t('facility.title')} subtitle={headerSubtitle} onBack={goBack} />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshAll}
            tintColor={colors.blue}
            colors={[colors.blue]}
          />
        }
      >
        {/* ── Identity ──────────────────────────────────────────────── */}
        <Card>
          <View style={styles.identity}>
            <View style={styles.thumb}>
              <Icon name={facilityTypeIcon(facility.facility_type)} size={34} color={colors.blue} />
            </View>
            <View style={styles.identityBody}>
              <Text style={styles.name} numberOfLines={3} accessibilityRole="header">
                {facility.facility_name}
              </Text>
              <View style={styles.tagRow}>
                <StatusBadge
                  status={facility.facility_type}
                  tone="neutral"
                  size="sm"
                  label={typeLabel}
                />
                {ownershipLabel ? (
                  <StatusBadge
                    status={facility.ownership_type as string}
                    tone="neutral"
                    size="sm"
                    label={ownershipLabel}
                  />
                ) : null}
                {allWeek24 ? (
                  <StatusBadge
                    status="open"
                    tone="normal"
                    size="sm"
                    icon="clock"
                    label={t('opesCare.facilityProfile.emergency247')}
                  />
                ) : null}
              </View>
              {address ? (
                <View style={styles.metaRow}>
                  <Icon name="location" size={16} color={colors.textSecondary} />
                  <Text style={styles.meta}>{address}</Text>
                </View>
              ) : null}
              <OpenStateBadge state={openState} />
            </View>
          </View>

          <View style={styles.actions}>
            <CircleAction
              icon="phone"
              label={t('facility.callAction')}
              disabled={!phonePrimary}
              // Dimmed is not self-explanatory: the hint says why, so a screen
              // reader announces "no phone number listed" instead of leaving
              // the action mysteriously unavailable.
              hint={phonePrimary ? undefined : t('facility.phoneNotListedHint')}
              onPress={callFacility}
            />
            {/* MED-04's middle tile. Dimmed — with a spoken reason — when the
                register holds no coordinates, because there is then nothing to
                scroll to. */}
            <CircleAction
              icon="send"
              label={t('facility.directionsAction', { defaultValue: 'Directions' })}
              disabled={!hasCoords}
              hint={
                hasCoords
                  ? t('facility.directionsHint', {
                      defaultValue: 'Shows this facility on the map further down the page.',
                    })
                  : t('facility.directionsUnavailableHint', {
                      defaultValue: 'No map coordinates are published for this facility.',
                    })
              }
              onPress={jumpToMap}
            />
            <CircleAction
              icon="mail"
              label={t('facility.email')}
              disabled={!facility.email}
              onPress={emailFacility}
            />
            <CircleAction
              icon="globe"
              label={t('facility.website')}
              disabled={!facility.website}
              onPress={openWebsite}
            />
            <CircleAction
              icon="share"
              label={t('opesCare.facilityProfile.share')}
              onPress={shareFacility}
            />
          </View>
        </Card>

        {/* ── Which register is this listing in? ─────────────────────
            First thing under the identity block, because it governs every
            action below it. `connectivity_note` is authored server-side so
            the EN and FR wording stay in step with the facility_registry
            language files; the local defaults only cover an older API
            build that does not send the note. */}
        {connected !== undefined && (
          <NoticeBanner
            tone={connected ? 'normal' : 'pending'}
            icon={connected ? 'shield-check' : 'building'}
            title={
              connected
                ? t('facilityRegistry.connectedTitle', { defaultValue: 'Connected to OpesCare' })
                : t('facilityRegistry.directoryOnlyTitle', {
                    defaultValue: 'Public directory listing',
                  })
            }
            message={
              facility.connectivity_note ??
              (connected
                ? t('facilityRegistry.connectedFallback', {
                    defaultValue:
                      'This facility is on OpesCare, so it can publish clinicians and take online bookings.',
                  })
                : t('facilityRegistry.directoryOnlyFallback', {
                    defaultValue:
                      'This place is in the public directory only. It has not joined OpesCare, so it publishes no clinicians and cannot take an online booking. You can still call it directly.',
                  }))
            }
          />
        )}

        {/* ── Appointments: state of the real slot link ─────────────── */}
        <View>
          <SectionHeader title={t('facility.booking.title')} variant="overline" />
          <Card>
            {slotsQuery.isLoading ? (
              <View style={styles.checking} accessibilityLiveRegion="polite">
                <ActivityIndicator size="small" color={colors.blue} />
                <Text style={styles.checkingText}>{t('facility.booking.checking')}</Text>
              </View>
            ) : slotsQuery.isError ? (
              <View style={styles.stack}>
                <NoticeBanner
                  tone="warning"
                  icon="alert-triangle"
                  message={t('facility.booking.errorBody')}
                />
                <CareButton
                  variant="secondary"
                  icon="refresh"
                  label={t('facility.retry')}
                  onPress={() => slotsQuery.refetch()}
                />
                {phonePrimary ? (
                  <CareButton
                    variant="ghost"
                    icon="phone"
                    label={t('facility.booking.callInstead')}
                    onPress={callFacility}
                  />
                ) : null}
              </View>
            ) : !isLinkedForBooking ? (
              <View style={styles.stack}>
                <NoticeBanner
                  tone="pending"
                  icon="info"
                  title={t('facility.booking.unavailableTitle')}
                  message={t('facility.booking.unavailableBody')}
                />
                {phonePrimary ? (
                  <CareButton
                    variant="secondary"
                    icon="phone"
                    label={t('facility.booking.callInstead')}
                    onPress={callFacility}
                  />
                ) : null}
              </View>
            ) : slots.length === 0 ? (
              <View style={styles.stack}>
                <NoticeBanner
                  tone="pending"
                  icon="clock"
                  title={t('facility.booking.noSlotsTitle')}
                  message={t('facility.booking.noSlotsBody')}
                />
                <CareButton
                  variant="secondary"
                  icon="calendar"
                  label={t('facility.booking.checkDates')}
                  onPress={goToBooking}
                />
              </View>
            ) : (
              <View style={styles.stack}>
                <NoticeBanner
                  tone="normal"
                  icon="shield-check"
                  title={t('facility.booking.availableTitle')}
                  // Deliberately not named `count`: that key triggers
                  // i18next's plural resolution, which would look for
                  // `availableBody_one` / `_other` instead of this key.
                  message={t('facility.booking.availableBody', {
                    slotCount: slots.length,
                    when: nextSlotLabel ?? '',
                  })}
                />
                <View style={styles.slotList}>
                  {inlineSlots.map((slot, index) => (
                    <ListRow
                      key={slot.id}
                      icon="clock"
                      tint="blue"
                      title={`${formatTime(slot.starts_at)} – ${formatTime(slot.ends_at)}`}
                      meta={slotSubtitle(slot)}
                      onPress={goToBooking}
                      accessibilityHint={t('doctor.nextSlotsHint')}
                      divider={index < inlineSlots.length - 1}
                    />
                  ))}
                </View>
                <GradientButton
                  label={t('facility.bookHere')}
                  onPress={goToBooking}
                  accessibilityHint={t('doctor.nextSlotsHint')}
                />
              </View>
            )}
          </Card>
        </View>

        {/* ── Where it is: embedded, in-app map (no external maps app) ─ */}
        <View onLayout={(event) => (mapY.current = event.nativeEvent.layout.y)}>
          <SectionHeader title={t('opesCare.facilityProfile.location')} variant="overline" />
          {hasCoords ? (
            <Card variant="flush">
              <FacilityMap
                facilities={{
                  id: facility.id,
                  name: facility.facility_name,
                  latitude: facility.latitude,
                  longitude: facility.longitude,
                  city: facility.city,
                  region: facility.region,
                  type: facility.facility_type,
                  phone: phonePrimary,
                }}
                height={200}
                directions
              />
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon="location"
                tint="amber"
                title={t('facility.noLocationTitle', { defaultValue: 'No map location published' })}
                message={
                  address
                    ? t('facility.noLocationBodyWithAddress', {
                        address,
                        defaultValue:
                          'The register lists this facility at {{address}} but has no map coordinates for it, so it cannot be shown on the map.',
                      })
                    : t('facility.noLocationBody', {
                        defaultValue:
                          'The national register holds no map coordinates for this facility.',
                      })
                }
              />
            </Card>
          )}
        </View>

        {/* ── About ─────────────────────────────────────────────────── */}
        {facility.description?.trim() ? (
          <View>
            <SectionHeader title={t('facility.aboutTitle')} variant="overline" />
            <Card>
              <Text style={styles.about}>{facility.description.trim()}</Text>
            </Card>
          </View>
        ) : null}

        {/* ── Facility information ──────────────────────────────────── */}
        <View>
          <SectionHeader
            title={t('facility.informationTitle', { defaultValue: 'Facility information' })}
            variant="overline"
          />
          <Card variant="flush">
            <View style={styles.rowsPad}>
              {infoRows.map((row, index) => (
                <InfoRow
                  key={row.key}
                  icon={row.icon}
                  tint={row.tint ?? 'blue'}
                  label={row.label}
                  value={row.value}
                  divider={index < infoRows.length - 1}
                />
              ))}
            </View>
          </Card>
        </View>

        {/* ── Doctors & specialists ─────────────────────────────────── */}
        <View>
          <SectionHeader
            title={
              providers.length > 0
                ? `${t('facility.doctorsTitle')} (${providers.length})`
                : t('facility.doctorsTitle')
            }
            variant="overline"
          />
          {providersQuery.isLoading ? (
            <Card>
              <View style={styles.checking} accessibilityLiveRegion="polite">
                <ActivityIndicator size="small" color={colors.blue} />
                <Text style={styles.checkingText}>{t('facility.doctorsSubtitle')}</Text>
              </View>
            </Card>
          ) : providersQuery.isError ? (
            <Card>
              <EmptyState
                icon="alert-circle"
                tint="red"
                title={t('facility.loadDoctorsError')}
                actionLabel={t('facility.retry')}
                onAction={() => providersQuery.refetch()}
              />
            </Card>
          ) : providers.length === 0 ? (
            // Empty for three different reasons, and the patient deserves to
            // know which. `roster.message` is the server's own translated
            // sentence; `facility.doctorsSubtitle` is the pre-existing generic
            // fallback for an API build that does not send one.
            <Card>
              <EmptyState
                icon={rosterStatus === 'not_connected' ? 'building' : 'stethoscope'}
                tint={rosterStatus === 'not_connected' ? 'amber' : undefined}
                title={
                  rosterStatus === 'not_connected'
                    ? t('facilityRegistry.directoryOnlyTitle', {
                        defaultValue: 'Public directory listing',
                      })
                    : t('facility.noDoctors')
                }
                message={roster?.message ?? t('facility.doctorsSubtitle')}
              />
            </Card>
          ) : (
            /* Clinicians are people to compare and choose between, so each
               gets its own card and the gap separates them. The fact tables
               further down this screen stay flush. */
            <ResultList>
              {providers.map((provider) => {
                const registered =
                  provider.credentials.length > 0 || provider.licenses.length > 0;
                return (
                  <Card key={provider.id} variant="flush">
                    <ListRow
                      leading={<ProviderAvatar name={provider.name} size={44} />}
                      title={provider.name}
                      meta={[
                        provider.job_title,
                        provider.department,
                        professionLabel(provider.profession),
                        employmentLabel(provider.employment_type),
                      ]}
                      trailing={
                        registered ? (
                          // Only shown when the registry really holds an active
                          // licence or credential for this person.
                          <StatusBadge
                            status="verified"
                            icon="shield-check"
                            size="sm"
                            label={t('opesCore.common.verified')}
                          />
                        ) : undefined
                      }
                      onPress={() => router.push(`/doctor/${provider.id}`)}
                      accessibilityHint={t('facility.viewClinician', {
                        defaultValue: "Opens this clinician's profile",
                      })}
                      divider={false}
                    />
                  </Card>
                );
              })}
            </ResultList>
          )}
        </View>

        {/* ── Services ──────────────────────────────────────────────── */}
        <View>
          <SectionHeader
            title={
              services.length > 0
                ? `${t('facility.servicesTitle')} (${services.length})`
                : t('facility.servicesTitle')
            }
            variant="overline"
          />
          {services.length === 0 ? (
            <Card>
              <EmptyState icon="clipboard" title={t('facility.noServices')} />
            </Card>
          ) : (
            <Card variant="flush">
              {services.map((service, index) => (
                <ServiceRow
                  key={`${service.service_name}-${index}`}
                  service={service}
                  divider={index < services.length - 1}
                  tr={tr}
                />
              ))}
            </Card>
          )}
        </View>

        {/* ── Opening hours ─────────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('facility.hoursTitle')} variant="overline" />
          {hourGroups.length === 0 ? (
            <Card>
              <EmptyState icon="clock" title={t('facility.hoursUnknown')} />
            </Card>
          ) : (
            <View style={styles.groupStack}>
              {hourGroups.map((group) => (
                <View key={group.context ?? 'general'}>
                  {group.context ? (
                    <Text style={styles.groupLabel}>
                      {t(`facility.hoursContext.${normalizeStatus(group.context)}`, {
                        defaultValue: formatLabel(group.context),
                      })}
                    </Text>
                  ) : null}
                  <Card variant="flush">
                    <View style={styles.rowsPad}>
                      {group.rows.map((hour, index) => (
                        <HourRow
                          key={`${group.context ?? 'general'}-${hour.day_of_week}-${index}`}
                          hour={hour}
                          isToday={hour.day_of_week === todayIndex}
                          divider={index < group.rows.length - 1}
                          language={i18n.language}
                          tr={tr}
                          todayColor={colors.link}
                        />
                      ))}
                    </View>
                  </Card>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Accepted insurance ────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('facility.insurancesTitle')} variant="overline" />
          {insurances.length > 0 ? (
            <Text style={styles.hint}>{t('facility.insurancesSubtitle')}</Text>
          ) : null}
          {insurances.length === 0 ? (
            <Card>
              <EmptyState
                icon="wallet"
                title={t('facility.noInsurances', {
                  defaultValue: 'No insurance cover published for this facility.',
                })}
              />
            </Card>
          ) : (
            <Card variant="flush">
              {insurances.map((insurance, index) => {
                const status = insurance.status?.trim();
                return (
                  <ListRow
                    key={`${insurance.insurance_name}-${index}`}
                    icon="shield-check"
                    tint="green"
                    title={insurance.insurance_name}
                    meta={[
                      status
                        ? t(`facility.insuranceStatus.${normalizeStatus(status)}`, {
                            defaultValue: formatLabel(status),
                          })
                        : null,
                      insurance.cashless_available === false
                        ? t('facility.insuranceNoCashless', {
                            defaultValue: 'Pay and claim back',
                          })
                        : null,
                    ]}
                    trailing={
                      insurance.cashless_available ? (
                        <StatusBadge
                          status="cashless"
                          tone="normal"
                          size="sm"
                          label={t('facility.insuranceCashless')}
                        />
                      ) : undefined
                    }
                    divider={index < insurances.length - 1}
                  />
                );
              })}
            </Card>
          )}
        </View>

        {/* ── Contact ───────────────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('facility.contactTitle')} variant="overline" />
          {renderedContactRows.length === 0 ? (
            <Card>
              <EmptyState
                icon="phone"
                title={t('facility.noContact', {
                  defaultValue: 'No contact details published for this facility.',
                })}
              />
            </Card>
          ) : (
            <Card variant="flush">
              {renderedContactRows.map((row, index) => (
                <ListRow
                  key={row.key}
                  icon={row.icon}
                  title={row.title}
                  subtitle={row.value}
                  onPress={row.onPress}
                  divider={index < renderedContactRows.length - 1}
                />
              ))}
            </Card>
          )}
        </View>

        <Text style={styles.note}>{t('facility.directoryNote')}</Text>
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { flex: 1 },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    center: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, gap: spacing.sm },

    identity: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md - 2 },
    thumb: {
      width: 82,
      height: 82,
      borderRadius: radii.md,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    identityBody: { flex: 1, minWidth: 0, gap: 6 },
    name: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      lineHeight: typography.lineHeight.lg,
      color: colors.textPrimary,
    },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    meta: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },

    // Five tiles at 375pt: each takes an equal share rather than
    // `space-around`, so "Directions" and "Website" keep their labels on one
    // line instead of one wide tile squeezing its neighbours.
    actions: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    action: { flex: 1, alignItems: 'center', gap: 6 },
    actionOff: { opacity: 0.4 },
    actionCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // 11pt, not `size.xs`: five equal tiles give each ~62pt at 375pt, and
    // "Directions" does not fit that at 12pt. Never `adjustsFontSizeToFit` —
    // it is iOS-only and clips silently elsewhere.
    actionLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      lineHeight: 14,
      textAlign: 'center',
      color: colors.textPrimary,
    },

    about: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },

    checking: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, paddingVertical: 2 },
    checkingText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    stack: { gap: spacing.md },
    groupStack: { gap: spacing.sm + 2 },

    // Inline slot rows sit inside a padded booking Card, so they claw the
    // card's 16px inset back to reach the same edge-to-edge rhythm the
    // `variant="flush"` list cards have.
    slotList: { marginHorizontal: -spacing.md },

    rowsPad: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },

    groupLabel: {
      marginBottom: 6,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },

    hint: {
      marginTop: -4,
      marginBottom: 10,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },

    note: {
      marginTop: spacing.sm,
      textAlign: 'center',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
  });
