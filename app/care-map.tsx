/**
 * Care Access — the patient-facing facility directory (screen 41 "Care Access
 * Map" / 45 "Search & Filter" in the app plan), presented with the OPES UI kit
 * in the layout of design reference `src/screens/care/FindFacilityScreen.tsx` (archived prototype, see docs/DESIGN_REFERENCE.md) (CARE-007).
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
 * There is no map on this screen. A map answers "how do I get to THIS place",
 * which is a question about one facility, so it lives on the facility profile
 * — a list of 903 pins answers nothing and pushes the results off the screen.
 */
import { PaperWave } from '@/components/ui/PaperWave';
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
import { Screen } from '@/components/ui/Screen';
import {
  Card,
  Chip,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  SectionHeader,
  StaleNotice,
  a11yJoin,
  colors,
  radii,
  spacing,
  tintMap,
  typography,
  type IconName,
  type Tint,
} from '@/components/opes-ui';
import { CatalogImage } from '@/components/ui/CatalogImage';
import {
  CardMetaRow,
  CardPill,
  CategoryTile,
  FiltersButton,
  FinderHeading,
  FinderTopBar,
  HelpPanel,
  ResultCard,
  ResultsHeader,
  type FinderAction,
} from '@/components/finder/FinderChrome';
import {
  CareButton,
  ErrorBlock,
  LoadingBlock,
  NoticeBanner,
  SearchField,
} from '@/components/care/shared';
import {
  facilityTypeCounts,
  flattenFacilityPages,
  useFacilityDirectory,
  useFacilityRegistrySummary,
  type FacilityDirectoryRow,
} from '@/lib/api/careMapQueries';
import { useUnreadNotificationCount } from '@/lib/api/appConfigQueries';
import { useAuthStore } from '@/lib/store/auth';
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
  facility: FacilityDirectoryRow;
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
            <Icon name="location" size={24} color={colors.blue} />
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
          <Icon name="location" size={24} color={colors.blue} />
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
  onOpen,
  t,
}: {
  row: FacilityRow;
  onOpen: () => void;
  t: TFunction;
}) {
  const { facility } = row;
  const distance = row.distanceKm != null ? formatDistance(row.distanceKm) : undefined;
  const typeLabel = typeLabelTr(t, facility.facility_type);
  // The card's location line is the reference's "City, Region"; the street
  // address stays on the profile, where there is room to read it.
  const where = joinLocationParts(facility.city, facility.region);

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

  // The reference card carries a photograph, a star rating and a review count.
  // `care_facilities` has no photo column and the schema holds no rating or
  // review anywhere, so none of the three is drawn. The leading mark is the
  // facility-type glyph on its own tint, and the trailing column carries what
  // the payload really reports: whether the listing is connected to OpesCare,
  // and how many clinicians and open slots it publishes.
  const connected = facility.connected;
  const providers = facility.provider_count ?? 0;
  const openSlots = facility.open_slot_count ?? 0;
  // An unconnected listing publishes nothing, so a zero there means "nobody has
  // told us", not "there are none" — it gets no count line at all.
  const countLine =
    connected === false
      ? null
      : providers > 0
        ? String(t('opesCare.findFacility.doctors', { count: providers }))
        : openSlots > 0
          ? String(t('careMap.openSlots', {
              count: openSlots,
              defaultValue: '{{count}} open slots',
            }))
          : null;

  const trailing = (
    <>
      {connected === undefined ? null : (
        <CardPill
          label={
            connected
              ? String(t('facilityRegistry.connectedOnly'))
              : String(t('careMap.directoryOnlyShort', { defaultValue: 'Directory only' }))
          }
          tone={connected ? 'normal' : 'muted'}
        />
      )}
      {countLine ? <Text style={styles.cardCount}>{countLine}</Text> : null}
      {phone ? (
        <TouchableOpacity
          onPress={handleCall}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={a11yJoin(String(t('careMap.call')), facility.facility_name)}
          style={styles.callButton}
        >
          <Icon name="phone" size={24} color={tintMap.green.fg} />
        </TouchableOpacity>
      ) : (
        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      )}
    </>
  );

  return (
    <ResultCard
      mark={
        <CatalogImage
          uri={facility.logo_url}
          size={64}
          radius={radii.sm}
          fit="contain"
          fallback={
            <View style={styles.mark}>
              <Icon
                name={facilityIcon(facility.facility_type)}
                size={26}
                color={tintMap[facilityTint(facility.facility_type)].fg}
              />
            </View>
          }
        />
      }
      trailing={trailing}
      onPress={onOpen}
      accessibilityLabel={a11yJoin(facility.facility_name, typeLabel, where, distance)}
      accessibilityHint={String(t('careMap.viewDetails'))}
    >
      <Text style={styles.cardTitle} numberOfLines={2}>
        {facility.facility_name}
      </Text>
      <Text style={styles.cardType} numberOfLines={1}>
        {typeLabel}
      </Text>
      {where ? <CardMetaRow icon="location" text={where} /> : null}
      {/* 508 of the 903 rows publish no coordinates. A distance line appears
          only when there is a real one to show — never an estimate. */}
      {distance ? <CardMetaRow icon="location" text={distance} /> : null}
    </ResultCard>
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
    <View style={styles.cardStack}>
      {rows.map((row) => (
        <FacilityListRow
          key={row.facility.id}
          row={row}
          onOpen={() => onOpen(row.facility.id)}
          t={t}
        />
      ))}
    </View>
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
  /** Whether the results header's "Sort by" dropdown is showing its options. */
  const [sortOpen, setSortOpen] = useState(false);
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

  // Both of these are authed endpoints, so they are gated on the session the
  // way the home screen gates its bell — an unauthenticated call would fire a
  // 401 into the refresh interceptor for nothing.
  const authed = useAuthStore((s) => s.status) === 'authenticated';
  const unreadCount = useUnreadNotificationCount(authed);
  const registry = useFacilityRegistrySummary(authed);
  const typeCounts = useMemo(() => facilityTypeCounts(registry.data), [registry.data]);

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

  const topActions: FinderAction[] = [
    {
      icon: 'bell',
      onPress: () => router.push('/notifications'),
      accessibilityLabel: String(t('notifications.title')),
      // Real count from GET /mobile/notifications/unread-count. It resolves to
      // 0 — no badge — while loading or on any error.
      badge: unreadCount,
    },
  ];

  return (
    <Screen className="px-0">
      <PaperWave />
      <View style={styles.screen}>
        <FinderTopBar
          onBack={() => router.back()}
          backLabel={String(t('common.back'))}
          actions={topActions}
        />
        <FinderHeading
          title={String(t('careMap.findTitle', { defaultValue: 'Find Facility' }))}
          subtitle={String(t('careMap.findSubtitle', { defaultValue: 'Search and find healthcare facilities' }))}
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
            <View style={styles.searchField}>
              <SearchField
                value={searchInput}
                onChangeText={setSearchInput}
                placeholder={t('careMap.searchByPlaceholder', {
                  defaultValue: 'Search by facility name, type or location',
                })}
                onSubmit={applySearch}
              />
            </View>
            <FiltersButton
              label={String(t('opesCare.findFacility.filters'))}
              count={activeFilterCount}
              open={filtersOpen}
              onPress={() => setFiltersOpen((open) => !open)}
              accessibilityHint={String(t('careMap.filterPanel.hint'))}
            />
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
                <CategoryTile
                  key={filter.key}
                  icon={filter.value ? facilityIcon(filter.value) : 'grid'}
                  label={String(t(`careMap.filters.${filter.key}`))}
                  /* Real `count(*)` from the registry summary. A type with no
                     row — or a failed summary — passes undefined, and the tile
                     then shows no figure at all rather than a zero. */
                  count={typeCounts[filter.value]}
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
                <View style={styles.resultsBlock}>
                  <ResultsHeader
                    title={String(t('careMap.facilitiesFound', {
                      count: total || rows.length,
                      defaultValue: '{{count}} Facilities Found',
                    }))}
                    sortLabel={String(
                      t('careMap.sortBy', {
                        label: t(`careMap.sort.${sort}`),
                        defaultValue: 'Sort by: {{label}}',
                      }),
                    )}
                    sortOpen={sortOpen}
                    onSortPress={() => setSortOpen((open) => !open)}
                    sortAccessibilityLabel={String(t('careMap.sortChoose', { defaultValue: 'Change sort order' }))}
                  />
                  {/* The dropdown the button opens. Every sort the screen has
                      ever offered is here; distance stays dimmed and inert
                      until there is a position to measure from. */}
                  {sortOpen ? (
                    <View style={styles.sortRow}>
                      {SORTS.map((key) => {
                        const off = key === 'distance' && !coords;
                        return (
                          <Chip
                            key={key}
                            label={t(`careMap.sort.${key}`)}
                            selected={sort === key}
                            onPress={
                              off
                                ? undefined
                                : () => {
                                    setSort(key);
                                    setSortOpen(false);
                                  }
                            }
                            style={off ? styles.chipDisabled : undefined}
                          />
                        );
                      })}
                    </View>
                  ) : null}
                  {/* "Showing N of M" — the list is paged and ordering only
                      applies to what has been fetched, which is said rather
                      than hidden. */}
                  <Text style={styles.sortNote}>
                    {t('careMap.resultCount', { loaded: rows.length, total })}
                  </Text>
                  {/* The two client-side refinements narrow the pages already
                      fetched, not the 2 728-row query behind them. Saying how
                      many loaded rows they hide keeps "showing N of M" from
                      quietly meaning something else. */}
                  {refinedAway > 0 ? (
                    <Text style={styles.sortNote}>
                      {t('careMap.filterPanel.refinedAway', { count: refinedAway })}
                    </Text>
                  ) : null}
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
                <Icon name="person-search" size={24} color={colors.blue} />
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

          {/* ── Closing help panel ──────────────────────────────────────── */}
          <HelpPanel
            title={String(t('careMap.helpTitle', { defaultValue: "Can't find the facility you need?" }))}
            body={String(t('careMap.helpBody', {
              defaultValue: 'Let us help you locate the right facility for your care.',
            }))}
            actionLabel={String(t('opesCare.findFacility.requestHelp'))}
            actionIcon="headset"
            onAction={() => router.push('/help')}
          />
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  stack: { gap: spacing.sm + 2 },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  searchField: { flex: 1, minWidth: 0 },

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

  resultsBlock: { gap: spacing.sm },

  /* Result card — the leading mark stands in for the reference's photograph,
     which this platform has no column for. */
  cardStack: { gap: spacing.sm + 2 },
  mark: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 17,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  cardType: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.blue,
  },
  cardCount: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  callButton: {
    width: 32,
    height: 32,
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
