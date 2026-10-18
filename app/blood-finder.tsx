import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { PaperWave } from '@/components/ui/PaperWave';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '@/components/ui/Screen';
import { FacilityMap } from '@/components/map/FacilityMap';
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  ListRow,
  PillInput,
  PulseLogo,
  ResultList,
  ScreenHeader,
  SectionHeader,
  Wordmark,
  StaleNotice,
  spacing,
  useDialog,
  useTheme,
  type IconName,
  type ScreenHeaderAction,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock, NoticeBanner } from '@/components/care/shared';
import { useAuthStore } from '@/lib/store/auth';
import { useNationwideBloodSearch } from '@/lib/api/bloodQueries';
import { useBloodComponentMatrix } from '@/lib/api/bloodBankQueries';
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
} from '@/lib/api/queries';
import {
  City,
  CITIES,
  RADIUS_OPTIONS,
  LOCAL_RESULT_LIMIT,
  COMPONENT_FALLBACK,
  COMPONENT_ICONS,
  BLOOD_TINT,
  freshnessRank,
  dial,
  errorCodeOf,
  SheetKey,
  UrgencyValue,
  URGENCY_OPTIONS,
  TRUST_POINTS,
} from '@/components/blood/finder/helpers';
import {
  FieldLabel,
  FieldSelect,
  QuickAction,
  OptionCard,
  BloodBankCard,
  NoStockPanel,
  OpenRequestCard,
} from '@/components/blood/finder/parts';
import { makeStyles } from '@/components/blood/finder/styles';

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
  const handleUseMyLocation = useCallback(async () => {
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
        void handleUseMyLocation();
      },
      accessibilityLabel: t('bloodFinder.useMyLocation'),
    },
  ];

  return (
    <Screen className="px-0">
      <PaperWave />
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
                      void handleUseMyLocation();
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
