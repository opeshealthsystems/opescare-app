/**
 * Care Access — the patient-facing facility directory (screen 41 "Care Access
 * Map" / 45 "Search & Filter" in the app plan), presented with the OPES UI kit
 * in the layout of `UIUX/src/screens/care/FindFacilityScreen.tsx` (CARE-007).
 *
 * The port is presentation only. The data and domain layer is untouched:
 * `useFacilityDirectory` pages `GET /mobile/facilities` (903 real Cameroonian
 * institutions), `lib/careMap/facilityDisplay` owns sorting / distance / type
 * vocabulary, and the location flow (silent reuse of a granted permission,
 * explicit request, reverse-geocoded area snap) is verbatim. Three properties
 * of that endpoint still shape the screen:
 *
 *  - **It applies no ORDER BY.** Rows come back in physical table order, which
 *    begins on rural integrated health centres. The directory therefore opens
 *    on a city (the patient's own once location is granted, Yaoundé
 *    otherwise); "All Cameroon" stays one tap away and says plainly that it is
 *    registry order.
 *  - **Only 395 of 903 rows carry GPS.** Distance is optional everywhere: rows
 *    without coordinates keep a distance-free row and, under distance sort,
 *    sit in a labelled group at the end rather than being dropped.
 *  - **It has no sort parameter.** Ordering is client-side over the pages
 *    fetched so far, which the "showing N of M" line states rather than hides.
 *
 * The embedded `FacilityMap` (the finder's own OpenStreetMap embed with in-app
 * directions) is a deliberate feature and takes the OPES layout's hero slot,
 * directly under the search row.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
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
import type { TFunction } from 'i18next';
import { FacilityMap } from '@/components/map/FacilityMap';
import { Screen } from '@/components/ui/Screen';
import {
  Card,
  Chip,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  ScreenHeader,
  SectionHeader,
  StaleNotice,
  StatusBadge,
  a11yJoin,
  colors,
  radii,
  spacing,
  tintMap,
  typography,
  type IconName,
  type Tint,
} from '@/components/opes-ui';
import {
  CareButton,
  ErrorBlock,
  LoadingBlock,
  NoticeBanner,
  SearchField,
} from '@/components/care/shared';
import { flattenFacilityPages, useFacilityDirectory } from '@/lib/api/careMapQueries';
import type { CareFacilitySummary } from '@/lib/api/queries';
import {
  CITY_SCOPES,
  DEFAULT_CITY_SCOPE,
  TYPE_FILTERS,
  facilityDistanceKm,
  formatDistance,
  hasUsablePhone,
  joinLocationParts,
  normalizeText,
  sortFacilities,
  telUrl,
  usablePhone,
  type Coords,
  type FacilitySort,
} from '@/lib/careMap/facilityDisplay';

type LocationState =
  /** Reading the already-granted permission on mount; render nothing yet. */
  | 'checking'
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable';

interface FacilityRow {
  facility: CareFacilitySummary;
  distanceKm: number | null;
}

const SORTS: FacilitySort[] = ['relevance', 'distance', 'name'];

/* ── Facility-type presentation ─────────────────────────────────────────── */

/**
 * Kit glyph per `care_facilities.facility_type`. This is the finder's own
 * vocabulary (hospital / health_center / dental / …), wider than the OPES
 * department set in `shared.DEPARTMENT_TYPE_ICON`, so it is mapped here.
 * There is no tooth glyph in the kit; `smile` stands in for dental.
 */
const FACILITY_TYPE_ICON: Record<string, IconName> = {
  hospital: 'building',
  clinic: 'stethoscope',
  health_center: 'first-aid',
  pharmacy: 'pill',
  laboratory: 'flask',
  imaging_center: 'image',
  diagnostic_center: 'microscope',
  dental: 'smile',
  blood_bank: 'droplet',
  // Types the register carries but the filter strip never offered.
  specialist: 'heart-pulse',
  eye_clinic: 'eye',
  maternity: 'baby',
  dispensary: 'capsule',
};

/** Tint-circle convention from the design spec: green = labs/meds, purple = consultations, blue = the default. */
const FACILITY_TYPE_TINT: Record<string, Tint> = {
  laboratory: 'green',
  pharmacy: 'green',
  dispensary: 'green',
  clinic: 'purple',
  dental: 'purple',
  specialist: 'purple',
  eye_clinic: 'purple',
  blood_bank: 'red',
  maternity: 'red',
};

const facilityIcon = (type: string): IconName => FACILITY_TYPE_ICON[type] ?? 'location';
const facilityTint = (type: string): Tint => FACILITY_TYPE_TINT[type] ?? 'blue';
const typeLabelTr = (t: TFunction, type: string): string =>
  String(t(`careMap.types.${type}`, { defaultValue: type }));

/** Matches a reverse-geocoded place name against the offered city scopes. */
function matchCityScope(...candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const needle = normalizeText(candidate);
    if (!needle) continue;
    const hit = CITY_SCOPES.find((city) => {
      const scope = normalizeText(city);
      return scope === needle || scope.includes(needle) || needle.includes(scope);
    });
    if (hit) return hit;
  }
  return null;
}

/* ── Type tile (the CARE-007 "Department Types" strip) ──────────────────── */

function TypeTile({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: IconName;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.type, selected && styles.typeOn]}
    >
      <Icon name={icon} size={26} color={colors.blue} />
      <Text style={styles.typeLabel} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/* ── Location affordance ────────────────────────────────────────────────── */

function LocationPrompt({
  state,
  cityLabel,
  onRequest,
  t,
}: {
  state: LocationState;
  cityLabel: string;
  onRequest: () => void;
  t: TFunction;
}) {
  // 'checking' keeps the card from flashing in for the split second before we
  // know an already-granted permission exists.
  if (state === 'granted' || state === 'checking') return null;

  if (state === 'denied' || state === 'unavailable') {
    const denied = state === 'denied';
    return (
      <View style={styles.assist}>
        <View style={styles.assistTop}>
          <View style={styles.assistIcon}>
            <Icon name="location" size={20} color={colors.textOnBrand} />
          </View>
          <View style={styles.assistBody}>
            <Text style={styles.assistTitle}>
              {denied ? t('careMap.locationDenied.title') : t('careMap.locationUnavailable.title')}
            </Text>
            <Text style={styles.assistText}>
              {denied
                ? t('careMap.locationDenied.body', { city: cityLabel })
                : t('careMap.locationUnavailable.body', { city: cityLabel })}
            </Text>
          </View>
        </View>
        {denied ? (
          <CareButton
            label={t('careMap.locationDenied.action')}
            variant="secondary"
            size="sm"
            icon="settings"
            onPress={() => Linking.openSettings().catch(() => {})}
          />
        ) : null}
      </View>
    );
  }

  const busy = state === 'requesting';

  return (
    <View style={styles.assist}>
      <View style={styles.assistTop}>
        <View style={styles.assistIcon}>
          <Icon name="location" size={20} color={colors.textOnBrand} />
        </View>
        <View style={styles.assistBody}>
          <Text style={styles.assistTitle}>{t('careMap.locationCta.title')}</Text>
          <Text style={styles.assistText}>{t('careMap.locationCta.body')}</Text>
        </View>
      </View>
      <GradientButton
        label={busy ? t('careMap.locationCta.working') : t('careMap.locationCta.action')}
        loading={busy}
        icon="none"
        onPress={onRequest}
      />
    </View>
  );
}

/* ── Result rows ────────────────────────────────────────────────────────── */

function FacilityListRow({
  row,
  divider,
  onOpen,
  t,
}: {
  row: FacilityRow;
  divider: boolean;
  onOpen: () => void;
  t: TFunction;
}) {
  const { facility } = row;
  const distance = row.distanceKm != null ? formatDistance(row.distanceKm) : undefined;
  const typeLabel = typeLabelTr(t, facility.facility_type);
  const where = joinLocationParts(facility.address, facility.city, facility.region);

  // `phone_primary` is the literal string "N/A" on 1 840 of the register's
  // 2 728 rows, so testing it for truthiness put a Call button on two thirds of
  // this list that dialled `tel:NA` and did nothing. The row's own honesty rule
  // is the one below: the button appears only when there is a number to ring.
  // Why no "phone not listed" text here, when the facility profile does say
  // that: this is a dense scanning list where the missing case is the majority
  // case, and repeating it on two of every three rows would bury the rows that
  // do have a number. The profile screen — one tap away, where a patient goes
  // to make contact — carries the explicit "Not listed" line instead.
  const phone = usablePhone(facility.phone_primary);

  const handleCall = () => {
    const url = telUrl(phone);
    if (url) Linking.openURL(url).catch(() => {});
  };

  const trailing = phone ? (
    <View style={styles.rowTrailing}>
      {!!distance && <Text style={styles.rowValue}>{distance}</Text>}
      <TouchableOpacity
        onPress={handleCall}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={a11yJoin(String(t('careMap.call')), facility.facility_name)}
        style={styles.callButton}
      >
        <Icon name="phone" size={16} color={tintMap.green.fg} />
      </TouchableOpacity>
    </View>
  ) : undefined;

  return (
    <ListRow
      icon={facilityIcon(facility.facility_type)}
      tint={facilityTint(facility.facility_type)}
      title={facility.facility_name}
      meta={[typeLabel, where || null]}
      value={trailing ? undefined : distance}
      trailing={trailing}
      onPress={onOpen}
      divider={divider}
      accessibilityLabel={a11yJoin(facility.facility_name, typeLabel, where, distance)}
      accessibilityHint={String(t('careMap.viewDetails'))}
    />
  );
}

function FacilityRows({
  rows,
  onOpen,
  t,
}: {
  rows: FacilityRow[];
  onOpen: (id: string) => void;
  t: TFunction;
}) {
  return (
    <Card variant="flush">
      {rows.map((row, index) => (
        <FacilityListRow
          key={row.facility.id}
          row={row}
          divider={index < rows.length - 1}
          onOpen={() => onOpen(row.facility.id)}
          t={t}
        />
      ))}
    </Card>
  );
}

/* ── Filter panel ───────────────────────────────────────────────────────── */

/** One switch-like row inside the panel: label, explanation, on/off mark. */
function ToggleRow({
  icon,
  title,
  body,
  on,
  onPress,
  divider,
}: {
  icon: IconName;
  title: string;
  body: string;
  on: boolean;
  onPress: () => void;
  divider: boolean;
}) {
  return (
    <ListRow
      icon={icon}
      tint={on ? 'green' : 'blue'}
      title={title}
      subtitle={body}
      chevron={false}
      divider={divider}
      onPress={onPress}
      trailing={
        <Icon
          name={on ? 'check-circle' : 'circle'}
          size={20}
          color={on ? tintMap.green.fg : colors.textMuted}
        />
      }
      accessibilityLabel={a11yJoin(title, body)}
    />
  );
}

/**
 * What "Filters" opens.
 *
 * Before this existed the button ran the search query and nothing else, so the
 * only control on the screen labelled "Filters" filtered nothing. The panel now
 * holds the three things the strip and chip rails cannot: every facility type
 * the register carries (four of them — specialist, eye clinic, maternity,
 * dispensary — had no entry in the vocabulary at all and were unreachable), the
 * area scope, and two refinements over the loaded rows.
 *
 * Type and area are query parameters, so changing them refetches across the
 * whole directory. The two toggles narrow only what is loaded, which the
 * results header says out loud.
 */
function FilterPanel({
  typeFilter,
  onTypeChange,
  cityScope,
  detectedCity,
  onCityChange,
  phoneOnly,
  onPhoneOnlyChange,
  mappableOnly,
  onMappableOnlyChange,
  matchCount,
  canClear,
  onClear,
  onClose,
  t,
}: {
  typeFilter: string;
  onTypeChange: (value: string) => void;
  cityScope: string;
  detectedCity: string | null;
  onCityChange: (city: string) => void;
  phoneOnly: boolean;
  onPhoneOnlyChange: (value: boolean) => void;
  mappableOnly: boolean;
  onMappableOnlyChange: (value: boolean) => void;
  matchCount: number;
  canClear: boolean;
  onClear: () => void;
  onClose: () => void;
  t: TFunction;
}) {
  const areas = detectedCity && !CITY_SCOPES.some((city) => city === detectedCity)
    ? [detectedCity, ...CITY_SCOPES]
    : [...CITY_SCOPES];

  return (
    <Card style={styles.panel}>
      <View style={styles.panelSection}>
        <Text style={styles.panelLabel}>{t('careMap.filterPanel.typeLabel')}</Text>
        <View style={styles.panelChips}>
          {TYPE_FILTERS.map((filter) => (
            <Chip
              key={filter.key}
              icon={filter.value ? facilityIcon(filter.value) : 'grid'}
              label={t(`careMap.filters.${filter.key}`)}
              selected={typeFilter === filter.value}
              onPress={() =>
                onTypeChange(filter.value && typeFilter === filter.value ? '' : filter.value)
              }
            />
          ))}
        </View>
      </View>

      <View style={styles.panelSection}>
        <Text style={styles.panelLabel}>{t('careMap.filterPanel.areaLabel')}</Text>
        <View style={styles.panelChips}>
          <Chip
            label={t('careMap.areaAll')}
            selected={cityScope === ''}
            onPress={() => onCityChange('')}
          />
          {areas.map((city) => (
            <Chip
              key={city}
              icon={city === detectedCity ? 'location' : undefined}
              label={city}
              selected={cityScope === city}
              onPress={() => onCityChange(city)}
            />
          ))}
        </View>
      </View>

      <View style={styles.panelSection}>
        <Text style={styles.panelLabel}>{t('careMap.filterPanel.refineLabel')}</Text>
        <View style={styles.panelRows}>
          <ToggleRow
            icon="phone"
            title={t('careMap.filterPanel.phoneOnly')}
            body={t('careMap.filterPanel.phoneOnlyBody')}
            on={phoneOnly}
            onPress={() => onPhoneOnlyChange(!phoneOnly)}
            divider
          />
          <ToggleRow
            icon="location"
            title={t('careMap.filterPanel.mappableOnly')}
            body={t('careMap.filterPanel.mappableOnlyBody')}
            on={mappableOnly}
            onPress={() => onMappableOnlyChange(!mappableOnly)}
            divider={false}
          />
        </View>
      </View>

      <View style={styles.panelActions}>
        {canClear ? (
          <CareButton
            label={t('careMap.clearFilters')}
            variant="secondary"
            size="sm"
            icon="refresh"
            onPress={onClear}
          />
        ) : null}
        <CareButton
          label={t('careMap.filterPanel.showResults', { count: matchCount })}
          size="sm"
          icon="check"
          onPress={onClose}
        />
      </View>
    </Card>
  );
}

/* ── Screen ─────────────────────────────────────────────────────────────── */

export default function CareMapScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [cityScope, setCityScope] = useState<string>(DEFAULT_CITY_SCOPE);
  const [sort, setSort] = useState<FacilitySort>('relevance');
  /** Whether the filter panel under the search row is expanded. */
  const [filtersOpen, setFiltersOpen] = useState(false);
  /**
   * Two refinements the endpoint cannot express, applied to the rows already
   * loaded. Both are honest about the register's gaps rather than hiding them:
   * 1 840 of 2 728 rows publish no phone number and 508 of 903 carry no
   * coordinates, so "only ones I can ring" and "only ones on the map" are real
   * questions a patient has.
   */
  const [phoneOnly, setPhoneOnly] = useState(false);
  const [mappableOnly, setMappableOnly] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locationState, setLocationState] = useState<LocationState>('checking');
  const [areaAutoMatched, setAreaAutoMatched] = useState(false);
  const [areaUnmatched, setAreaUnmatched] = useState(false);
  const [detectedCity, setDetectedCity] = useState<string | null>(null);

  const directory = useFacilityDirectory({
    q: appliedSearch || undefined,
    type: typeFilter || undefined,
    city: cityScope || undefined,
  });

  /**
   * The search box applies itself. It used to need a tap on the "Filters"
   * button — which ran `applySearch` and nothing else, so the control that said
   * "Filters" was really a hidden submit button and the one thing it did was
   * invisible when the text had not changed. The keyboard's own submit still
   * applies immediately.
   */
  useEffect(() => {
    const handle = setTimeout(() => setAppliedSearch(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  /** Resolves a fix and, when possible, snaps the area scope to the caller's city. */
  const resolvePosition = useCallback(async (announceArea: boolean) => {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const next: Coords = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
    setCoords(next);
    setLocationState('granted');
    setSort('distance');

    if (!announceArea) return;
    try {
      // Reverse geocoding needs platform geocoding services (unavailable on the
      // web build without an API key), so a failure here is expected and only
      // costs us the automatic area snap.
      const [place] = await Location.reverseGeocodeAsync({
        latitude: next.lat,
        longitude: next.lng,
      });
      const matched = matchCityScope(place?.city, place?.subregion, place?.district, place?.region);
      if (matched) {
        // A preset scope — spelled exactly as `care_facilities.city` stores it,
        // accents included, so the API's `city LIKE %value%` actually matches.
        setDetectedCity(matched);
        setCityScope(matched);
        setAreaAutoMatched(true);
        setAreaUnmatched(false);
        return;
      }

      const rawCity = (place?.city ?? place?.subregion ?? place?.district ?? '').trim();
      if (rawCity) {
        // Not one of the presets — still scope to it (the endpoint matches
        // `city` as a substring) and surface it as its own chip. If the
        // register spells it differently the list comes back empty, which the
        // filtered empty state explains and offers a way out of.
        setDetectedCity(rawCity);
        setCityScope(rawCity);
        setAreaAutoMatched(true);
        setAreaUnmatched(false);
        return;
      }

      setAreaUnmatched(true);
    } catch {
      setAreaUnmatched(true);
    }
  }, []);

  // Silently reuse an already-granted permission; never prompt on mount.
  useEffect(() => {
    let cancelled = false;
    Location.getForegroundPermissionsAsync()
      .then(async (result) => {
        if (cancelled) return;
        if (result.status !== 'granted') {
          setLocationState('idle');
          return;
        }
        await resolvePosition(true);
      })
      .catch(() => {
        if (!cancelled) setLocationState('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [resolvePosition]);

  const requestLocation = useCallback(async () => {
    setLocationState('requesting');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationState('denied');
        return;
      }
      await resolvePosition(true);
    } catch {
      setLocationState('unavailable');
    }
  }, [resolvePosition]);

  const facilities = useMemo(
    () => flattenFacilityPages(directory.data?.pages),
    [directory.data?.pages],
  );

  const sortedRows = useMemo<FacilityRow[]>(() => {
    const effectiveSort: FacilitySort = sort === 'distance' && !coords ? 'relevance' : sort;
    return sortFacilities(facilities, effectiveSort, coords, i18n.language).map((facility) => ({
      facility,
      distanceKm: facilityDistanceKm(coords, facility),
    }));
  }, [facilities, sort, coords, i18n.language]);

  /**
   * The two client-side refinements. Search / type / area are query parameters
   * the API applies across all 2 728 rows; these two can only narrow the pages
   * fetched so far, which is why `refinedAway` below states how many loaded
   * rows they are hiding instead of letting the list quietly shrink.
   */
  const rows = useMemo<FacilityRow[]>(
    () =>
      sortedRows.filter(({ facility }) => {
        if (phoneOnly && !hasUsablePhone(facility.phone_primary)) return false;
        if (mappableOnly && (facility.latitude == null || facility.longitude == null)) return false;
        return true;
      }),
    [sortedRows, phoneOnly, mappableOnly],
  );

  const refinedAway = sortedRows.length - rows.length;

  // The subset of the loaded rows the embedded map can plot. FacilityMap skips
  // items without coordinates and renders nothing when none have any, so this
  // safely carries the 508-of-903 coordinate-less rows through untouched.
  const mapFacilities = useMemo(
    () =>
      rows.map((row) => ({
        id: row.facility.id,
        name: row.facility.facility_name,
        latitude: row.facility.latitude,
        longitude: row.facility.longitude,
        city: row.facility.city,
        distance: row.distanceKm,
      })),
    [rows],
  );

  const nearest = useMemo<FacilityRow | null>(() => {
    if (!coords) return null;
    let best: FacilityRow | null = null;
    for (const row of rows) {
      if (row.distanceKm == null) continue;
      if (!best || row.distanceKm < (best.distanceKm as number)) best = row;
    }
    return best;
  }, [rows, coords]);

  // Under distance sort the coordinate-less rows are grouped at the end behind
  // an explicit label — they are never hidden, and never carry a fabricated
  // distance.
  const { located, unlocated, grouped } = useMemo(() => {
    const located = rows.filter((row) => row.distanceKm != null);
    const unlocated = rows.filter((row) => row.distanceKm == null);
    const grouped = sort === 'distance' && !!coords && located.length > 0 && unlocated.length > 0;
    return { located, unlocated, grouped };
  }, [rows, sort, coords]);

  const total = directory.data?.pages[0]?.pagination.total ?? 0;
  const cityLabel = cityScope || String(t('careMap.areaAll'));
  const isInitialLoading = directory.isLoading;
  const hasFilters =
    !!appliedSearch || !!typeFilter || !!cityScope || phoneOnly || mappableOnly;
  const activeTypeKey = TYPE_FILTERS.find((filter) => filter.value === typeFilter)?.key ?? 'all';
  const loadedAt = directory.dataUpdatedAt ? new Date(directory.dataUpdatedAt) : null;

  /** Drives the count on the Filters button, so it visibly holds something. */
  const activeFilterCount =
    (typeFilter ? 1 : 0) + (cityScope ? 1 : 0) + (phoneOnly ? 1 : 0) + (mappableOnly ? 1 : 0);

  const resetToArea = (city: string) => {
    setCityScope(city);
    setAreaAutoMatched(false);
    setAreaUnmatched(false);
  };

  const clearAll = () => {
    setSearchInput('');
    setAppliedSearch('');
    setTypeFilter('');
    setPhoneOnly(false);
    setMappableOnly(false);
    resetToArea('');
  };

  const applySearch = () => setAppliedSearch(searchInput.trim());
  const refetch = () => {
    void directory.refetch();
  };
  const openFacility = (id: string) => router.push({ pathname: '/facility/[id]', params: { id } });
  const openDoctors = () => router.push('/doctors');

  return (
    <Screen className="px-0">
      <View style={styles.screen}>
        <ScreenHeader
          title={t('careMap.title')}
          subtitle={t('careMap.subtitle')}
          right={
            locationState === 'granted' ? (
              <StatusBadge
                status="active"
                tone="normal"
                icon="location"
                size="sm"
                label={t('careMap.locationOn')}
              />
            ) : undefined
          }
        />

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={directory.isRefetching && !directory.isFetchingNextPage}
              onRefresh={refetch}
              tintColor={colors.blue}
            />
          }
        >
          {/* ── Search ──────────────────────────────────────────────────── */}
          <View style={styles.searchRow}>
            <SearchField
              value={searchInput}
              onChangeText={setSearchInput}
              placeholder={t('careMap.searchPlaceholder')}
              onSubmit={applySearch}
            />
            <TouchableOpacity
              style={[styles.filterButton, filtersOpen && styles.filterButtonOn]}
              activeOpacity={0.8}
              onPress={() => setFiltersOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel={t('opesCare.findFacility.applyFilters')}
              accessibilityState={{ expanded: filtersOpen }}
              accessibilityHint={t('careMap.filterPanel.hint')}
            >
              <Icon name="filter" size={18} color={colors.link} />
              <Text style={styles.filterText}>
                {activeFilterCount > 0
                  ? t('careMap.filterPanel.buttonWithCount', { count: activeFilterCount })
                  : t('opesCare.findFacility.filters')}
              </Text>
            </TouchableOpacity>
          </View>

          {filtersOpen ? (
            <FilterPanel
              typeFilter={typeFilter}
              onTypeChange={setTypeFilter}
              cityScope={cityScope}
              detectedCity={detectedCity}
              onCityChange={resetToArea}
              phoneOnly={phoneOnly}
              onPhoneOnlyChange={setPhoneOnly}
              mappableOnly={mappableOnly}
              onMappableOnlyChange={setMappableOnly}
              matchCount={rows.length}
              canClear={hasFilters}
              onClear={clearAll}
              onClose={() => setFiltersOpen(false)}
              t={t}
            />
          ) : null}

          {/* ── Map hero: real embedded OpenStreetMap of every loaded facility,
                 with in-app directions. Nothing hands off to a native maps app. */}
          <View style={styles.mapWrap}>
            <FacilityMap facilities={mapFacilities} height={260} />
          </View>

          <LocationPrompt
            state={locationState}
            cityLabel={cityLabel}
            onRequest={requestLocation}
            t={t}
          />

          {areaAutoMatched ? (
            <NoticeBanner
              icon="location"
              tone="normal"
              message={t('careMap.areaMatched', { city: cityScope })}
            />
          ) : null}

          {areaUnmatched ? (
            <NoticeBanner
              icon="location"
              tone="warning"
              message={t('careMap.areaUnmatched', { city: cityLabel })}
            />
          ) : null}

          {!cityScope ? (
            <NoticeBanner icon="info" tone="pending" message={t('careMap.areaAllHint')} />
          ) : null}

          {/* ── Facility types (the CARE-007 type strip) ────────────────── */}
          <View>
            {/* "All Types" used to clear a type filter that, in that exact
                state, was already empty — the label only read "All Types" when
                nothing was selected, so the one time it was visible it did
                nothing. Now it has a job in both states: clear the active type,
                or open the panel that holds every type the register carries
                (the strip below shows them too, but the panel is where the
                other refinements live). */}
            <SectionHeader
              title={t('careMap.typesTitle', { defaultValue: 'Facility types' })}
              actionLabel={
                typeFilter
                  ? t('careMap.filterPanel.clearType', {
                      type: t(`careMap.filters.${activeTypeKey}`),
                    })
                  : t('opesCare.findFacility.allTypes')
              }
              onAction={() => {
                if (typeFilter) setTypeFilter('');
                else setFiltersOpen(true);
              }}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.typeRow}
            >
              {TYPE_FILTERS.map((filter) => (
                <TypeTile
                  key={filter.key}
                  icon={filter.value ? facilityIcon(filter.value) : 'grid'}
                  label={t(`careMap.filters.${filter.key}`)}
                  selected={typeFilter === filter.value}
                  onPress={() =>
                    setTypeFilter(filter.value && typeFilter === filter.value ? '' : filter.value)
                  }
                />
              ))}
            </ScrollView>
          </View>

          {/* ── Area scope ──────────────────────────────────────────────── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <Chip
              label={t('careMap.areaAll')}
              selected={cityScope === ''}
              onPress={() => resetToArea('')}
            />
            {/* A geocoded city that is not one of the presets still gets a chip,
                so the scope the app picked from the patient's position is
                visible and reversible rather than silently applied. */}
            {detectedCity && !CITY_SCOPES.some((city) => city === detectedCity) ? (
              <Chip
                icon="location"
                label={detectedCity}
                selected={cityScope === detectedCity}
                onPress={() => resetToArea(detectedCity)}
              />
            ) : null}
            {CITY_SCOPES.map((city) => (
              <Chip
                key={city}
                icon={city === detectedCity ? 'location' : undefined}
                label={city}
                selected={cityScope === city}
                onPress={() => resetToArea(city)}
              />
            ))}
          </ScrollView>

          {/* ── Nearest-facility spotlight ──────────────────────────────── */}
          {nearest ? (
            <View>
              <SectionHeader
                title={t('careMap.nearestTitle')}
                actionLabel={t('careMap.viewDetails')}
                actionChevron
                onAction={() => openFacility(nearest.facility.id)}
              />
              <Card variant="flush">
                <ListRow
                  icon={facilityIcon(nearest.facility.facility_type)}
                  tint={facilityTint(nearest.facility.facility_type)}
                  title={nearest.facility.facility_name}
                  meta={[typeLabelTr(t, nearest.facility.facility_type), nearest.facility.city]}
                  value={formatDistance(nearest.distanceKm as number)}
                  valueColor={colors.statusNormal}
                  onPress={() => openFacility(nearest.facility.id)}
                  accessibilityHint={t('careMap.viewDetails')}
                />
              </Card>
            </View>
          ) : null}

          {/* ── Results ─────────────────────────────────────────────────── */}
          {isInitialLoading ? (
            <LoadingBlock label={t('careMap.loading')} />
          ) : directory.isError && rows.length === 0 ? (
            <ErrorBlock message={t('careMap.loadError')} onRetry={refetch} />
          ) : (
            <>
              {/* A refresh that failed while rows are on screen must never
                  pass as fresh. */}
              {directory.isError ? (
                <StaleNotice
                  message={t('careMap.loadError')}
                  loadedAt={loadedAt}
                  onRetry={refetch}
                  retrying={directory.isRefetching}
                />
              ) : null}

              {rows.length > 0 ? (
                <View>
                  <SectionHeader
                    title={t('careMap.resultCount', { loaded: rows.length, total })}
                  />
                  {/* The two client-side refinements narrow the pages already
                      fetched, not the 2 728-row query behind them. Saying how
                      many loaded rows they hide keeps "showing N of M" from
                      quietly meaning something else. */}
                  {refinedAway > 0 ? (
                    <Text style={styles.sortNote}>
                      {t('careMap.filterPanel.refinedAway', { count: refinedAway })}
                    </Text>
                  ) : null}
                  <View style={styles.sortRow}>
                    {SORTS.map((key) => {
                      const off = key === 'distance' && !coords;
                      return (
                        <Chip
                          key={key}
                          label={t(`careMap.sort.${key}`)}
                          selected={sort === key}
                          onPress={off ? undefined : () => setSort(key)}
                          style={off ? styles.chipDisabled : undefined}
                        />
                      );
                    })}
                  </View>
                  {directory.hasNextPage ? (
                    <Text style={styles.sortNote}>{t('careMap.sortNote')}</Text>
                  ) : null}
                </View>
              ) : null}

              {rows.length === 0 ? (
                <Card>
                  <EmptyState
                    icon="location"
                    tint="blue"
                    title={t('careMap.empty')}
                    message={hasFilters ? t('careMap.emptyBodyFiltered') : t('careMap.emptyBody')}
                    actionLabel={hasFilters ? t('careMap.clearFilters') : undefined}
                    onAction={hasFilters ? clearAll : undefined}
                  />
                </Card>
              ) : grouped ? (
                <View style={styles.stack}>
                  <FacilityRows rows={located} onOpen={openFacility} t={t} />
                  <SectionHeader
                    variant="overline"
                    title={t('careMap.noDistanceGroup')}
                    style={styles.groupHeader}
                  />
                  <FacilityRows rows={unlocated} onOpen={openFacility} t={t} />
                </View>
              ) : (
                <FacilityRows rows={rows} onOpen={openFacility} t={t} />
              )}

              {directory.hasNextPage ? (
                <CareButton
                  label={t('careMap.loadMore')}
                  variant="secondary"
                  icon="chevron-down"
                  loading={directory.isFetchingNextPage}
                  onPress={() => {
                    void directory.fetchNextPage();
                  }}
                />
              ) : null}

              {rows.length > 0 ? (
                <Text style={styles.disclaimer}>{t('careMap.disclaimer')}</Text>
              ) : null}
            </>
          )}

          {/* ── Find a doctor instead ───────────────────────────────────── */}
          <View style={styles.assist}>
            <View style={styles.assistTop}>
              <View style={styles.assistIcon}>
                <Icon name="person-search" size={20} color={colors.textOnBrand} />
              </View>
              <View style={styles.assistBody}>
                <Text style={styles.assistTitle}>{t('opesCare.findProvider.assistTitle')}</Text>
                <Text style={styles.assistText}>
                  {t('careMap.findDoctor.body', {
                    defaultValue: 'Search clinicians by name or specialty instead.',
                  })}
                </Text>
              </View>
            </View>
            <CareButton
              label={t('opesCare.findProvider.title')}
              variant="secondary"
              size="sm"
              icon="person-search"
              onPress={openDoctors}
            />
          </View>
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  stack: { gap: spacing.sm + 2 },

  mapWrap: { borderRadius: radii.md, overflow: 'hidden' },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primarySoft,
  },
  filterButtonOn: { backgroundColor: colors.surface, borderColor: colors.blue },
  filterText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.link },

  panel: { gap: spacing.md, padding: spacing.md },
  panelSection: { gap: spacing.sm },
  panelLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  panelChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  panelRows: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  panelActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  typeRow: { gap: spacing.sm + 2, paddingRight: spacing.md },
  type: {
    width: 96,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: 6,
  },
  typeOn: { backgroundColor: colors.primarySoft, borderColor: colors.blue },
  typeLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.textPrimary,
    textAlign: 'center',
  },

  chipRow: { gap: spacing.sm, paddingRight: spacing.md },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chipDisabled: { opacity: 0.45 },
  sortNote: {
    marginTop: spacing.sm,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  groupHeader: { marginTop: spacing.sm, marginBottom: 0 },

  rowTrailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowValue: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.link },
  callButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: tintMap.green.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  disclaimer: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },

  assist: {
    gap: spacing.sm + 2,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  assistTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  assistIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistBody: { flex: 1, minWidth: 0 },
  assistTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  assistText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
