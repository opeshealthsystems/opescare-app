import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ScrollView } from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  spacing,
  useDialog,
  useTheme,
  type IconName,
  type ScreenHeaderAction,
} from '@/components/opes-ui';
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
  freshnessRank,
  errorCodeOf,
  SheetKey,
  UrgencyValue,
} from '@/components/blood/finder/helpers';
import { makeStyles } from '@/components/blood/finder/styles';

/**
 * State, queries and derived data for the Blood Finder screen
 * (app/blood-finder.tsx). Extracted verbatim from the screen component.
 */
export function useBloodFinder() {
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

  // Layout handlers for the two scroll anchors above. They live here, beside
  // the refs they write, because a section component may not mutate a ref
  // it receives as a prop.
  const onResultsLayout = (event: { nativeEvent: { layout: { y: number } } }) => {
    resultsY.current = event.nativeEvent.layout.y;
  };
  const onRequestsLayout = (event: { nativeEvent: { layout: { y: number } } }) => {
    requestsY.current = event.nativeEvent.layout.y;
  };

  return {
    t,
    router,
    colors,
    styles,
    dialog,
    patient,
    bloodGroup,
    setBloodGroup,
    componentType,
    setComponentType,
    city,
    setCity,
    deviceCoords,
    setDeviceCoords,
    locating,
    setLocating,
    locationDenied,
    setLocationDenied,
    radiusKm,
    setRadiusKm,
    urgency,
    setUrgency,
    term,
    setTerm,
    debouncedTerm,
    setDebouncedTerm,
    sheet,
    setSheet,
    nationwideOpen,
    setNationwideOpen,
    nationwideExpanded,
    setNationwideExpanded,
    refreshing,
    setRefreshing,
    scrollRef,
    requestsY,
    resultsY,
    origin,
    originLabel,
    options,
    search,
    nationwide,
    requests,
    cancelRequest,
    groupOptions,
    componentOptions,
    selectedGroup,
    selectedComponentLabel,
    ownGroup,
    compatibleGroups,
    rows,
    results,
    nationwideRows,
    mappable,
    componentMatrix,
    visibleGroups,
    componentChoices,
    openRequests,
    nextRadius,
    truncated,
    searchStale,
    handleUseMyLocation,
    goBack,
    onRefresh,
    goToRequest,
    goToBank,
    confirmCancel,
    scrollToRequests,
    headerActions,
    onResultsLayout,
    onRequestsLayout,
  };
}

export type BloodFinderModel = ReturnType<typeof useBloodFinder>;
