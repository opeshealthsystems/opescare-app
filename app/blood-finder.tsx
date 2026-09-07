import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { FacilityMap } from '@/components/map/FacilityMap';
import {
  Card,
  Chip,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  PillInput,
  PulseLogo,
  ResultList,
  ScreenHeader,
  SectionHeader,
  Wordmark,
  StaleNotice,
  StatusBadge,
  formatDateTime,
  formatLabel,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
  type ScreenHeaderAction,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock, NoticeBanner, SummaryLine } from '@/components/care/shared';
import { useAuthStore } from '@/lib/store/auth';
import { useNationwideBloodSearch } from '@/lib/api/bloodQueries';
import { useBloodComponentMatrix, CARD_COMPONENTS } from '@/lib/api/bloodBankQueries';
import {
  useBloodOptions,
  useBloodRequests,
  useBloodSearch,
  useCancelBloodRequest,
  type BloodBankResult,
  type BloodComponentValue,
  type BloodGroupOption,
  type BloodGroupValue,
  type BloodRequest,
  type BloodStockSnapshot,
} from '@/lib/api/queries';

/**
 * Blood Finder — pick a blood group + component, see which facilities near the
 * chosen origin report units as available, then request (reserve) some.
 *
 * Presentation: the OPES kit (`ScreenHeader` → group/component/where `Chip`s →
 * `PillInput` filter → results as `Card variant="flush"` + `ListRow`s with the
 * spec's RED tint circle (§1: red = critical / blood) → the embedded
 * `FacilityMap` → `EmptyState` recoveries → safety strip), in the app's own
 * `opescare` palette, read from `useTheme()`. There is no OPES source screen
 * for blood, so the layout follows the finder archetype the kit already has:
 * `app/pharmacy.tsx` (search + filters + nearby facilities + map + reserve) and
 * `app/care-map.tsx` (facility list + map + device location).
 *
 * The data layer is untouched: `useBloodOptions`, `useBloodSearch`,
 * `useNationwideBloodSearch`, `useBloodRequests`, `useCancelBloodRequest`.
 *
 * This screen is used by someone who is frightened and in a hurry, so it stays
 * laid out as three numbered steps in the order a person actually thinks:
 * *what group*, *what component*, *where*.
 *
 * ── Why the badge is freshness, not "Available" ─────────────────────────────
 * MobileBloodController::search() runs through
 * BloodAvailability::scopeAvailable(), so `availability.status` is 'available'
 * on EVERY row it can ever return. A green "Available" pill on every card is
 * therefore decoration that reads as certainty, and this is the one screen
 * where false certainty costs the most. The trailing badge carries
 * `availability.freshness` instead — the field that actually varies (the
 * projector stamps fresh ≤2 h, recent ≤6 h, stale beyond) — and every card
 * prints `last_updated_at` in full. The status word is still shown, worded as
 * the report it is ("Reported available"), never as a fact.
 *
 * ── On empty results ────────────────────────────────────────────────────────
 * `blood_availability` is facility-self-reported and, behind
 * `scopeReportedByRealSource()`, frequently empty, so "no results" is the
 * NORMAL outcome, not an edge case. It is therefore built as a first-class
 * screen state with real, working next steps — widen the radius, search the
 * whole country (a supported origin-less query), switch to a clinically
 * compatible group that *does* have reported stock, fall back to whole blood,
 * or go find a hospital to phone. Nothing here is faked: every number on this
 * screen came from the API.
 *
 * ── Two actions per bank, on purpose ────────────────────────────────────────
 * Unlike the pharmacy list (one row → one detail screen), each bank keeps both
 * "Call" and "Request units" on the list itself. The safety notice tells every
 * patient to phone before travelling; burying the number one screen deeper
 * would cost a tap at the worst possible moment.
 */

interface City {
  key: string;
  name: string;
  lat: number;
  lng: number;
}

const CITIES: City[] = [
  { key: 'douala', name: 'Douala', lat: 4.0511, lng: 9.7679 },
  { key: 'yaounde', name: 'Yaounde', lat: 3.848, lng: 11.5021 },
  { key: 'bafoussam', name: 'Bafoussam, Cameroon', lat: 5.4737, lng: 10.4179 },
  { key: 'bamenda', name: 'Bamenda, Cameroon', lat: 5.9631, lng: 10.1591 },
  { key: 'buea', name: 'Buea, Cameroon', lat: 4.1527, lng: 9.292 },
  { key: 'garoua', name: 'Garoua, Cameroon', lat: 9.3017, lng: 13.3921 },
];

/**
 * Blood travels further than a pharmacy trip — the radii start wider.
 * MobileBloodController::MAX_RADIUS_KM is 200, so none of these is refused.
 */
const RADIUS_OPTIONS = [10, 25, 50, 100];

/**
 * MobileBloodController::search() defaults `limit` to 25 and `useBloodSearch`
 * sends none, so a full page of results may be a truncated one. Said out loud
 * below rather than left for the patient to assume they saw everything.
 */
const LOCAL_RESULT_LIMIT = 25;

/** Nationwide sweep rows shown inline before the "show all" toggle. */
const NATIONWIDE_PREVIEW = 5;

/** The backed values of App\Enums\BloodComponentType, in display order. */
const COMPONENT_FALLBACK: BloodComponentValue[] = [
  'whole_blood',
  'red_cells',
  'platelets',
  'plasma',
];

/**
 * Maps the `icon` key App\Enums\BloodComponentType returns onto a kit glyph.
 * The kit has no `circle-dot` or `hexagon`; `target` and `shield` stand in.
 */
const COMPONENT_ICONS: Record<string, IconName> = {
  droplet: 'droplet',
  'circle-dot': 'target',
  hexagon: 'shield',
  'flask-conical': 'flask',
};

/**
 * Kit glyph per `care_facilities.facility_type`, matching the map already used
 * on `app/care-map.tsx` so a blood bank carries the same mark on both screens.
 */
const FACILITY_TYPE_ICON: Record<string, IconName> = {
  hospital: 'building',
  clinic: 'stethoscope',
  health_center: 'first-aid',
  blood_bank: 'droplet',
  laboratory: 'flask',
};

const facilityIcon = (type: string | undefined): IconName =>
  FACILITY_TYPE_ICON[type ?? ''] ?? 'building';

/**
 * DESIGN_SPEC §1: red is the critical tint, and on this screen every row IS
 * blood — so the tint circle is red throughout rather than per facility type.
 */
const BLOOD_TINT: Tint = 'red';

/**
 * English fallbacks for the stock-status word. Deliberately phrased as a
 * report ("Reported available"), never as a fact: `availability_status` is
 * what the facility last told the projector, not what is in the fridge now.
 * (See the i18n note in the report — `bloodFinder.stock.*` does not exist yet.)
 */
const STOCK_FALLBACK: Record<string, string> = {
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
 * `blood_availability.freshness_status`, written by BloodAvailabilityProjector:
 * fresh ≤ 2 h, recent ≤ 6 h, stale beyond that (or never stamped). Anything
 * older than six hours is a caution, not a neutral fact.
 */
const FRESHNESS_TONE: Record<string, StatusTone> = {
  fresh: 'normal',
  recent: 'pending',
  stale: 'warning',
};

const freshnessRank = (value: string | null | undefined): number => {
  switch ((value ?? '').toLowerCase()) {
    case 'fresh':
      return 0;
    case 'recent':
      return 1;
    case 'stale':
      return 2;
    default:
      return 3;
  }
};

/**
 * `care_facilities.verification_status` is one of unverified / self_reported /
 * license_verified / government_verified. All four are shown, spelled out —
 * hiding "self_reported" behind the absence of a green badge tells the patient
 * nothing, and on a blood listing who checked the facility is part of the
 * answer.
 */
const VERIFICATION_FALLBACK: Record<string, string> = {
  government_verified: 'Government verified',
  license_verified: 'Licence verified',
  self_reported: 'Listed by the facility itself',
  unverified: 'Not verified',
};

function isVerified(status: string | null | undefined): boolean {
  return status === 'license_verified' || status === 'government_verified';
}

/** A tel: URI wants digits and a leading +, nothing else. */
const normaliseNumber = (value: string): string => value.replace(/[^+\d]/g, '');

function dial(number: string | null | undefined): void {
  if (!number) return;
  Linking.openURL(`tel:${normaliseNumber(number)}`).catch(() => undefined);
}

/** Pulls the backend's `error_code` out of an axios failure, if there is one. */
function errorCodeOf(error: unknown): string | null {
  const body = (error as { response?: { data?: { error_code?: string } } })?.response?.data;
  return body?.error_code ?? null;
}

/**
 * The numbers to try, most useful first, with `emergency_contact` and
 * `phone_primary` de-duplicated — MobileBloodController falls back to the
 * facility's main line when the availability row carries no emergency contact,
 * so the two fields are very often the same string.
 */
function phoneLines(
  facility: Pick<BloodBankResult, 'phone' | 'emergency_contact'>,
): { key: 'emergency' | 'main'; number: string }[] {
  const out: { key: 'emergency' | 'main'; number: string }[] = [];
  const push = (key: 'emergency' | 'main', value: string | null) => {
    const digits = value ? normaliseNumber(value) : '';
    if (!value || digits.length < 3) return;
    if (out.some((line) => normaliseNumber(line.number) === digits)) return;
    out.push({ key, number: value });
  };
  push('emergency', facility.emergency_contact);
  push('main', facility.phone);
  return out;
}

type SheetKey = 'city' | 'radius' | 'component' | 'group' | null;

/**
 * Urgency, as the reference finder card offers it (PM-BLOOD-01, step 3) and as
 * `POST api/mobile/blood/requests` already accepts it.
 *
 * Emergency leads because the screen exists for emergencies; the tones follow
 * the kit's semantic scale rather than the accent, so "routine" never borrows
 * the alarm colour.
 */
type UrgencyValue = 'emergency' | 'urgent' | 'routine';

const URGENCY_OPTIONS: { value: UrgencyValue; icon: IconName }[] = [
  { value: 'emergency', icon: 'alert-triangle' },
  { value: 'urgent', icon: 'clock' },
  { value: 'routine', icon: 'clock' },
];

/**
 * The four assurances the reference strips across the finder, under the search
 * card. Each one is a claim this platform can actually stand behind: screening
 * and verification are facility attributes the directory already carries, the
 * freshness stamp is on every stock row, and the privacy line is the Health ID
 * consent model. Nothing here is a number.
 */
const TRUST_POINTS: { key: string; icon: IconName }[] = [
  { key: 'screened', icon: 'shield-check' },
  { key: 'realtime', icon: 'clock' },
  { key: 'lives', icon: 'heart-pulse' },
  { key: 'private', icon: 'lock' },
];

export default function BloodFinderScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  const patient = useAuthStore((s) => s.patient);

  const [bloodGroup, setBloodGroup] = useState<BloodGroupValue | null>(null);
  const [componentType, setComponentType] = useState<BloodComponentValue>('whole_blood');
  const [city, setCity] = useState<City>(CITIES[0]);
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [radiusKm, setRadiusKm] = useState(25);
  // Step 3 of the reference finder card. It is carried into the request rather
  // than narrowing the search: a blood bank's reported stock does not change
  // with how urgently it is wanted, and filtering it by urgency would hide
  // units from the person who needs them most.
  const [urgency, setUrgency] = useState<UrgencyValue>('emergency');
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [sheet, setSheet] = useState<SheetKey>(null);
  const [nationwideOpen, setNationwideOpen] = useState(false);
  const [nationwideExpanded, setNationwideExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Lets the header's request badge jump straight to "My requests" instead of
  // making someone scroll a list of banks to reach the thing they already did.
  const scrollRef = useRef<ScrollView>(null);
  const requestsY = useRef(0);
  const resultsY = useRef(0);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedTerm(term.trim().toLowerCase()), 300);
    return () => clearTimeout(handle);
  }, [term]);

  // A nationwide sweep is opt-in per search — changing what is being looked for
  // makes the previous sweep's answer meaningless.
  useEffect(() => {
    setNationwideOpen(false);
    setNationwideExpanded(false);
  }, [bloodGroup, componentType]);

  const origin = deviceCoords ?? { lat: city.lat, lng: city.lng };
  const originLabel = deviceCoords ? t('bloodFinder.nearMe') : city.name;

  const options = useBloodOptions();
  const search = useBloodSearch({
    bloodGroup,
    componentType,
    lat: origin.lat,
    lng: origin.lng,
    radiusKm,
  });
  const nationwide = useNationwideBloodSearch({
    bloodGroup,
    componentType,
    enabled: nationwideOpen,
  });
  const requests = useBloodRequests('open');
  const cancelRequest = useCancelBloodRequest();

  const groupOptions = options.data?.blood_groups ?? [];
  const componentOptions = options.data?.component_types ?? [];

  const selectedGroup = useMemo(
    () => groupOptions.find((g) => g.value === bloodGroup) ?? null,
    [groupOptions, bloodGroup],
  );

  const selectedComponentLabel = t(`bloodFinder.components.${componentType}`);

  /**
   * The patient's own group, offered as a one-tap shortcut rather than
   * pre-selected: blood is very often searched for somebody else, and silently
   * searching the wrong group in an emergency would be worse than one extra tap.
   */
  const ownGroup = useMemo(() => {
    const value = patient?.blood_group ?? null;
    if (!value) return null;
    // `patients.blood_group` is a free-ish string column, so it is only a
    // shortcut when it matches a real App\Enums\BloodGroup value the options
    // endpoint returned — otherwise the chip is simply not offered.
    return groupOptions.find((g) => g.value === value) ?? null;
  }, [patient?.blood_group, groupOptions]);

  /** Clinically compatible groups that the patient could search instead. */
  const compatibleGroups = useMemo(() => {
    if (!selectedGroup) return [] as BloodGroupOption[];
    return selectedGroup.can_receive_from
      .filter((value) => value !== selectedGroup.value)
      .map((value) => groupOptions.find((g) => g.value === value))
      .filter((g): g is BloodGroupOption => !!g);
  }, [selectedGroup, groupOptions]);

  // The endpoint has no facility-name search (a patient-facing name LIKE query
  // is exactly the enumeration pattern the platform forbids on patient data,
  // and facility rows come back small enough to filter locally), so the search
  // box narrows the returned list rather than issuing another query.
  const rows = useMemo(() => search.data ?? [], [search.data]);
  const results = useMemo(() => {
    if (!debouncedTerm) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(debouncedTerm) ||
        (row.city ?? '').toLowerCase().includes(debouncedTerm) ||
        (row.region ?? '').toLowerCase().includes(debouncedTerm),
    );
  }, [rows, debouncedTerm]);

  /**
   * The nationwide query comes back distance-less, and the service then sorts
   * it by `strcmp(b.freshness, a.freshness)` — which is alphabetical, so it
   * puts *stale* first. Re-ordered here so the freshest report leads; the
   * ordering is presentation, the rows are untouched.
   */
  const nationwideRows = useMemo(() => {
    const sweep = nationwide.data ?? [];
    return [...sweep].sort((a, b) => {
      const byFreshness =
        freshnessRank(a.availability?.freshness) - freshnessRank(b.availability?.freshness);
      return byFreshness !== 0 ? byFreshness : a.name.localeCompare(b.name);
    });
  }, [nationwide.data]);

  // Only the results that actually carry coordinates can be plotted; the map is
  // suppressed entirely when none do (embedMapUrl would also return null, but
  // guarding here keeps the surrounding spacing from rendering an empty gap).
  const mappable = useMemo(
    () => results.filter((row) => row.latitude != null && row.longitude != null),
    [results],
  );

  /*
   * Per-component counts for every card on the page (PM-BLOOD-01).
   *
   * Four requests for the whole list, not four per bank: the sweep asks the
   * same endpoint the finder already uses, under the same query keys, so the
   * component currently selected is served from cache.
   */
  const componentMatrix = useBloodComponentMatrix({
    bloodGroup,
    lat: origin.lat,
    lng: origin.lng,
    radiusKm,
    enabled: !!bloodGroup,
  });

  /*
   * Four groups in the row and the rest behind "More", as the reference draws
   * it. The patient's own group is pinned into the four so the commonest
   * choice is never the hidden one, and a chosen group is always visible.
   */
  const visibleGroups = useMemo(() => {
    const pinned = [ownGroup?.value, bloodGroup].filter(Boolean) as BloodGroupValue[];
    const head = groupOptions.filter((g) => pinned.includes(g.value));
    const rest = groupOptions.filter((g) => !pinned.includes(g.value));
    return [...head, ...rest].slice(0, 4);
  }, [groupOptions, ownGroup, bloodGroup]);

  const componentChoices = useMemo(
    () =>
      componentOptions.length > 0
        ? componentOptions.map((c) => ({ value: c.value, icon: c.icon, count: c.facility_count }))
        : COMPONENT_FALLBACK.map((value) => ({ value, icon: 'droplet', count: 0 })),
    [componentOptions],
  );

  const openRequests = requests.data ?? [];
  const nextRadius = RADIUS_OPTIONS.find((r) => r > radiusKm) ?? null;
  const truncated = rows.length >= LOCAL_RESULT_LIMIT;

  // A refresh that fails on top of a list that already loaded must say so —
  // stale blood stock read as fresh is a safety problem, not a polish one.
  const searchStale = search.isError && rows.length > 0;

  /**
   * expo-location is a real dependency of this app (see app.json's plugin list
   * and app/(auth)/permissions.tsx), so "near me" is an actual GPS fix. If the
   * patient declines, or the fix fails, the city picker stays the origin — the
   * search never silently stops working.
   */
  const useMyLocation = useCallback(async () => {
    setLocating(true);
    setLocationDenied(false);
    setSheet(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationDenied(true);
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setDeviceCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
    } catch {
      setLocationDenied(true);
    } finally {
      setLocating(false);
    }
  }, []);

  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace('/(tabs)/home');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([options.refetch(), search.refetch(), requests.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [options, search, requests]);

  const goToRequest = useCallback(
    (facility: BloodBankResult) => {
      if (!bloodGroup) return;
      router.push({
        pathname: '/blood-finder/request',
        params: {
          facilityId: facility.id,
          bloodGroup,
          componentType,
          lat: String(origin.lat),
          lng: String(origin.lng),
          radiusKm: String(radiusKm),
          nationwide: facility.distance_km === null ? '1' : '0',
        },
      });
    },
    [bloodGroup, componentType, origin.lat, origin.lng, radiusKm, router],
  );

  /**
   * PM-BLOOD-02. Same params as the request route, because the detail screen
   * re-resolves the facility from the same search rather than trusting a
   * snapshot passed through the navigation.
   */
  const goToBank = useCallback(
    (facility: BloodBankResult) => {
      if (!bloodGroup) return;
      router.push({
        pathname: '/blood-finder/bank',
        params: {
          facilityId: facility.id,
          bloodGroup,
          componentType,
          lat: String(origin.lat),
          lng: String(origin.lng),
          radiusKm: String(radiusKm),
        },
      });
    },
    [bloodGroup, componentType, origin.lat, origin.lng, radiusKm, router],
  );

  /** Cancelling a reservation is unrecoverable — confirm before firing it. */
  const confirmCancel = (request: BloodRequest) =>
    dialog.confirm({
      title: t('bloodFinder.request.cancel'),
      message: [
        `${request.blood_group}  •  ${t(`bloodFinder.components.${request.component_type}`, {
          defaultValue: request.component_label,
        })}`,
        request.facility?.name,
        t('bloodFinder.reference', { reference: request.reference }),
        t('bloodFinder.request.cancelWarning', {
          defaultValue: 'This cannot be undone. You would have to send a new request.',
        }),
      ]
        .filter(Boolean)
        .join('\n'),
      confirmLabel: t('bloodFinder.request.cancel'),
      destructive: true,
      onConfirm: async () => {
        try {
          await cancelRequest.mutateAsync({ id: request.id });
          dialog.alert(
            t('bloodFinder.request.cancelledTitle'),
            t('bloodFinder.request.cancelledBody'),
            'success',
          );
        } catch (error) {
          // REQUEST_NOT_CANCELLABLE and REQUEST_NOT_FOUND are different facts
          // about the request and get different sentences; anything else is
          // reported as the unknown it is rather than guessed at.
          const code = errorCodeOf(error);
          dialog.alert(
            t('bloodFinder.request.cancel'),
            code
              ? t(`bloodFinder.errors.${code}`, { defaultValue: t('bloodFinder.errors.generic') })
              : t('bloodFinder.errors.generic'),
            'critical',
          );
        }
      },
    });

  const scrollToRequests = () =>
    scrollRef.current?.scrollTo({ y: Math.max(0, requestsY.current - spacing.md), animated: true });

  const headerActions: ScreenHeaderAction[] = [
    ...(openRequests.length > 0
      ? [
          {
            icon: 'receipt' as IconName,
            badge: openRequests.length,
            onPress: scrollToRequests,
            accessibilityLabel: t('bloodFinder.myRequests'),
          },
        ]
      : []),
    {
      icon: 'location' as IconName,
      onPress: () => {
        void useMyLocation();
      },
      accessibilityLabel: t('bloodFinder.useMyLocation'),
    },
  ];

  return (
    <Screen className="px-0">
      {/*
        The reference's top bar is the BRAND lockup, not a screen title — which
        is precisely why its hero below is free to carry the name at full size.
        Reproducing that here means the title is printed once, in the place the
        design puts it, instead of twice.

        `accessibilityLabel` on the bar keeps the screen announceable, which is
        the one thing ScreenHeader's title was buying.
      */}
      <View
        style={styles.topBar}
        accessibilityRole="header"
        accessibilityLabel={t('bloodFinder.title')}
      >
        <TouchableOpacity
          onPress={goBack}
          hitSlop={10}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('common.back', { defaultValue: 'Back' })}
          style={styles.topBarBack}
        >
          <Icon name="chevron-left" size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.topBarBrand}>
          <PulseLogo size={34} />
          <Wordmark size="md" showTagline />
        </View>

        <View style={styles.topBarActions}>
          {headerActions.map((action) => (
            <TouchableOpacity
              key={action.accessibilityLabel}
              onPress={action.onPress}
              hitSlop={8}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel}
              style={styles.topBarAction}
            >
              <Icon name={action.icon} size={20} color={colors.textPrimary} />
              {action.badge ? (
                <View style={[styles.topBarBadge, { backgroundColor: colors.blue }]}>
                  <Text style={styles.topBarBadgeText}>{action.badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />
        }
      >
        {/* Hero (PM-BLOOD-01) --------------------------------------------
            Droplet tile, title, and the assurance badge the reference puts
            opposite it. "Verified" describes the SCREENING this platform
            requires of a listed blood bank - never a promise about any
            individual unit - which is why the badge sits with the title and
            not on a result row. */}
        {/* Hero, as the reference draws it: the droplet tile, the name at
            full size, the tagline, and the assurance badge beside it. */}
        <View style={styles.hero}>
          <View style={[styles.heroMark, { backgroundColor: colors.tintBlueBg }]}>
            <Icon name="droplet" size={30} color={colors.blue} />
          </View>
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle} numberOfLines={1}>
              {t('bloodFinder.title')}
            </Text>
            <Text style={styles.heroSubtitle}>{t('bloodFinder.heroSubtitle')}</Text>
          </View>
          <View style={[styles.heroBadge, { backgroundColor: colors.tintBlueBg }]}>
            <Icon name="shield-check" size={18} color={colors.blue} />
            <View style={styles.heroBadgeBody}>
              <Text style={[styles.heroBadgeTitle, { color: colors.blue }]}>
                {t('bloodFinder.verifiedBadge')}
              </Text>
              <Text style={styles.heroBadgeNote}>{t('bloodFinder.verifiedBadgeNote')}</Text>
            </View>
          </View>
        </View>

        {/* The finder card, as PM-BLOOD-01 draws it: two columns for
            1|2 and 4|5, urgency across the middle, and four different
            controls because each field is a different kind of choice. */}
        <Card>
          <View style={styles.finderStack}>
            {/* ── 1 | 2 ────────────────────────────────────────────────── */}
            <View style={styles.fieldRow}>
              <View style={styles.fieldWide}>
                <FieldLabel index={1} label={t('bloodFinder.stepGroup')} />
                {options.isPending ? (
                  <LoadingBlock label={t('bloodFinder.searching')} />
                ) : options.isError ? (
                  <EmptyState
                    icon="alert-circle"
                    tint="red"
                    title={t('bloodFinder.loadFailed')}
                    actionLabel={t('bloodFinder.retry')}
                    onAction={() => options.refetch()}
                  />
                ) : (
                  <View style={styles.groupRow}>
                    {/* Four in the row, as drawn, and the rest behind More —
                        the patient's own group is always one of the four so
                        the commonest choice is never hidden. */}
                    {visibleGroups.map((group) => (
                      <TouchableOpacity
                        key={group.value}
                        onPress={() =>
                          setBloodGroup(group.value === bloodGroup ? null : group.value)
                        }
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ selected: group.value === bloodGroup }}
                        style={[
                          styles.groupPill,
                          {
                            borderColor:
                              group.value === bloodGroup ? colors.blue : colors.border,
                            backgroundColor:
                              group.value === bloodGroup ? colors.blue : colors.surface,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.groupPillText,
                            {
                              color:
                                group.value === bloodGroup ? '#FFFFFF' : colors.textPrimary,
                            },
                          ]}
                        >
                          {group.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      onPress={() => setSheet((c) => (c === 'group' ? null : 'group'))}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={t('bloodFinder.moreGroups')}
                      style={[styles.groupPill, styles.groupMore, { borderColor: colors.border }]}
                    >
                      <Icon name="grid" size={15} color={colors.textSecondary} />
                      <Text style={styles.groupMoreText}>{t('bloodFinder.more')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.fieldNarrow}>
                <FieldLabel index={2} label={t('bloodFinder.stepComponent')} />
                <FieldSelect
                  icon="droplet"
                  value={selectedComponentLabel}
                  open={sheet === 'component'}
                  onPress={() => setSheet((c) => (c === 'component' ? null : 'component'))}
                  accessibilityLabel={t('bloodFinder.stepComponent')}
                />
              </View>
            </View>

            {sheet === 'group' ? (
              <OptionCard title={t('bloodFinder.stepGroup')}>
                {groupOptions.map((group, index) => (
                  <ListRow
                    key={group.value}
                    title={group.label}
                    meta={[
                      group.facility_count > 0
                        ? t('bloodFinder.facilityCount', { count: group.facility_count })
                        : t('bloodFinder.noSites'),
                    ]}
                    trailing={
                      group.value === bloodGroup ? (
                        <Icon name="check" size={18} color={colors.blue} />
                      ) : undefined
                    }
                    chevron={false}
                    divider={index < groupOptions.length - 1}
                    onPress={() => {
                      setBloodGroup(group.value);
                      setSheet(null);
                    }}
                  />
                ))}
              </OptionCard>
            ) : null}

            {sheet === 'component' ? (
              <OptionCard title={t('bloodFinder.stepComponent')}>
                {componentChoices.map((choice, index) => (
                  <ListRow
                    key={choice.value}
                    icon={COMPONENT_ICONS[choice.icon] ?? 'droplet'}
                    tint={BLOOD_TINT}
                    title={t(`bloodFinder.components.${choice.value}`)}
                    meta={[
                      choice.count > 0
                        ? t('bloodFinder.facilityCount', { count: choice.count })
                        : t('bloodFinder.noSites'),
                    ]}
                    trailing={
                      choice.value === componentType ? (
                        <Icon name="check" size={18} color={colors.blue} />
                      ) : undefined
                    }
                    chevron={false}
                    divider={index < componentChoices.length - 1}
                    onPress={() => {
                      setComponentType(choice.value);
                      setSheet(null);
                    }}
                  />
                ))}
              </OptionCard>
            ) : null}

            {/* ── 3 ────────────────────────────────────────────────────── */}
            <View>
              <FieldLabel index={3} label={t('bloodFinder.stepUrgency')} />
              <View style={styles.urgencyRow}>
                {URGENCY_OPTIONS.map((option) => {
                  const active = option.value === urgency;
                  const tone =
                    option.value === 'emergency'
                      ? colors.statusCritical
                      : option.value === 'urgent'
                        ? colors.statusWarning
                        : colors.blue;
                  const toneBg =
                    option.value === 'emergency'
                      ? colors.statusCriticalBg
                      : option.value === 'urgent'
                        ? colors.statusWarningBg
                        : colors.tintBlueBg;

                  return (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() => setUrgency(option.value)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[
                        styles.urgencyButton,
                        {
                          borderColor: active ? tone : colors.border,
                          backgroundColor: active ? toneBg : colors.surface,
                        },
                      ]}
                    >
                      <Icon
                        name={option.icon}
                        size={16}
                        color={active ? tone : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.urgencyText,
                          { color: active ? tone : colors.textPrimary },
                        ]}
                        numberOfLines={1}
                      >
                        {t(`bloodFinder.urgency.${option.value}`)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── 4 | 5 ────────────────────────────────────────────────── */}
            <View style={styles.fieldRow}>
              <View style={styles.fieldWide}>
                <FieldLabel index={4} label={t('bloodFinder.stepWhere')} />
                <View style={[styles.locationField, { borderColor: colors.border }]}>
                  <Icon name="location" size={17} color={colors.textSecondary} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {originLabel}
                  </Text>
                  {/* The reference's crosshair: one tap for a real GPS fix. */}
                  <TouchableOpacity
                    onPress={() => {
                      void useMyLocation();
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('bloodFinder.useMyLocation')}
                    style={styles.locateButton}
                  >
                    <Icon
                      name="target"
                      size={18}
                      color={locating ? colors.textMuted : colors.blue}
                    />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => setSheet((c) => (c === 'city' ? null : 'city'))}
                  accessibilityRole="button"
                  style={styles.changeCity}
                >
                  <Text style={[styles.changeCityText, { color: colors.blue }]}>
                    {t('bloodFinder.changeLocation')}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.fieldNarrow}>
                <FieldLabel index={5} label={t('bloodFinder.stepRange')} />
                <FieldSelect
                  value={t('bloodFinder.radius', { km: radiusKm })}
                  open={sheet === 'radius'}
                  onPress={() => setSheet((c) => (c === 'radius' ? null : 'radius'))}
                  accessibilityLabel={t('bloodFinder.stepRange')}
                />
              </View>
            </View>

            {sheet === 'city' ? (
              <OptionCard title={t('bloodFinder.changeLocation')}>
                {CITIES.map((option, index) => (
                  <ListRow
                    key={option.key}
                    title={option.name}
                    trailing={
                      !deviceCoords && option.key === city.key ? (
                        <Icon name="check" size={18} color={colors.blue} />
                      ) : undefined
                    }
                    chevron={false}
                    divider={index < CITIES.length - 1}
                    onPress={() => {
                      setCity(option);
                      setDeviceCoords(null);
                      setSheet(null);
                    }}
                  />
                ))}
              </OptionCard>
            ) : null}

            {sheet === 'radius' ? (
              <OptionCard title={t('bloodFinder.stepRange')}>
                {RADIUS_OPTIONS.map((option, index) => (
                  <ListRow
                    key={option}
                    title={t('bloodFinder.radius', { km: option })}
                    trailing={
                      option === radiusKm ? (
                        <Icon name="check" size={18} color={colors.blue} />
                      ) : undefined
                    }
                    chevron={false}
                    divider={index < RADIUS_OPTIONS.length - 1}
                    onPress={() => {
                      setRadiusKm(option);
                      setSheet(null);
                    }}
                  />
                ))}
              </OptionCard>
            ) : null}

            {locationDenied ? (
              <NoticeBanner
                icon="location"
                tone="warning"
                message={t('bloodFinder.locationDenied')}
              />
            ) : null}
          </View>

          {/* The reference's primary action: search glyph, centred label, and
              a chevron. It scrolls to the results, which are already live —
              a button that claimed to start a search that was never stopped
              would be the one lie this screen cannot afford. */}
          <TouchableOpacity
            onPress={() => {
              scrollRef.current?.scrollTo({
                y: Math.max(resultsY.current - 12, 0),
                animated: true,
              });
            }}
            disabled={!bloodGroup}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('bloodFinder.findBlood')}
            style={[
              styles.findButton,
              { backgroundColor: bloodGroup ? colors.blue : colors.border },
            ]}
          >
            <Icon name="search" size={19} color="#FFFFFF" />
            <Text style={styles.findButtonText}>{t('bloodFinder.findBlood')}</Text>
            <Icon name="chevron-right" size={19} color="#FFFFFF" />
          </TouchableOpacity>
        </Card>

        {/* Trust strip ----------------------------------------------------
            Four assurances, each one a claim this platform can stand behind:
            screening and verification are facility attributes the directory
            carries, the freshness stamp is on every stock row, and privacy is
            the Health ID consent model. Deliberately no figures. */}
        <Card variant="flush">
          <View style={styles.trustRow}>
            {TRUST_POINTS.map((point, index) => (
              <View
                key={point.key}
                style={[
                  styles.trustItem,
                  index < TRUST_POINTS.length - 1 && {
                    borderRightWidth: StyleSheet.hairlineWidth,
                    borderRightColor: colors.border,
                  },
                ]}
              >
                <Icon name={point.icon} size={19} color={colors.blue} />
                <Text style={styles.trustText}>{t(`bloodFinder.trust.${point.key}`)}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Escalation. Blood stock here is self-reported and may be hours old;
            a patient who is actually in danger should be moving toward a
            hospital, not filtering a list. No hotline number is hardcoded -
            none exists in this codebase and inventing one would be dangerous -
            so both actions lead to screens that surface real, API-sourced
            numbers. */}
        <Card accentColor={colors.statusCritical}>
          <View style={styles.emergencyHead}>
            <View style={[styles.emergencyMark, { backgroundColor: colors.statusCriticalBg }]}>
              <Icon name="alert-triangle" size={20} color={colors.statusCritical} />
            </View>
            <View style={styles.emergencyBody}>
              <Text style={[styles.emergencyTitle, { color: colors.statusCritical }]}>
                {t('bloodFinder.emergencyTitle')}
              </Text>
              <Text style={styles.emergencyText}>{t('bloodFinder.emergencyBody')}</Text>
            </View>
          </View>
          <View style={styles.actionRow}>
            <CareButton
              label={t('bloodFinder.emergencyFindEr')}
              icon="first-aid"
              variant="dangerSolid"
              size="sm"
              onPress={() => router.push('/care-map')}
              style={styles.actionButton}
            />
            <CareButton
              label={t('bloodFinder.emergencySupport')}
              icon="phone"
              variant="danger"
              size="sm"
              onPress={() => router.push('/help')}
              style={styles.actionButton}
            />
          </View>
        </Card>

        {/* ── Results ──────────────────────────────────────────────────────── */}
        <View
          onLayout={(event) => {
            resultsY.current = event.nativeEvent.layout.y;
          }}
        />
        {!bloodGroup ? (
          <Card variant="flush">
            <EmptyState
              icon="droplet"
              tint={BLOOD_TINT}
              title={t('bloodFinder.chooseGroupTitle')}
              message={t('bloodFinder.chooseGroupBody')}
            />
          </Card>
        ) : (
          <View style={styles.stack}>
            <View>
              <SectionHeader
                title={
                  search.isPending
                    ? t('bloodFinder.searching')
                    : t('bloodFinder.nearbyBanks', { count: results.length })
                }
                actionLabel={t('bloodFinder.viewOnMap')}
                onAction={() => router.push('/blood-finder/map')}
              />
              <Text style={styles.sectionHint}>
                {[
                  `${bloodGroup}  •  ${selectedComponentLabel}`,
                  t('bloodFinder.radius', { km: radiusKm }),
                  originLabel,
                  t('bloodFinder.sortByDistance'),
                ].join('  ·  ')}
              </Text>
            </View>

            {searchStale ? (
              <StaleNotice
                message={t('bloodFinder.loadFailed')}
                loadedAt={search.dataUpdatedAt ? new Date(search.dataUpdatedAt) : null}
                onRetry={() => search.refetch()}
                retrying={search.isFetching}
              />
            ) : null}

            {/* A filter box only earns its space once there is a list to filter. */}
            {rows.length > 3 || debouncedTerm ? (
              <View style={styles.searchWrap}>
                <PillInput
                  icon={<Icon name="search" size={18} color={colors.blue} />}
                  value={term}
                  onChangeText={setTerm}
                  placeholder={t('bloodFinder.filterResults')}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                  accessibilityLabel={t('bloodFinder.filterPlaceholder')}
                />
                {term.length > 0 ? (
                  <TouchableOpacity
                    onPress={() => setTerm('')}
                    hitSlop={10}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('bloodFinder.clear')}
                    style={styles.searchClear}
                  >
                    <Icon name="x-circle" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {search.isPending ? (
              <LoadingBlock label={t('bloodFinder.searching')} />
            ) : search.isError && rows.length === 0 ? (
              <Card variant="flush">
                <EmptyState
                  icon="alert-circle"
                  tint="red"
                  title={t('bloodFinder.loadFailed')}
                  message={t('bloodFinder.searchFailedHint', {
                    defaultValue:
                      'Nothing was returned, so nothing on this screen is out of date — it is simply unknown. Check your connection and try again.',
                  })}
                  actionLabel={t('bloodFinder.retry')}
                  onAction={() => search.refetch()}
                />
              </Card>
            ) : results.length === 0 ? (
              <NoStockPanel
                radiusKm={radiusKm}
                nextRadius={nextRadius}
                onWiden={() => {
                  if (nextRadius) setRadiusKm(nextRadius);
                }}
                // "The filter hid everything" is only the explanation when
                // there was in fact something to hide.
                filtered={!!debouncedTerm && rows.length > 0}
                onClearFilter={() => setTerm('')}
                componentLabel={selectedComponentLabel}
                onWholeBlood={
                  componentType === 'whole_blood' ? null : () => setComponentType('whole_blood')
                }
                group={selectedGroup?.label ?? bloodGroup}
                compatibleGroups={compatibleGroups}
                onPickGroup={setBloodGroup}
                nationwideOpen={nationwideOpen}
                onNationwide={() => setNationwideOpen(true)}
                nationwidePending={nationwide.isPending}
                nationwideError={nationwide.isError}
                nationwideRows={nationwideRows}
                nationwideExpanded={nationwideExpanded}
                onToggleNationwide={() => setNationwideExpanded((open) => !open)}
                onRetryNationwide={() => nationwide.refetch()}
                onFindHospital={() => router.push('/care-map')}
                onOpenFacility={goToRequest}
              />
            ) : (
              <View style={styles.stack}>
                {/* Real embedded map of the blood banks, in-app (no external maps
                    app). Only shown when at least one result has coordinates. */}
                {mappable.length > 0 ? (
                  <Card variant="flush">
                    <FacilityMap facilities={mappable} height={240} />
                  </Card>
                ) : null}
                {/* Six blood banks are six things to compare and pick between.
                    `BloodBankCard` already draws its own flush card, so it goes
                    straight into the list; the gap does the separating. */}
                <ResultList>
                  {results.map((facility) => (
                    <BloodBankCard
                      key={facility.id}
                      facility={facility}
                      components={componentMatrix.forFacility(facility.id)}
                      onOpen={() => goToBank(facility)}
                      onCall={() => dial(facility.phone ?? facility.emergency_contact)}
                    />
                  ))}
                </ResultList>
                {truncated ? (
                  <NoticeBanner
                    icon="info"
                    tone="pending"
                    // `limit`, not `count`: an interpolation named `count` makes
                    // i18next look for plural forms of a key that does not exist
                    // yet, and the defaultValue is the only copy there is.
                    message={t('bloodFinder.resultsTruncated', {
                      limit: LOCAL_RESULT_LIMIT,
                      defaultValue:
                        'Only the {{limit}} nearest facilities are listed. Narrow the radius to be sure you are seeing the closest ones.',
                    })}
                  />
                ) : null}
              </View>
            )}
          </View>
        )}

        {/* ── My requests ──────────────────────────────────────────────────── */}
        <View
          style={styles.stack}
          onLayout={(event) => {
            requestsY.current = event.nativeEvent.layout.y;
          }}
        >
          <SectionHeader
            title={t('bloodFinder.myRequests')}
            actionLabel={requests.isError ? t('bloodFinder.retry') : undefined}
            onAction={requests.isError ? () => requests.refetch() : undefined}
          />

          {requests.isPending ? (
            <LoadingBlock label={t('bloodFinder.searching')} />
          ) : requests.isError ? (
            <Card variant="flush">
              <EmptyState
                icon="alert-circle"
                tint="red"
                title={t('bloodFinder.requestsFailed', {
                  defaultValue: "Couldn't load your blood requests.",
                })}
                actionLabel={t('bloodFinder.retry')}
                onAction={() => requests.refetch()}
              />
            </Card>
          ) : openRequests.length === 0 ? (
            <Card variant="flush">
              <EmptyState
                icon="receipt"
                tint="blue"
                title={t('bloodFinder.myRequestsEmpty')}
                message={t('bloodFinder.myRequestsEmptyHint', {
                  defaultValue:
                    'Pick a group above, then choose a facility to reserve units at. Requests you send appear here until the blood bank answers them.',
                })}
              />
            </Card>
          ) : (
            openRequests.map((request) => (
              <OpenRequestCard
                onTrack={() =>
                  router.push({
                    pathname: '/blood-finder/status',
                    params: { requestId: request.id },
                  })
                }
                key={request.id}
                request={request}
                cancelling={
                  cancelRequest.isPending && cancelRequest.variables?.id === request.id
                }
                onCancel={() => confirmCancel(request)}
              />
            ))
          )}
        </View>

        {/* The reference's four-up entry grid. Only the two destinations that
            exist are live; the donor screens are deliberately absent until the
            donor-privacy question behind them is answered (see
            docs/finder-screens-plan.md), because a tile that opens a list of
            named donors is the thing this platform must not ship. */}
        <View style={styles.quickGrid}>
          <QuickAction
            icon="droplet"
            tint="red"
            label={t('bloodFinder.quick.emergency')}
            onPress={() => router.push('/blood-finder/emergency')}
          />
          <QuickAction
            icon="users"
            tint="blue"
            label={t('bloodFinder.quick.findDonors')}
            onPress={() => router.push('/blood-finder/donors')}
          />
          <QuickAction
            icon="heart-pulse"
            tint="red"
            label={t('bloodFinder.quick.becomeDonor')}
            onPress={() => router.push('/blood-finder/become-donor')}
          />
          <QuickAction
            icon="book"
            tint="blue"
            label={t('bloodFinder.quick.education')}
            onPress={() => router.push('/blood-finder/education')}
          />
        </View>

        {/* Safety notice */}
        <View style={styles.notice} accessibilityRole="summary">
          <Icon name="shield-check" size={20} color={colors.blue} />
          <View style={styles.noticeBody}>
            <Text style={styles.noticeTitle}>{t('bloodFinder.safetyTitle')}</Text>
            <Text style={styles.noticeText}>{t('bloodFinder.safetyBody')}</Text>
          </View>
        </View>
      </ScrollView>

      {dialog.element}
    </Screen>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

/** The numbered label above each field of the finder card (PM-BLOOD-01). */
function FieldLabel({ index, label }: { index: number; label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.fieldLabelRow}>
      <Text style={styles.fieldNumber}>{index}.</Text>
      <Text style={styles.fieldLabelText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * A dropdown field — the control the reference uses for Component and Range.
 *
 * A bordered box showing the current value with a chevron, not a chip: the
 * point of the reference's card is that each field looks like the kind of
 * choice it is, and these two are "one of a list", not "toggle some tags".
 * Tapping opens the same OptionCard sheet the location picker uses, so there
 * is one selection pattern on the screen rather than two.
 */
function FieldSelect({
  icon,
  value,
  open,
  onPress,
  accessibilityLabel,
}: {
  icon?: IconName;
  value: string;
  open: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${accessibilityLabel}: ${value}`}
      style={[
        styles.selectField,
        { borderColor: open ? colors.blue : colors.border },
      ]}
    >
      {icon ? <Icon name={icon} size={17} color={colors.blue} /> : null}
      <Text style={styles.selectValue} numberOfLines={2}>
        {value}
      </Text>
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

/**
 * One numbered row of the finder card (PM-BLOOD-01).
 *
 * The number is carried in its own tinted square exactly as the reference
 * draws it, and it means something: these are ordered steps, and the results
 * below stay closed until step 1 is answered. A numbered marker on content
 * that is not a sequence would be decoration; here it is the sequence.
 */
function FinderField({
  index,
  label,
  children,
}: {
  index: number;
  label: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.finderField}>
      <View style={styles.finderFieldHead}>
        <View style={[styles.finderIndex, { backgroundColor: colors.tintBlueBg }]}>
          <Text style={[styles.finderIndexText, { color: colors.blue }]}>{index}</Text>
        </View>
        <Text style={styles.finderLabel}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

/** One tile of the reference's four-up entry grid. */
function QuickAction({
  icon,
  tint,
  label,
  onPress,
}: {
  icon: IconName;
  tint: Tint;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tone = tint === 'red' ? colors.statusCritical : colors.blue;
  const toneBg = tint === 'red' ? colors.statusCriticalBg : colors.tintBlueBg;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.quickTile}
    >
      <View style={[styles.quickMark, { backgroundColor: toneBg }]}>
        <Icon name={icon} size={17} color={tone} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={3}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** Bordered picker used by the city / radius sheets. */
function OptionCard({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.afterRail}>
      <Card variant="flush">
        <Text style={styles.optionTitle}>{title}</Text>
        {children}
      </Card>
    </View>
  );
}

/**
 * The stock figure, told honestly: how many units were reported, and exactly
 * when. `last_updated_at` is printed in full rather than summarised, because
 * "Updated recently" can mean anything up to six hours on a shelf that empties
 * in minutes. When the timestamp is missing the row is omitted entirely — the
 * freshness badge is then the only claim made about age, and it says "not
 * updated recently", which is what the projector writes for a null.
 */
function StockFacts({
  availability,
  address,
  verification,
}: {
  availability: BloodStockSnapshot | null;
  address: string | null;
  verification: string | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const verificationKey = (verification ?? '').toLowerCase();
  const updated = availability?.last_updated_at
    ? formatDateTime(availability.last_updated_at)
    : null;

  return (
    <View style={styles.facts}>
      <SummaryLine
        label={t('bloodFinder.unitsLabel', { defaultValue: 'Units reported' })}
        value={availability?.units_range ?? t('bloodFinder.unitsUnknown')}
        valueColor={availability?.units_range ? undefined : colors.textMuted}
        strong={!!availability?.units_range}
      />
      {updated ? (
        <SummaryLine
          label={t('bloodFinder.stockUpdated', { defaultValue: 'Stock updated' })}
          value={updated}
        />
      ) : null}
      {address ? (
        <SummaryLine
          label={t('bloodFinder.addressLabel', { defaultValue: 'Address' })}
          value={address}
        />
      ) : null}
      {verificationKey ? (
        <SummaryLine
          label={t('bloodFinder.verificationLabel', { defaultValue: 'Listing' })}
          value={t(`bloodFinder.verification.${verificationKey}`, {
            defaultValue: VERIFICATION_FALLBACK[verificationKey] ?? formatLabel(verification),
          })}
          valueColor={isVerified(verification) ? colors.statusNormal : colors.textMuted}
        />
      ) : null}
    </View>
  );
}

/**
 * A facility that reports the requested units.
 *
 * One `Card variant="flush"`: the kit `ListRow` (red tint circle, distance and
 * the freshness `StatusBadge` on the right) over the reported figures and the
 * two actions the patient came for. Tapping the row and pressing "Request
 * units" do the same thing.
 */
function BloodBankCard({
  facility,
  components,
  onOpen,
  onCall,
}: {
  facility: BloodBankResult;
  /** One entry per component; `units` is null when the facility said nothing. */
  components: { component: BloodComponentValue; units: string | null }[];
  onOpen: () => void;
  onCall: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const availability = facility.availability;
  const phone = facility.phone ?? facility.emergency_contact ?? null;

  const freshnessKey = (availability?.freshness ?? '').toLowerCase() || 'stale';
  const freshnessLabel = t(`bloodFinder.freshness.${freshnessKey}`, {
    defaultValue: t('bloodFinder.freshness.stale'),
  });

  const distance =
    facility.distance_km === null
      ? t('bloodFinder.distanceUnknown')
      : t('bloodFinder.distanceKm', { km: facility.distance_km });

  const place = [facility.city, facility.region].filter(Boolean).join(', ') || null;
  const verified = isVerified(facility.verification_status);

  return (
    <Card variant="flush">
      <TouchableOpacity
        onPress={onOpen}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={[facility.name, place, distance, freshnessLabel]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint={t('bloodFinder.openBank')}
        style={styles.bankRow}
      >
        {/* Round mark, where the reference puts each bank's own logo. This
            platform stores no facility logos, so the mark is the blood glyph
            rather than an invented crest. */}
        <View style={[styles.bankMark, { backgroundColor: colors.statusCriticalBg }]}>
          <Icon name="droplet" size={22} color={colors.statusCritical} />
        </View>

        <View style={styles.bankBody}>
          <View style={styles.bankNameRow}>
            <Text style={styles.bankName} numberOfLines={2}>
              {facility.name}
            </Text>
            {verified ? <Icon name="shield-check" size={15} color={colors.blue} /> : null}
          </View>

          <Text style={styles.bankMeta} numberOfLines={1}>
            {[place, distance].filter(Boolean).join('  •  ')}
          </Text>

          <View style={styles.bankFreshRow}>
            <Icon name="clock" size={13} color={colors.textMuted} />
            <Text style={styles.bankFresh}>{freshnessLabel}</Text>
          </View>

          {/* Per-component chips, the row the reference puts under the name.
              A component the facility has not published is omitted rather than
              shown as zero — see useBloodComponentMatrix. */}
          <View style={styles.componentChips}>
            {components.filter((row) => row.units).length === 0 ? (
              <Text style={styles.bankFresh}>{t('bloodFinder.noComponentCounts')}</Text>
            ) : (
              components
                .filter((row) => row.units)
                .map((row) => (
                  <View
                    key={row.component}
                    style={[styles.componentChip, { backgroundColor: colors.tintBlueBg }]}
                  >
                    <Text style={[styles.componentChipLabel, { color: colors.blue }]}>
                      {t(`bloodFinder.componentShort.${row.component}`, {
                        defaultValue: t(`bloodFinder.components.${row.component}`),
                      })}
                    </Text>
                    <Text style={[styles.componentChipUnits, { color: colors.blue }]}>
                      {row.units}
                    </Text>
                  </View>
                ))
            )}
          </View>
        </View>

        {/* The reference's right-hand column: the headline figure stacked over
            its label, and a round call button beneath. */}
        <View style={styles.bankAside}>
          <Text style={[styles.bankUnits, { color: colors.blue }]} numberOfLines={1}>
            {availability?.units_range ?? '—'}
          </Text>
          <Text style={styles.bankUnitsLabel}>{t('bloodFinder.unitsAvailable')}</Text>
          <TouchableOpacity
            onPress={onCall}
            disabled={!phone}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={
              phone ? t('bloodFinder.callShort') : t('bloodFinder.noPhone')
            }
            style={[
              styles.bankCall,
              { borderColor: colors.border },
              !phone && styles.bankCallOff,
            ]}
          >
            <Icon name="phone" size={17} color={phone ? colors.blue : colors.textMuted} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Card>
  );
}

/**
 * The no-results state, built as an answer rather than a shrug.
 *
 * `blood_availability` is self-reported and routinely empty, so this is the
 * state most patients will actually see. Every action below is real: widening
 * the radius re-runs the search, a compatible group re-runs it against a group
 * the API says has stock, and "search the whole country" issues the supported
 * origin-less query. Nothing is invented to fill the space.
 */
function NoStockPanel({
  radiusKm,
  nextRadius,
  onWiden,
  filtered,
  onClearFilter,
  componentLabel,
  onWholeBlood,
  group,
  compatibleGroups,
  onPickGroup,
  nationwideOpen,
  onNationwide,
  nationwidePending,
  nationwideError,
  nationwideRows,
  nationwideExpanded,
  onToggleNationwide,
  onRetryNationwide,
  onFindHospital,
  onOpenFacility,
}: {
  radiusKm: number;
  nextRadius: number | null;
  onWiden: () => void;
  filtered: boolean;
  onClearFilter: () => void;
  componentLabel: string;
  onWholeBlood: (() => void) | null;
  group: string;
  compatibleGroups: BloodGroupOption[];
  onPickGroup: (value: BloodGroupValue) => void;
  nationwideOpen: boolean;
  onNationwide: () => void;
  nationwidePending: boolean;
  nationwideError: boolean;
  nationwideRows: BloodBankResult[];
  nationwideExpanded: boolean;
  onToggleNationwide: () => void;
  onRetryNationwide: () => void;
  onFindHospital: () => void;
  onOpenFacility: (facility: BloodBankResult) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // The local filter box hiding every row is a different problem with a
  // different escape from "nothing is reported within the radius".
  if (filtered) {
    return (
      <Card variant="flush">
        <EmptyState
          icon="search"
          tint="blue"
          title={t('bloodFinder.filteredToNothing', {
            defaultValue: 'No result matches that filter.',
          })}
          message={t('bloodFinder.filteredToNothingHint', {
            defaultValue:
              'The filter only narrows the facilities already found. Clear it to see them all again.',
          })}
          actionLabel={t('bloodFinder.clear')}
          onAction={onClearFilter}
        />
      </Card>
    );
  }

  const shown = nationwideExpanded ? nationwideRows : nationwideRows.slice(0, NATIONWIDE_PREVIEW);

  return (
    <View style={styles.stack}>
      <Card variant="flush">
        <EmptyState
          icon="droplet"
          tint={BLOOD_TINT}
          title={t('bloodFinder.noResults', { km: radiusKm })}
          message={t('bloodFinder.empty.body')}
          actionLabel={nextRadius ? t('bloodFinder.empty.widen', { km: nextRadius }) : undefined}
          onAction={nextRadius ? onWiden : undefined}
        />
      </Card>

      <Card variant="flush">
        <Text style={styles.optionTitle}>{t('bloodFinder.empty.nextSteps')}</Text>
        {nextRadius ? (
          <ListRow
            icon="target"
            tint="amber"
            title={t('bloodFinder.empty.widen', { km: nextRadius })}
            onPress={onWiden}
            divider
          />
        ) : null}
        {onWholeBlood ? (
          <ListRow
            icon="droplet"
            tint={BLOOD_TINT}
            title={t('bloodFinder.empty.tryWholeBlood')}
            onPress={onWholeBlood}
            divider
          />
        ) : null}
        {!nationwideOpen ? (
          <ListRow
            icon="globe"
            tint="blue"
            title={t('bloodFinder.empty.nationwide')}
            onPress={onNationwide}
            divider
          />
        ) : null}
        <ListRow
          icon="building"
          tint="green"
          title={t('bloodFinder.empty.callHospital')}
          onPress={onFindHospital}
        />
      </Card>

      {/* Compatible groups — clinically grounded (App\Enums\BloodGroup) and
          annotated with what the API says is actually reported. */}
      {compatibleGroups.length > 0 ? (
        <View>
          <SectionHeader variant="overline" title={t('bloodFinder.empty.compatible', { group })} />
          <View style={styles.chipWrap}>
            {compatibleGroups.map((option) => (
              <Chip
                key={option.value}
                icon="droplet"
                label={option.label}
                count={option.facility_count > 0 ? option.facility_count : undefined}
                selected={option.facility_count > 0}
                onPress={() => onPickGroup(option.value)}
                accessibilityLabel={`${option.label} — ${
                  option.facility_count > 0
                    ? t('bloodFinder.facilityCount', { count: option.facility_count })
                    : t('bloodFinder.noSites')
                }`}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* Nationwide sweep */}
      {nationwideOpen ? (
        <View style={styles.stack}>
          {nationwidePending ? (
            <LoadingBlock label={t('bloodFinder.empty.checking')} />
          ) : nationwideError ? (
            <Card variant="flush">
              <EmptyState
                icon="alert-circle"
                tint="red"
                title={t('bloodFinder.empty.failed')}
                actionLabel={t('bloodFinder.retry')}
                onAction={onRetryNationwide}
              />
            </Card>
          ) : nationwideRows.length === 0 ? (
            <Card variant="flush">
              <EmptyState
                icon="globe"
                tint="amber"
                title={t('bloodFinder.empty.nationwideNone', {
                  group,
                  component: componentLabel,
                })}
                message={t('bloodFinder.empty.nationwideNoneHint')}
                actionLabel={t('bloodFinder.empty.callHospital')}
                onAction={onFindHospital}
              />
            </Card>
          ) : (
            <>
              <View>
                <SectionHeader
                  variant="overline"
                  title={t('bloodFinder.empty.nationwideFound', { count: nationwideRows.length })}
                  actionLabel={
                    nationwideRows.length > NATIONWIDE_PREVIEW
                      ? nationwideExpanded
                        ? t('bloodFinder.showLess', { defaultValue: 'Show fewer' })
                        : t('bloodFinder.showAll', { defaultValue: 'Show all' })
                      : undefined
                  }
                  actionChevron
                  onAction={
                    nationwideRows.length > NATIONWIDE_PREVIEW ? onToggleNationwide : undefined
                  }
                />
                {/* These rows come back without a distance, so they cannot be
                    ordered by how far away they are — say what they ARE ordered
                    by rather than let the list imply proximity. */}
                <Text style={styles.sectionHint}>
                  {t('bloodFinder.empty.freshestFirst', {
                    defaultValue: 'Most recently updated first · distance unavailable',
                  })}
                </Text>
              </View>
              <View style={styles.stack}>
                {shown.map((facility) => (
                  <BloodBankCard
                    key={facility.id}
                    facility={facility}
                    /* The nationwide sweep runs without an origin and for one
                       component only, so there are no per-component counts to
                       show here. An empty list renders the honest "not
                       reported" line rather than blank chips. */
                    components={[]}
                    onOpen={() => onOpenFacility(facility)}
                    onCall={() => dial(facility.phone ?? facility.emergency_contact)}
                  />
                ))}
              </View>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

/** Urgency reads as a tone, not a colour literal. */
function urgencyTone(urgency: string): StatusTone {
  switch (urgency) {
    case 'emergency':
      return 'critical';
    case 'urgent':
      return 'warning';
    default:
      return 'neutral';
  }
}

/**
 * One request the patient already sent.
 *
 * Everything MobileBloodController::requestPayload() returns is shown, because
 * every field of it answers a question the patient will otherwise phone
 * somebody to ask: what did I ask for, where, under what reference, by when do
 * I need it, when does the hold lapse (BloodRequestService::HOLD_HOURS is 24,
 * after which the request expires on its own), what did I tell them, and — the
 * one that matters most — what did the blood bank write back.
 */
function OpenRequestCard({
  request,
  cancelling,
  onCancel,
  onTrack,
}: {
  request: BloodRequest;
  cancelling: boolean;
  onCancel: () => void;
  /** Opens PM-BLOOD-05 for this request. */
  onTrack: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const phone = request.facility?.phone ?? null;

  const componentLabel = t(`bloodFinder.components.${request.component_type}`, {
    defaultValue: request.component_label,
  });
  const place = [request.facility?.city, request.facility?.address].filter(Boolean).join(', ');

  return (
    <Card variant="flush">
      <ListRow
        icon="receipt"
        tint={BLOOD_TINT}
        title={`${request.blood_group}  •  ${componentLabel}`}
        meta={[
          request.facility?.name,
          place || null,
          t('bloodFinder.reference', { reference: request.reference }),
        ]}
        onPress={onTrack}
        accessibilityHint={t('bloodStatus.title')}
        trailing={
          <View style={styles.rowAside}>
            <StatusBadge
              status={request.status}
              label={t(`bloodFinder.statuses.${request.status}`, {
                defaultValue: request.status_label,
              })}
              size="sm"
            />
            <StatusBadge
              status={request.urgency}
              tone={urgencyTone(request.urgency)}
              label={t(`bloodFinder.urgencies.${request.urgency}`)}
              size="sm"
            />
          </View>
        }
        divider
      />

      <View style={styles.facts}>
        <SummaryLine
          label={t('bloodFinder.request.reviewUnits')}
          value={String(request.quantity)}
          strong
        />
        {request.needed_by ? (
          <SummaryLine
            label={t('bloodFinder.request.neededBy', { defaultValue: 'Needed by' })}
            value={formatDateTime(request.needed_by)}
          />
        ) : null}
        {request.expires_at ? (
          <SummaryLine
            label={t('bloodFinder.request.expiresAt', { defaultValue: 'Hold expires' })}
            value={formatDateTime(request.expires_at)}
            valueColor={colors.statusWarning}
          />
        ) : null}
        {request.created_at ? (
          <SummaryLine
            label={t('bloodFinder.request.sentAt', { defaultValue: 'Sent' })}
            value={formatDateTime(request.created_at)}
          />
        ) : null}
        {request.contact_phone ? (
          <SummaryLine
            label={t('bloodFinder.request.contactPhone')}
            value={request.contact_phone}
          />
        ) : null}
      </View>

      {request.patient_note ? (
        <View style={styles.noteStrip}>
          <Text style={styles.noteLabel}>{t('bloodFinder.request.note')}</Text>
          <Text style={styles.noteText}>{request.patient_note}</Text>
        </View>
      ) : null}

      {/* The blood bank's own words back to the patient — the single most
          important field on the payload, so it is a banner, not a line. */}
      {request.facility_note ? (
        <View style={styles.facilityNote}>
          <NoticeBanner
            icon="chat"
            tone="pending"
            title={t('bloodFinder.request.facilityNote', {
              defaultValue: 'Message from the blood bank',
            })}
            message={request.facility_note}
          />
        </View>
      ) : null}

      {phone || request.is_cancellable ? (
        <View style={styles.cardFoot}>
          {phone ? (
            <CareButton
              label={t('bloodFinder.callShort')}
              icon="phone"
              variant="secondary"
              size="sm"
              onPress={() => dial(phone)}
              style={styles.footAction}
            />
          ) : null}
          {request.is_cancellable ? (
            <CareButton
              label={t('bloodFinder.request.cancel')}
              icon="close"
              variant="danger"
              size="sm"
              loading={cancelling}
              disabled={cancelling}
              onPress={onCancel}
              style={styles.footAction}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/* ── Styles ───────────────────────────────────────────────────────────────── */

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    /* PM-BLOOD-01 finder card */
    fieldRow: { flexDirection: 'row', gap: spacing.sm },
    // The reference splits step 1 / step 2 about 60:40, not 55:45 — five
    // group tiles need the room, and the component dropdown does not.
    fieldWide: { flex: 1.55, minWidth: 0 },
    fieldNarrow: { flex: 1, minWidth: 0 },
    fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
    fieldNumber: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    fieldLabelText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },

    groupRow: { flexDirection: 'row', gap: 6 },
    // Square-ish tiles, as drawn. flexBasis 0 rather than `flex: 1` so all
    // five share the row exactly whatever their labels are.
    groupPill: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 0,
      height: 44,
      borderRadius: radii.sm,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupPillText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
    },
    groupMore: { gap: 1 },
    groupMoreText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 10,
      color: c.textSecondary,
    },

    selectField: {
      height: 46,
      borderRadius: radii.sm,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
    },
    selectValue: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: 14,
      color: c.textPrimary,
    },

    urgencyRow: { flexDirection: 'row', gap: 6 },
    urgencyButton: {
      flex: 1,
      minWidth: 0,
      height: 46,
      borderRadius: radii.sm,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: 3,
    },
    urgencyText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
    },

    locationField: {
      height: 46,
      borderRadius: radii.sm,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 10,
    },
    locationText: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    locateButton: { padding: 2 },
    changeCity: { paddingTop: 5, alignSelf: 'flex-start' },
    changeCityText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
    },

    findButtonText: {
      flex: 1,
      textAlign: 'center',
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: '#FFFFFF',
    },

    /* PM-BLOOD-01 bank card */
    bankRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.md,
    },
    bankMark: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bankBody: { flex: 1, gap: 3 },
    bankNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    bankName: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    bankMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textSecondary,
    },
    bankFreshRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    bankFresh: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    componentChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
    componentChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
    },
    componentChipLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
    },
    componentChipUnits: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 11,
    },
    bankAside: { alignItems: 'center', gap: 2, width: 62 },
    bankUnits: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
    },
    bankUnitsLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      lineHeight: 13,
      color: c.textMuted,
      textAlign: 'center',
    },
    bankCall: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    bankCallOff: { opacity: 0.45 },

    /* PM-BLOOD-01 hero */
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    topBarBack: { width: 28, alignItems: 'flex-start' },
    topBarBrand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    topBarActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    topBarAction: { padding: 4 },
    topBarBadge: {
      position: 'absolute',
      top: -2,
      right: -4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topBarBadgeText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 10,
      color: '#FFFFFF',
    },

    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    heroMark: {
      width: 52,
      height: 52,
      borderRadius: radii.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroBody: { flex: 1, minWidth: 0 },
    heroTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl,
      lineHeight: typography.lineHeight.xl,
      color: c.textPrimary,
    },
    heroSubtitle: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
      marginTop: 1,
    },
    heroBadge: {
      // Capped so the title keeps the width it needs at 375pt. The reference
      // is drawn on a wider phone; the badge is what gives way, not the name.
      maxWidth: 104,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 7,
      paddingVertical: 6,
      borderRadius: radii.md,
    },
    heroBadgeBody: { flexShrink: 1 },
    heroBadgeNote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 10,
      color: c.textMuted,
    },
    heroBadgeTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xs,
    },

    /* The numbered finder card */
    finderStack: { gap: spacing.md },
    finderField: { gap: spacing.xs },
    finderFieldHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    finderIndex: {
      width: 22,
      height: 22,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    finderIndexText: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xs,
    },
    finderLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    ownGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingVertical: 4,
    },
    ownGroupText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },
    findButton: {
      marginTop: spacing.md,
      height: 56,
      borderRadius: radii.md,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      gap: spacing.xs,
    },

    /* Trust strip */
    trustRow: {
      flexDirection: 'row',
      paddingVertical: spacing.sm,
    },
    trustItem: {
      flex: 1,
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 6,
    },
    trustText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
      textAlign: 'center',
    },

    /* Four-up entry grid */
    quickGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    quickTile: {
      // Four equal columns. flexBasis 0 (not a percentage) so the four share
      // the row exactly; minWidth 0 so a long label wraps instead of pushing
      // its neighbours off the edge.
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 0,
      minHeight: 76,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      backgroundColor: c.surface,
      paddingVertical: spacing.sm,
      paddingHorizontal: 8,
      gap: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickMark: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickLabel: {
      // 11pt, not 13. At a quarter of the row each tile is ~80pt wide, and
      // "Emergency" at 13pt broke mid-word into "Emergenc / y request".
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      lineHeight: 14,
      textAlign: 'center',
      color: c.textPrimary,
    },

    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    stack: { gap: spacing.md },

    emergencyHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 4 },
    emergencyMark: {
      width: 40,
      height: 40,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emergencyBody: { flex: 1, minWidth: 0, gap: 2 },
    emergencyTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },
    emergencyText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
    actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
    actionButton: { flexGrow: 1, flexBasis: 140 },

    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chipRail: { marginHorizontal: -spacing.md },
    chipRailContent: {
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
      alignItems: 'center',
    },
    afterRail: { marginTop: spacing.sm },

    optionTitle: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 13,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: c.textPrimary,
    },

    sectionHint: {
      marginTop: -spacing.xs,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
    },

    // PillInput carries its own bottom margin; the scroll container already
    // spaces siblings, so cancel the double gap.
    searchWrap: { position: 'relative', marginBottom: -spacing.md },
    searchClear: {
      position: 'absolute',
      right: spacing.md,
      top: 0,
      bottom: spacing.md,
      justifyContent: 'center',
    },

    rowAside: { alignItems: 'flex-end', gap: 4 },
    rowValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },

    facts: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },

    noteStrip: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      gap: 2,
    },
    noteLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    noteText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textSecondary,
    },
    facilityNote: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },

    cardFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
    },
    footCall: { flexGrow: 1, flexBasis: 120 },
    footCta: { flexGrow: 1, flexBasis: 160 },
    footAction: { flexGrow: 1, flexBasis: 120 },

    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 2,
      padding: spacing.md - 2,
      borderRadius: radii.md,
      backgroundColor: c.primarySoft,
    },
    noticeBody: { flex: 1, minWidth: 0, gap: 2 },
    noticeTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    noticeText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
  });
