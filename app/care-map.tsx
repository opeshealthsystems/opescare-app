import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ArrowLeft,
  ChevronRight,
  LocateFixed,
  MapPin,
  MapPinned,
  Navigation,
  Phone,
  Search,
  Settings,
} from 'lucide-react-native';
import { Screen } from '../components/ui/Screen';
import { TextField } from '../components/ui/TextField';
import { flattenFacilityPages, useFacilityDirectory } from '../lib/api/careMapQueries';
import type { CareFacilitySummary } from '../lib/api/queries';
import {
  CITY_SCOPES,
  DEFAULT_CITY_SCOPE,
  TYPE_FILTERS,
  directionsUrl,
  facilityDistanceKm,
  formatDistance,
  iconForFacilityType,
  joinLocationParts,
  normalizeText,
  sortFacilities,
  telUrl,
  type Coords,
  type FacilitySort,
} from '../lib/careMap/facilityDisplay';
import { colors } from '../theme/tokens';

/**
 * Care Access — the patient-facing facility directory (screen 41 "Care Access
 * Map" / 45 "Search & Filter" in the app plan).
 *
 * Backed by `GET /mobile/facilities`, which serves 903 real Cameroonian
 * institutions across all ten regions. Three properties of that endpoint shape
 * this screen:
 *
 *  - **It applies no ORDER BY.** Rows come back in physical table order, which
 *    begins on rural integrated health centres ("CSI Ndogbessol, Eseka"). An
 *    unscoped first screen therefore looked broken. The fix is the area scope:
 *    the directory opens on a city (the patient's own once location is granted,
 *    Yaoundé otherwise), which lands the first rows on CHU de Yaoundé, the
 *    Hôpital Gynéco-Obstétrique et Pédiatrique, Centre Pasteur and the district
 *    hospitals. "All Cameroon" stays one tap away and says plainly that it is
 *    registry order.
 *  - **Only 395 of 903 rows carry GPS.** Distance is optional everywhere: rows
 *    without coordinates keep a distance-free layout and, under distance sort,
 *    sit in a clearly labelled group at the end rather than being dropped.
 *  - **It has no sort parameter.** Ordering is client-side over the pages
 *    fetched so far, which the "showing N of M" line next to the sort control
 *    states rather than hides.
 *
 * There is no map canvas here: `react-native-maps` is not a dependency of this
 * app, and drawing a fake one would be worse than not drawing one. The
 * reference's map is represented by the nearest-facility spotlight and the
 * per-row directions deep links.
 */

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

/* ── Chips ──────────────────────────────────────────────────────────────── */

function Chip({
  label,
  active,
  onPress,
  disabled = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="rounded-full border px-4 py-2"
      style={{
        borderColor: active ? colors.brand[500] : colors.cream[300],
        backgroundColor: active ? colors.brand[500] : colors.white,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text
        className="text-xs font-semibold"
        style={{ color: active ? colors.white : colors.navy.secondary }}
      >
        {label}
      </Text>
    </Pressable>
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
  // 'checking' keeps the gradient card from flashing in for the split second
  // before we know an already-granted permission exists.
  if (state === 'granted' || state === 'checking') return null;

  if (state === 'denied' || state === 'unavailable') {
    return (
      <View
        className="mb-4 flex-row items-start rounded-2xl p-4"
        style={{ backgroundColor: colors.brand[50] }}
      >
        <View
          className="mr-3 h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.white }}
        >
          <LocateFixed size={18} color={colors.brand[600]} />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-bold text-navy-text">
            {state === 'denied' ? t('careMap.locationDenied.title') : t('careMap.locationUnavailable.title')}
          </Text>
          <Text className="mt-1 text-xs leading-4 text-navy-secondary">
            {state === 'denied'
              ? t('careMap.locationDenied.body', { city: cityLabel })
              : t('careMap.locationUnavailable.body', { city: cityLabel })}
          </Text>
          {state === 'denied' ? (
            <Pressable
              onPress={() => Linking.openSettings().catch(() => {})}
              className="mt-3 flex-row items-center self-start rounded-xl border px-3 py-2"
              style={{ borderColor: colors.brand[300] }}
            >
              <Settings size={13} color={colors.brand[600]} />
              <Text className="ml-2 text-xs font-semibold text-brand-600">
                {t('careMap.locationDenied.action')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  const busy = state === 'requesting';

  return (
    <LinearGradient
      colors={[colors.brand[600], colors.brand[500], colors.brand[300]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      // NativeWind's className→style transform does not apply to
      // expo-linear-gradient (no cssInterop registered), so it must be inline.
      style={{ borderRadius: 20, padding: 18, marginBottom: 16 }}
    >
      <View className="flex-row items-start">
        <View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-white/90">
          <LocateFixed size={20} color={colors.brand[600]} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-extrabold text-white">
            {t('careMap.locationCta.title')}
          </Text>
          <Text className="mt-1 text-xs leading-4 text-white/90">
            {t('careMap.locationCta.body')}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onRequest}
        disabled={busy}
        className="mt-4 h-12 flex-row items-center justify-center rounded-2xl bg-white"
        style={{ opacity: busy ? 0.7 : 1 }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.brand[600]} />
        ) : (
          <Navigation size={16} color={colors.brand[600]} />
        )}
        <Text className="ml-2 text-sm font-bold text-brand-600">
          {busy ? t('careMap.locationCta.working') : t('careMap.locationCta.action')}
        </Text>
      </Pressable>
    </LinearGradient>
  );
}

/* ── Nearest-facility spotlight ─────────────────────────────────────────── */

function NearestFacilityCard({
  row,
  onOpen,
  onDirections,
  t,
}: {
  row: FacilityRow;
  onOpen: () => void;
  onDirections: () => void;
  t: TFunction;
}) {
  const Icon = iconForFacilityType(row.facility.facility_type);
  const meta = [
    row.distanceKm != null ? formatDistance(row.distanceKm) : null,
    t(`careMap.types.${row.facility.facility_type}`, {
      defaultValue: row.facility.facility_type,
    }),
    row.facility.city,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="mb-4 rounded-2xl bg-white p-4">
      <View className="flex-row items-center">
        <View
          className="mr-3 h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: colors.brand[50] }}
        >
          <Icon size={20} color={colors.brand[600]} />
        </View>
        <View className="flex-1">
          <Text className="text-[10px] font-bold uppercase tracking-wide text-navy-muted">
            {t('careMap.nearestTitle')}
          </Text>
          <Text className="mt-0.5 text-base font-extrabold text-navy-text" numberOfLines={1}>
            {row.facility.facility_name}
          </Text>
          <Text className="mt-0.5 text-xs text-navy-secondary" numberOfLines={1}>
            {meta}
          </Text>
        </View>
        <Pressable
          onPress={onDirections}
          hitSlop={6}
          className="ml-3 h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.brand[500] }}
        >
          <Navigation size={18} color={colors.white} />
        </Pressable>
      </View>
      <Pressable
        onPress={onOpen}
        className="mt-3 flex-row items-center justify-between pt-3"
        style={{ borderTopWidth: 1, borderTopColor: colors.cream[300] }}
      >
        <Text className="text-sm font-semibold text-brand-600">{t('careMap.viewDetails')}</Text>
        <ChevronRight size={16} color={colors.brand[600]} />
      </Pressable>
    </View>
  );
}

/* ── List row ───────────────────────────────────────────────────────────── */

function FacilityCard({
  row,
  onOpen,
  t,
}: {
  row: FacilityRow;
  onOpen: () => void;
  t: TFunction;
}) {
  const { facility } = row;
  const Icon = iconForFacilityType(facility.facility_type);

  const handleDirections = () => {
    const url = directionsUrl(facility);
    if (url) Linking.openURL(url).catch(() => {});
  };

  const handleCall = () => {
    if (!facility.phone_primary) return;
    Linking.openURL(telUrl(facility.phone_primary)).catch(() => {});
  };

  return (
    <View className="mb-3 rounded-2xl bg-white p-4">
      <Pressable onPress={onOpen} className="flex-row items-start">
        <View
          className="mr-3 h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: colors.brand[50] }}
        >
          <Icon size={20} color={colors.brand[600]} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-start">
            <Text className="mr-2 flex-1 text-base font-bold text-navy-text" numberOfLines={2}>
              {facility.facility_name}
            </Text>
            {row.distanceKm != null ? (
              <View
                className="flex-row items-center rounded-full px-2 py-0.5"
                style={{ backgroundColor: colors.brand[50] }}
              >
                <Navigation size={10} color={colors.brand[600]} />
                <Text className="ml-1 text-[11px] font-bold text-brand-600">
                  {formatDistance(row.distanceKm)}
                </Text>
              </View>
            ) : null}
          </View>
          <View className="mt-1 flex-row items-start">
            <MapPin size={12} color={colors.navy.muted} style={{ marginTop: 2 }} />
            <Text className="ml-1 flex-1 text-xs text-navy-secondary" numberOfLines={2}>
              {joinLocationParts(facility.address, facility.city, facility.region) || '—'}
            </Text>
          </View>
          <View className="mt-2 flex-row items-center">
            <View className="self-start rounded-full bg-cream-200 px-2.5 py-1">
              <Text className="text-[10px] font-semibold uppercase text-navy-secondary">
                {t(`careMap.types.${facility.facility_type}`, {
                  defaultValue: facility.facility_type,
                })}
              </Text>
            </View>
          </View>
        </View>
        <ChevronRight size={18} color={colors.navy.muted} style={{ marginTop: 12 }} />
      </Pressable>

      <View className="mt-3 flex-row" style={{ gap: 8 }}>
        <Pressable
          onPress={handleDirections}
          className="flex-1 flex-row items-center justify-center rounded-xl border py-2.5"
          style={{ borderColor: colors.brand[300] }}
        >
          <Navigation size={14} color={colors.brand[600]} />
          <Text className="ml-2 text-xs font-semibold text-brand-600">
            {t('careMap.directions')}
          </Text>
        </Pressable>
        {facility.phone_primary ? (
          <Pressable
            onPress={handleCall}
            className="flex-1 flex-row items-center justify-center rounded-xl py-2.5"
            style={{ backgroundColor: colors.brand[500] }}
          >
            <Phone size={14} color={colors.white} />
            <Text className="ml-2 text-xs font-semibold text-white">{t('careMap.call')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
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

  const rows = useMemo<FacilityRow[]>(() => {
    const effectiveSort: FacilitySort = sort === 'distance' && !coords ? 'relevance' : sort;
    return sortFacilities(facilities, effectiveSort, coords, i18n.language).map((facility) => ({
      facility,
      distanceKm: facilityDistanceKm(coords, facility),
    }));
  }, [facilities, sort, coords, i18n.language]);

  const nearest = useMemo<FacilityRow | null>(() => {
    if (!coords) return null;
    let best: FacilityRow | null = null;
    for (const row of rows) {
      if (row.distanceKm == null) continue;
      if (!best || row.distanceKm < (best.distanceKm as number)) best = row;
    }
    return best;
  }, [rows, coords]);

  const total = directory.data?.pages[0]?.pagination.total ?? 0;
  const cityLabel = cityScope || t('careMap.areaAll');
  const isInitialLoading = directory.isLoading;
  const hasFilters = !!appliedSearch || !!typeFilter || !!cityScope;

  const resetToArea = (city: string) => {
    setCityScope(city);
    setAreaAutoMatched(false);
    setAreaUnmatched(false);
  };

  const openFacility = (id: string) => router.push(`/facility/${id}`);

  const openDirections = (facility: CareFacilitySummary) => {
    const url = directionsUrl(facility);
    if (url) Linking.openURL(url).catch(() => {});
  };

  const listHeader = (
    <View>
      <LocationPrompt
        state={locationState}
        cityLabel={cityLabel}
        onRequest={requestLocation}
        t={t}
      />

      {areaAutoMatched ? (
        <View className="mb-4 flex-row items-center rounded-xl px-3 py-2" style={{ backgroundColor: colors.semantic.successSurface }}>
          <LocateFixed size={13} color={colors.semantic.success} />
          <Text className="ml-2 flex-1 text-[11px] text-navy-secondary">
            {t('careMap.areaMatched', { city: cityScope })}
          </Text>
        </View>
      ) : null}

      {areaUnmatched ? (
        <View className="mb-4 flex-row items-center rounded-xl px-3 py-2" style={{ backgroundColor: colors.cream[200] }}>
          <MapPin size={13} color={colors.navy.muted} />
          <Text className="ml-2 flex-1 text-[11px] text-navy-secondary">
            {t('careMap.areaUnmatched', { city: cityLabel })}
          </Text>
        </View>
      ) : null}

      {!cityScope ? (
        <View className="mb-4 flex-row items-start rounded-xl px-3 py-2.5" style={{ backgroundColor: colors.cream[200] }}>
          <MapPinned size={13} color={colors.navy.muted} style={{ marginTop: 1 }} />
          <Text className="ml-2 flex-1 text-[11px] leading-4 text-navy-secondary">
            {t('careMap.areaAllHint')}
          </Text>
        </View>
      ) : null}

      {nearest ? (
        <NearestFacilityCard
          row={nearest}
          onOpen={() => openFacility(nearest.facility.id)}
          onDirections={() => openDirections(nearest.facility)}
          t={t}
        />
      ) : null}

      {rows.length > 0 ? (
        <View className="mb-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-semibold text-navy-secondary">
              {t('careMap.resultCount', { loaded: rows.length, total })}
            </Text>
            <View className="flex-row" style={{ gap: 6 }}>
              {(['relevance', 'distance', 'name'] as const).map((key) => (
                <Pressable
                  key={key}
                  onPress={() => setSort(key)}
                  disabled={key === 'distance' && !coords}
                  className="rounded-full px-3 py-1.5"
                  style={{
                    backgroundColor: sort === key ? colors.brand[50] : colors.white,
                    borderWidth: 1,
                    borderColor: sort === key ? colors.brand[300] : colors.cream[300],
                    opacity: key === 'distance' && !coords ? 0.4 : 1,
                  }}
                >
                  <Text
                    className="text-[11px] font-semibold"
                    style={{ color: sort === key ? colors.brand[600] : colors.navy.secondary }}
                  >
                    {t(`careMap.sort.${key}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          {directory.hasNextPage ? (
            <Text className="mt-1 text-[10px] text-navy-muted">{t('careMap.sortNote')}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen className="px-0">
      {/* ── Pinned header: identity, search, type filters ─────────────── */}
      <View className="flex-row items-center px-6 pt-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-full border border-brand-300"
        >
          <ArrowLeft size={18} color={colors.brand[600]} />
        </Pressable>
        <View className="ml-4 flex-1">
          <Text className="text-lg font-extrabold text-navy-text" numberOfLines={1}>
            {t('careMap.title')}
          </Text>
          <Text className="text-xs text-navy-secondary" numberOfLines={1}>
            {t('careMap.subtitle')}
          </Text>
        </View>
        {locationState === 'granted' ? (
          <View
            className="ml-2 flex-row items-center rounded-full px-3 py-1.5"
            style={{ backgroundColor: colors.brand[50] }}
          >
            <LocateFixed size={12} color={colors.brand[600]} />
            <Text className="ml-1 text-[10px] font-bold text-brand-600">
              {t('careMap.locationOn')}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="px-6 pt-4">
        <TextField
          placeholder={t('careMap.searchPlaceholder')}
          icon={Search}
          value={searchInput}
          onChangeText={setSearchInput}
          onSubmitEditing={() => setAppliedSearch(searchInput.trim())}
          returnKeyType="search"
          autoCorrect={false}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mt-1 grow-0"
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 24 }}
      >
        {TYPE_FILTERS.map((filter) => (
          <Chip
            key={filter.key}
            label={t(`careMap.filters.${filter.key}`)}
            active={typeFilter === filter.value}
            onPress={() => setTypeFilter(filter.value)}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-2 grow-0"
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 24 }}
      >
        <Chip
          label={t('careMap.areaAll')}
          active={cityScope === ''}
          onPress={() => resetToArea('')}
        />
        {/* A geocoded city that is not one of the presets still gets a chip, so
            the scope the app picked from the patient's position is visible and
            reversible rather than silently applied. */}
        {detectedCity && !CITY_SCOPES.some((city) => city === detectedCity) ? (
          <Chip
            label={detectedCity}
            active={cityScope === detectedCity}
            onPress={() => resetToArea(detectedCity)}
          />
        ) : null}
        {CITY_SCOPES.map((city) => (
          <Chip
            key={city}
            label={city}
            active={cityScope === city}
            onPress={() => resetToArea(city)}
          />
        ))}
      </ScrollView>

      {/* ── Results ───────────────────────────────────────────────────── */}
      {isInitialLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.brand[500]} />
          <Text className="mt-3 text-xs text-navy-secondary">{t('careMap.loading')}</Text>
        </View>
      ) : directory.isError && rows.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-brand-50">
            <MapPinned size={26} color={colors.brand[500]} />
          </View>
          <Text className="text-center text-sm text-navy-secondary">{t('careMap.loadError')}</Text>
          <Pressable
            onPress={() => directory.refetch()}
            className="mt-4 rounded-xl px-5 py-2.5"
            style={{ backgroundColor: colors.brand[500] }}
          >
            <Text className="text-sm font-semibold text-white">{t('careMap.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          className="mt-4 flex-1"
          keyExtractor={(item) => item.facility.id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={directory.isRefetching && !directory.isFetchingNextPage}
              onRefresh={() => directory.refetch()}
              tintColor={colors.brand[500]}
            />
          }
          ListHeaderComponent={listHeader}
          renderItem={({ item, index }) => {
            // Under distance sort the coordinate-less rows are grouped at the
            // end behind an explicit label — they are never hidden, and they
            // never render a fabricated distance.
            const startsUnlocatedGroup =
              sort === 'distance' &&
              !!coords &&
              item.distanceKm == null &&
              index > 0 &&
              rows[index - 1].distanceKm != null;

            return (
              <View>
                {startsUnlocatedGroup ? (
                  <View className="mb-3 mt-1 flex-row items-center">
                    <View className="h-px flex-1" style={{ backgroundColor: colors.cream[300] }} />
                    <Text className="mx-3 text-[10px] font-semibold uppercase tracking-wide text-navy-muted">
                      {t('careMap.noDistanceGroup')}
                    </Text>
                    <View className="h-px flex-1" style={{ backgroundColor: colors.cream[300] }} />
                  </View>
                ) : null}
                <FacilityCard row={item} onOpen={() => openFacility(item.facility.id)} t={t} />
              </View>
            );
          }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-6 pt-16">
              <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-brand-50">
                <MapPinned size={26} color={colors.brand[500]} />
              </View>
              <Text className="text-base font-semibold text-navy-text">{t('careMap.empty')}</Text>
              <Text className="mt-1 text-center text-sm text-navy-secondary">
                {hasFilters ? t('careMap.emptyBodyFiltered') : t('careMap.emptyBody')}
              </Text>
              {hasFilters ? (
                <Pressable
                  onPress={() => {
                    setSearchInput('');
                    setAppliedSearch('');
                    setTypeFilter('');
                    resetToArea('');
                  }}
                  className="mt-4 rounded-xl border px-5 py-2.5"
                  style={{ borderColor: colors.brand[300] }}
                >
                  <Text className="text-sm font-semibold text-brand-600">
                    {t('careMap.clearFilters')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          }
          ListFooterComponent={
            <View>
              {directory.hasNextPage ? (
                <Pressable
                  onPress={() => directory.fetchNextPage()}
                  disabled={directory.isFetchingNextPage}
                  className="mt-2 items-center rounded-xl border py-3"
                  style={{
                    borderColor: colors.brand[300],
                    opacity: directory.isFetchingNextPage ? 0.6 : 1,
                  }}
                >
                  {directory.isFetchingNextPage ? (
                    <ActivityIndicator size="small" color={colors.brand[500]} />
                  ) : (
                    <Text className="text-xs font-semibold text-brand-600">
                      {t('careMap.loadMore')}
                    </Text>
                  )}
                </Pressable>
              ) : null}
              {rows.length > 0 ? (
                <Text className="mt-4 text-center text-[10px] leading-4 text-navy-muted">
                  {t('careMap.disclaimer')}
                </Text>
              ) : null}
            </View>
          }
        />
      )}
    </Screen>
  );
}
