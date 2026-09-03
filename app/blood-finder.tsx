import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  BadgeCheck,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleDot,
  Clock,
  Crosshair,
  Droplet,
  Droplets,
  FlaskConical,
  Globe,
  Hexagon,
  Hospital,
  Info,
  LocateFixed,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Siren,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../components/ui/Screen';
import { colors } from '../theme/tokens';
import { useAuthStore } from '../lib/store/auth';
import { useNationwideBloodSearch } from '../lib/api/bloodQueries';
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
} from '../lib/api/queries';

/**
 * Blood Finder — pick a blood group + component, see which facilities near the
 * chosen origin report units as available, then request (reserve) some.
 *
 * This screen is used by someone who is frightened and in a hurry, so it is
 * laid out as three numbered steps in the order a person actually thinks:
 * *what group*, *what component*, *where*. The group grid is the single most
 * important control on the screen and is sized accordingly — one tap, big
 * target, unmistakable selected state.
 *
 * The layout grammar (search origin + radius chips, a nearby-results list, a
 * drill-in that performs the action) is deliberately the Medicine Finder's
 * (`app/pharmacy.tsx`, matched to `a_clean_mobile_app_ui_screenshot_of_a_medicine_fi.png`),
 * because that reference *is* this screen's archetype and inventing a second
 * grammar for the same job would cost the patient time.
 *
 * ── On empty results ────────────────────────────────────────────────────────
 * `blood_availability` is facility-self-reported and frequently empty, so "no
 * results" is the NORMAL outcome, not an edge case. It is therefore built as a
 * first-class screen state with real, working next steps — widen the radius,
 * search the whole country (a supported origin-less query), switch to a
 * clinically compatible group that *does* have reported stock, fall back to
 * whole blood, or go find a hospital to phone. Nothing here is faked: every
 * number on this screen came from the API.
 */

interface City {
  key: string;
  name: string;
  lat: number;
  lng: number;
}

const CITIES: City[] = [
  { key: 'douala', name: 'Douala, Cameroon', lat: 4.0511, lng: 9.7679 },
  { key: 'yaounde', name: 'Yaounde, Cameroon', lat: 3.848, lng: 11.5021 },
  { key: 'bafoussam', name: 'Bafoussam, Cameroon', lat: 5.4737, lng: 10.4179 },
  { key: 'bamenda', name: 'Bamenda, Cameroon', lat: 5.9631, lng: 10.1591 },
  { key: 'buea', name: 'Buea, Cameroon', lat: 4.1527, lng: 9.292 },
  { key: 'garoua', name: 'Garoua, Cameroon', lat: 9.3017, lng: 13.3921 },
];

/** Blood travels further than a pharmacy trip — the radii start wider. */
const RADIUS_OPTIONS = [10, 25, 50, 100];

/** The backed values of App\Enums\BloodComponentType, in display order. */
const COMPONENT_FALLBACK: BloodComponentValue[] = [
  'whole_blood',
  'red_cells',
  'platelets',
  'plasma',
];

/** Maps the `icon` key App\Enums\BloodComponentType returns onto a Lucide icon. */
const COMPONENT_ICONS: Record<string, LucideIcon> = {
  droplet: Droplet,
  'circle-dot': CircleDot,
  hexagon: Hexagon,
  'flask-conical': FlaskConical,
};

/** Blood banks and hospitals read differently on a list; give them their own mark. */
function iconForFacility(type: string): LucideIcon {
  switch (type) {
    case 'blood_bank':
      return Droplets;
    case 'hospital':
      return Hospital;
    default:
      return Building2;
  }
}

function freshnessTone(freshness: string | undefined): string {
  switch (freshness) {
    case 'fresh':
      return colors.semantic.success;
    case 'recent':
      return colors.semantic.warning;
    case 'stale':
      return colors.semantic.danger;
    default:
      return colors.navy.muted;
  }
}

/**
 * `care_facilities.verification_status` is one of unverified / self_reported /
 * license_verified / government_verified. Only the last two are an actual
 * check by someone other than the facility, so only those earn the badge.
 */
function isVerified(status: string | null | undefined): boolean {
  return status === 'license_verified' || status === 'government_verified';
}

/** A tel: URI wants digits and a leading +, nothing else. */
function dial(number: string | null | undefined): void {
  if (!number) return;
  Linking.openURL(`tel:${number.replace(/[^+\d]/g, '')}`).catch(() => undefined);
}

export default function BloodFinderScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const patient = useAuthStore((s) => s.patient);

  const [bloodGroup, setBloodGroup] = useState<BloodGroupValue | null>(null);
  const [componentType, setComponentType] = useState<BloodComponentValue>('whole_blood');
  const [city, setCity] = useState<City>(CITIES[0]);
  const [deviceCoords, setDeviceCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [radiusKm, setRadiusKm] = useState(25);
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [radiusPickerOpen, setRadiusPickerOpen] = useState(false);
  const [nationwideOpen, setNationwideOpen] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedTerm(term.trim().toLowerCase()), 300);
    return () => clearTimeout(handle);
  }, [term]);

  // A nationwide sweep is opt-in per search — changing what is being looked for
  // makes the previous sweep's answer meaningless.
  useEffect(() => {
    setNationwideOpen(false);
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
  const rows = search.data ?? [];
  const results = useMemo(() => {
    if (!debouncedTerm) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(debouncedTerm) ||
        (row.city ?? '').toLowerCase().includes(debouncedTerm),
    );
  }, [rows, debouncedTerm]);

  const openRequests = requests.data ?? [];
  const nextRadius = RADIUS_OPTIONS.find((r) => r > radiusKm) ?? null;

  const closePickers = useCallback(() => {
    setCityPickerOpen(false);
    setRadiusPickerOpen(false);
  }, []);

  /**
   * expo-location is a real dependency of this app (see app.json's plugin list
   * and app/(auth)/permissions.tsx), so "near me" is an actual GPS fix. If the
   * patient declines, or the fix fails, the city picker stays the origin — the
   * search never silently stops working.
   */
  const useMyLocation = useCallback(async () => {
    setLocating(true);
    setLocationDenied(false);
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

  // 8 groups in a 4-across grid; computed so the tiles line up exactly rather
  // than relying on percentage flex-basis rounding.
  const tileWidth = Math.floor((width - 48 - 3 * 10) / 4);

  return (
    <Screen className="px-0">
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="mt-2 flex-row items-center justify-between">
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('bloodFinder.back')}
            className="h-10 w-10 items-center justify-center rounded-xl border border-cream-300 bg-white"
          >
            <ChevronLeft size={20} color={colors.navy.text} />
          </Pressable>

          <View className="flex-row items-center">
            <LinearGradient
              colors={[colors.brand[300], colors.brand[500], colors.brand[700]]}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 8,
              }}
            >
              <Droplets color={colors.cream[50]} size={14} />
            </LinearGradient>
            <Text className="text-lg font-extrabold text-navy-text">Opes</Text>
            <Text className="text-lg font-extrabold text-brand-500">Care</Text>
          </View>

          <Pressable
            onPress={useMyLocation}
            disabled={locating}
            className="h-10 flex-row items-center rounded-xl border border-cream-300 bg-white px-3"
            accessibilityRole="button"
            accessibilityLabel={t('bloodFinder.useMyLocation')}
          >
            {locating ? (
              <ActivityIndicator size="small" color={colors.brand[600]} />
            ) : (
              <LocateFixed size={15} color={colors.brand[600]} />
            )}
            <Text className="ml-1.5 text-xs font-semibold text-navy-text">
              {locating ? t('bloodFinder.locating') : t('bloodFinder.myLocation')}
            </Text>
          </Pressable>
        </View>

        {/* Title */}
        <Text className="mt-6 text-3xl font-extrabold text-navy-text">
          {t('bloodFinder.title')}
        </Text>
        <Text className="mt-1 text-sm leading-5 text-navy-secondary">
          {t('bloodFinder.subtitle')}
        </Text>

        {/*
          Escalation, above everything else. Blood stock here is self-reported
          and may be hours old; a patient who is actually in danger should be
          moving toward a hospital, not filtering a list. No emergency hotline
          number is hardcoded — none exists anywhere in this codebase and
          inventing one would be dangerous — so both actions lead to real
          screens that surface real, API-sourced numbers.
        */}
        <View
          className="mt-5 flex-row rounded-2xl p-4"
          style={{
            backgroundColor: colors.semantic.dangerSurface,
            borderWidth: 1,
            borderColor: colors.semantic.danger,
          }}
        >
          <View
            className="mr-3 h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.white }}
          >
            <Siren size={19} color={colors.semantic.danger} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-extrabold" style={{ color: colors.semantic.danger }}>
              {t('bloodFinder.emergencyTitle')}
            </Text>
            <Text className="mt-1 text-[11px] leading-4 text-navy-secondary">
              {t('bloodFinder.emergencyBody')}
            </Text>
            <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
              <Pressable
                onPress={() => router.push('/care-map')}
                accessibilityRole="button"
                className="flex-row items-center rounded-xl px-3 py-2"
                style={{ backgroundColor: colors.semantic.danger }}
              >
                <Hospital size={13} color={colors.white} />
                <Text className="ml-1.5 text-[11px] font-bold" style={{ color: colors.white }}>
                  {t('bloodFinder.emergencyFindEr')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/help')}
                accessibilityRole="button"
                className="flex-row items-center rounded-xl border bg-white px-3 py-2"
                style={{ borderColor: colors.semantic.danger }}
              >
                <Phone size={13} color={colors.semantic.danger} />
                <Text
                  className="ml-1.5 text-[11px] font-bold"
                  style={{ color: colors.semantic.danger }}
                >
                  {t('bloodFinder.emergencySupport')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* ── Step 1 — blood group ─────────────────────────────────────────── */}
        <View className="mt-7 flex-row items-center justify-between">
          <Text className="text-base font-extrabold text-navy-text">
            {t('bloodFinder.stepGroup')}
          </Text>
          {ownGroup ? (
            <Pressable
              onPress={() => setBloodGroup(ownGroup.value)}
              accessibilityRole="button"
              className="flex-row items-center rounded-xl border border-brand-500 bg-brand-50 px-3 py-1.5"
            >
              <Droplet size={12} color={colors.brand[600]} />
              <Text className="ml-1.5 text-[11px] font-bold text-brand-700">
                {t('bloodFinder.yourGroup', { group: ownGroup.label })}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {options.isPending ? (
          <View className="mt-4 flex-row flex-wrap" style={{ gap: 10 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <View
                key={i}
                className="rounded-2xl border border-cream-300 bg-cream-200"
                style={{ width: tileWidth, height: 66 }}
              />
            ))}
          </View>
        ) : options.isError ? (
          <ErrorPanel
            message={t('bloodFinder.loadFailed')}
            actionLabel={t('bloodFinder.retry')}
            onRetry={() => options.refetch()}
          />
        ) : (
          <View className="mt-3 flex-row flex-wrap" style={{ gap: 10 }}>
            {groupOptions.map((group) => (
              <GroupTile
                key={group.value}
                group={group}
                width={tileWidth}
                selected={group.value === bloodGroup}
                onPress={() => setBloodGroup(group.value === bloodGroup ? null : group.value)}
              />
            ))}
          </View>
        )}

        {/* Compatibility hint for the chosen group */}
        {selectedGroup ? (
          <View className="mt-4 flex-row rounded-2xl border border-cream-300 bg-white p-4">
            <Info size={16} color={colors.semantic.info} />
            <View className="ml-3 flex-1">
              <Text className="text-xs font-bold text-navy-text">
                {t('bloodFinder.compatibleTitle', { group: selectedGroup.label })}
              </Text>
              <Text className="mt-1 text-[11px] leading-4 text-navy-secondary">
                {t('bloodFinder.compatibleBody', {
                  group: selectedGroup.label,
                  groups: selectedGroup.can_receive_from.join(', '),
                })}
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── Step 2 — component ───────────────────────────────────────────── */}
        <Text className="mt-7 text-base font-extrabold text-navy-text">
          {t('bloodFinder.stepComponent')}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3"
          contentContainerStyle={{ gap: 8, paddingRight: 24 }}
        >
          {(componentOptions.length > 0
            ? componentOptions.map((c) => ({ value: c.value, icon: c.icon }))
            : COMPONENT_FALLBACK.map((value) => ({ value, icon: 'droplet' }))
          ).map(({ value, icon }) => {
            const Icon = COMPONENT_ICONS[icon] ?? Droplet;
            const active = value === componentType;
            return (
              <Pressable
                key={value}
                onPress={() => setComponentType(value)}
                accessibilityRole="button"
                className={`h-11 flex-row items-center rounded-2xl border px-4 ${
                  active ? 'border-brand-500 bg-brand-50' : 'border-cream-300 bg-white'
                }`}
                style={active ? { borderWidth: 2 } : undefined}
              >
                <Icon size={15} color={active ? colors.brand[600] : colors.navy.secondary} />
                <Text
                  className={`ml-2 text-xs font-bold ${
                    active ? 'text-brand-700' : 'text-navy-secondary'
                  }`}
                >
                  {t(`bloodFinder.components.${value}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Step 3 — where ───────────────────────────────────────────────── */}
        <Text className="mt-7 text-base font-extrabold text-navy-text">
          {t('bloodFinder.stepWhere')}
        </Text>
        <View className="mt-3 flex-row" style={{ gap: 8 }}>
          <FilterChip
            icon={deviceCoords ? LocateFixed : MapPin}
            label={originLabel}
            caret
            active={cityPickerOpen}
            onPress={() => {
              const next = !cityPickerOpen;
              closePickers();
              setCityPickerOpen(next);
            }}
          />
          <FilterChip
            icon={Crosshair}
            label={t('bloodFinder.radius', { km: radiusKm })}
            caret
            active={radiusPickerOpen}
            onPress={() => {
              const next = !radiusPickerOpen;
              closePickers();
              setRadiusPickerOpen(next);
            }}
          />
        </View>

        {locationDenied ? (
          <Text className="mt-2 text-[11px] text-navy-muted">
            {t('bloodFinder.locationDenied')}
          </Text>
        ) : null}

        {cityPickerOpen ? (
          <OptionPanel>
            {CITIES.map((option) => (
              <OptionRow
                key={option.key}
                label={option.name}
                selected={!deviceCoords && option.key === city.key}
                onPress={() => {
                  setCity(option);
                  setDeviceCoords(null);
                  setCityPickerOpen(false);
                }}
              />
            ))}
          </OptionPanel>
        ) : null}

        {radiusPickerOpen ? (
          <OptionPanel>
            {RADIUS_OPTIONS.map((option) => (
              <OptionRow
                key={option}
                label={t('bloodFinder.radius', { km: option })}
                selected={option === radiusKm}
                onPress={() => {
                  setRadiusKm(option);
                  setRadiusPickerOpen(false);
                }}
              />
            ))}
          </OptionPanel>
        ) : null}

        {/* ── Results ──────────────────────────────────────────────────────── */}
        {!bloodGroup ? (
          <View className="mt-7 items-center rounded-2xl border border-cream-300 bg-white px-6 py-9">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-brand-50">
              <Droplets size={22} color={colors.brand[600]} />
            </View>
            <Text className="mt-3 text-center text-sm font-bold text-navy-text">
              {t('bloodFinder.chooseGroupTitle')}
            </Text>
            <Text className="mt-1 text-center text-xs leading-4 text-navy-secondary">
              {t('bloodFinder.chooseGroupBody')}
            </Text>
          </View>
        ) : (
          <>
            <View className="mt-7 flex-row items-center justify-between">
              <Text className="flex-1 pr-2 text-base font-extrabold text-navy-text">
                {search.isPending
                  ? t('bloodFinder.searching')
                  : t('bloodFinder.nearbyBanks', { count: results.length })}
              </Text>
              {results.length > 0 ? (
                <View className="rounded-xl border border-cream-300 bg-white px-3 py-1.5">
                  <Text className="text-[11px] font-semibold text-navy-secondary">
                    {t('bloodFinder.sortByDistance')}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* A filter box only earns its space once there is a list to filter. */}
            {rows.length > 3 || debouncedTerm ? (
              <View className="mt-3 h-12 flex-row items-center rounded-2xl border border-cream-300 bg-white px-4">
                <Search size={16} color={colors.brand[600]} />
                <TextInput
                  value={term}
                  onChangeText={setTerm}
                  placeholder={t('bloodFinder.filterResults')}
                  placeholderTextColor={colors.navy.muted}
                  className="ml-3 flex-1 text-sm text-navy-text"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {term.length > 0 ? (
                  <Pressable
                    onPress={() => setTerm('')}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('bloodFinder.clear')}
                  >
                    <View className="h-6 w-6 items-center justify-center rounded-full bg-cream-200">
                      <X size={13} color={colors.navy.secondary} />
                    </View>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {search.isPending ? (
              <View className="mt-3" style={{ gap: 12 }}>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </View>
            ) : search.isError ? (
              <ErrorPanel
                message={t('bloodFinder.loadFailed')}
                actionLabel={t('bloodFinder.retry')}
                onRetry={() => search.refetch()}
              />
            ) : results.length === 0 ? (
              <NoStockPanel
                radiusKm={radiusKm}
                nextRadius={nextRadius}
                onWiden={() => {
                  if (nextRadius) setRadiusKm(nextRadius);
                }}
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
                nationwideRows={nationwide.data ?? []}
                onFindHospital={() => router.push('/care-map')}
                onOpenFacility={goToRequest}
              />
            ) : (
              <View className="mt-3" style={{ gap: 12 }}>
                {results.map((facility) => (
                  <BloodBankCard
                    key={facility.id}
                    facility={facility}
                    onRequest={() => goToRequest(facility)}
                  />
                ))}
              </View>
            )}
          </>
        )}

        {/* Open requests */}
        {openRequests.length > 0 ? (
          <>
            <Text className="mt-8 text-base font-extrabold text-navy-text">
              {t('bloodFinder.myRequests')}
            </Text>
            <View className="mt-3" style={{ gap: 10 }}>
              {openRequests.map((request) => (
                <OpenRequestCard
                  key={request.id}
                  request={request}
                  cancelling={cancelRequest.isPending}
                  onCancel={() => cancelRequest.mutate({ id: request.id })}
                />
              ))}
            </View>
          </>
        ) : null}

        {/* Safety notice */}
        <View className="mt-7 flex-row rounded-2xl border border-brand-100 bg-brand-50 p-4">
          <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-white">
            <ShieldCheck size={18} color={colors.brand[600]} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-navy-text">
              {t('bloodFinder.safetyTitle')}
            </Text>
            <Text className="mt-1 text-xs leading-4 text-navy-secondary">
              {t('bloodFinder.safetyBody')}
            </Text>
          </View>
        </View>

        <View className="h-10" />
      </ScrollView>
    </Screen>
  );
}

/* -- Pieces ---------------------------------------------------------------- */

/**
 * One blood group. The selected state is a filled gold gradient rather than a
 * tinted border because at a glance, under stress, "which one did I pick" must
 * be answerable from across the room.
 */
function GroupTile({
  group,
  width,
  selected,
  onPress,
}: {
  group: BloodGroupOption;
  width: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const has = group.facility_count > 0;
  const caption = has ? t('bloodFinder.sites', { count: group.facility_count }) : t('bloodFinder.noSites');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${group.label} — ${caption}`}
      style={{ width }}
    >
      {selected ? (
        // className does not reach LinearGradient (no cssInterop registered),
        // so every bit of its layout has to be inline style.
        <LinearGradient
          colors={[colors.brand[600], colors.brand[500], colors.brand[300]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            height: 66,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text className="text-xl font-extrabold" style={{ color: colors.white }}>
            {group.label}
          </Text>
          <Text
            className="mt-0.5 text-[9px] font-bold"
            numberOfLines={1}
            style={{ color: colors.cream[100] }}
          >
            {caption}
          </Text>
        </LinearGradient>
      ) : (
        <View
          className="items-center justify-center rounded-2xl border border-cream-300 bg-white"
          style={{ height: 66 }}
        >
          <Text className="text-xl font-extrabold text-navy-text">{group.label}</Text>
          <Text
            className="mt-0.5 text-[9px] font-semibold"
            numberOfLines={1}
            style={{ color: has ? colors.semantic.success : colors.navy.muted }}
          >
            {caption}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * A facility that reports the requested units.
 *
 * Two explicit actions rather than a whole-card tap: calling ahead is the thing
 * the safety notice tells every patient to do first, and burying it behind a
 * detail screen would cost a tap at the worst possible moment.
 */
function BloodBankCard({
  facility,
  onRequest,
}: {
  facility: BloodBankResult;
  onRequest: () => void;
}) {
  const { t } = useTranslation();
  const FacilityIcon = iconForFacility(facility.facility_type);
  const availability = facility.availability;
  const phone = facility.emergency_contact ?? facility.phone;
  const tone = freshnessTone(availability?.freshness);

  return (
    <View className="rounded-2xl border border-cream-300 bg-white p-4">
      <View className="flex-row">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-brand-50">
          <FacilityIcon size={22} color={colors.brand[600]} />
        </View>

        <View className="ml-3 flex-1">
          <View className="flex-row items-center">
            <Text className="flex-1 pr-2 text-sm font-extrabold text-navy-text" numberOfLines={2}>
              {facility.name}
            </Text>
            {isVerified(facility.verification_status) ? (
              <View className="flex-row items-center">
                <BadgeCheck size={13} color={colors.semantic.info} />
                <Text
                  className="ml-1 text-[10px] font-bold"
                  style={{ color: colors.semantic.info }}
                >
                  {t('bloodFinder.verified')}
                </Text>
              </View>
            ) : null}
          </View>

          <View className="mt-1 flex-row items-center">
            <MapPin size={11} color={colors.navy.muted} />
            <Text className="ml-1 flex-1 text-[11px] text-navy-secondary" numberOfLines={1}>
              {facility.distance_km === null
                ? t('bloodFinder.distanceUnknown')
                : t('bloodFinder.distanceKm', { km: facility.distance_km })}
              {facility.city ? `  •  ${facility.city}` : ''}
            </Text>
          </View>
        </View>
      </View>

      {/* Availability band — the number the patient came for. */}
      <View className="mt-3 flex-row items-center justify-between rounded-xl bg-cream-200 px-3 py-2.5">
        <View className="flex-1 pr-2">
          <Text className="text-[10px] font-semibold text-navy-muted">
            {availability
              ? `${availability.blood_group}  •  ${t(`bloodFinder.components.${availability.component_type}`)}`
              : ''}
          </Text>
          <Text className="mt-0.5 text-sm font-extrabold text-navy-text">
            {availability?.units_range
              ? t('bloodFinder.unitsRange', { range: availability.units_range })
              : t('bloodFinder.unitsUnknown')}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Clock size={11} color={tone} />
          <Text className="ml-1 text-[10px] font-bold" style={{ color: tone }}>
            {t(`bloodFinder.freshness.${availability?.freshness ?? 'stale'}`, {
              defaultValue: t('bloodFinder.freshness.stale'),
            })}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row" style={{ gap: 8 }}>
        <Pressable
          onPress={() => dial(phone)}
          disabled={!phone}
          accessibilityRole="button"
          accessibilityLabel={t('bloodFinder.call')}
          className="h-11 flex-1 flex-row items-center justify-center rounded-xl border border-brand-500 bg-white"
          style={{ opacity: phone ? 1 : 0.45 }}
        >
          <Phone size={14} color={colors.brand[600]} />
          <Text className="ml-2 text-xs font-bold text-brand-600">
            {phone ? t('bloodFinder.callShort') : t('bloodFinder.noPhone')}
          </Text>
        </Pressable>

        <Pressable
          onPress={onRequest}
          accessibilityRole="button"
          style={{ flex: 1.4 }}
          accessibilityLabel={t('bloodFinder.requestUnits')}
        >
          <LinearGradient
            colors={[colors.brand[600], colors.brand[500], colors.brand[300]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{
              height: 44,
              borderRadius: 12,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text className="text-xs font-bold" style={{ color: colors.white }}>
              {t('bloodFinder.requestUnits')}
            </Text>
            <ChevronRight size={14} color={colors.white} />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
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
  onFindHospital,
  onOpenFacility,
}: {
  radiusKm: number;
  nextRadius: number | null;
  onWiden: () => void;
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
  onFindHospital: () => void;
  onOpenFacility: (facility: BloodBankResult) => void;
}) {
  const { t } = useTranslation();

  return (
    <View className="mt-3 overflow-hidden rounded-2xl border border-cream-300 bg-white">
      <View className="items-center px-6 pb-5 pt-7">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-cream-200">
          <Droplets size={24} color={colors.navy.muted} />
        </View>
        <Text className="mt-3 text-center text-sm font-extrabold text-navy-text">
          {t('bloodFinder.noResults', { km: radiusKm })}
        </Text>
        <Text className="mt-2 text-center text-[11px] leading-4 text-navy-secondary">
          {t('bloodFinder.empty.body')}
        </Text>
      </View>

      <View className="border-t border-cream-200 px-4 py-4">
        <Text className="text-xs font-extrabold text-navy-text">
          {t('bloodFinder.empty.nextSteps')}
        </Text>

        <View className="mt-3" style={{ gap: 8 }}>
          {nextRadius ? (
            <ActionRow
              icon={Crosshair}
              label={t('bloodFinder.empty.widen', { km: nextRadius })}
              onPress={onWiden}
            />
          ) : null}

          {onWholeBlood ? (
            <ActionRow
              icon={Droplet}
              label={t('bloodFinder.empty.tryWholeBlood')}
              onPress={onWholeBlood}
            />
          ) : null}

          {!nationwideOpen ? (
            <ActionRow
              icon={Globe}
              label={t('bloodFinder.empty.nationwide')}
              onPress={onNationwide}
            />
          ) : null}

          <ActionRow
            icon={Hospital}
            label={t('bloodFinder.empty.callHospital')}
            onPress={onFindHospital}
          />
        </View>

        {/* Compatible groups — clinically grounded (App\Enums\BloodGroup) and
            annotated with what the API says is actually reported. */}
        {compatibleGroups.length > 0 ? (
          <>
            <Text className="mt-5 text-[11px] font-bold text-navy-secondary">
              {t('bloodFinder.empty.compatible', { group })}
            </Text>
            <View className="mt-2 flex-row flex-wrap" style={{ gap: 8 }}>
              {compatibleGroups.map((option) => {
                const has = option.facility_count > 0;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => onPickGroup(option.value)}
                    accessibilityRole="button"
                    className={`flex-row items-center rounded-xl border px-3 py-2 ${
                      has ? 'border-brand-500 bg-brand-50' : 'border-cream-300 bg-white'
                    }`}
                  >
                    <Text
                      className={`text-xs font-extrabold ${
                        has ? 'text-brand-700' : 'text-navy-secondary'
                      }`}
                    >
                      {option.label}
                    </Text>
                    <Text
                      className="ml-1.5 text-[10px] font-semibold"
                      style={{ color: has ? colors.semantic.success : colors.navy.muted }}
                    >
                      {has
                        ? t('bloodFinder.sites', { count: option.facility_count })
                        : t('bloodFinder.noSites')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {/* Nationwide sweep */}
        {nationwideOpen ? (
          <View className="mt-5 rounded-2xl bg-cream-200 p-4">
            {nationwidePending ? (
              <View className="flex-row items-center">
                <ActivityIndicator size="small" color={colors.brand[600]} />
                <Text className="ml-3 text-[11px] text-navy-secondary">
                  {t('bloodFinder.empty.checking')}
                </Text>
              </View>
            ) : nationwideError ? (
              <Text className="text-[11px]" style={{ color: colors.semantic.danger }}>
                {t('bloodFinder.empty.failed')}
              </Text>
            ) : nationwideRows.length === 0 ? (
              <>
                <Text className="text-[11px] font-bold text-navy-text">
                  {t('bloodFinder.empty.nationwideNone', {
                    group,
                    component: componentLabel,
                  })}
                </Text>
                <Text className="mt-2 text-[11px] leading-4 text-navy-secondary">
                  {t('bloodFinder.empty.nationwideNoneHint')}
                </Text>
              </>
            ) : (
              <>
                <Text className="text-[11px] font-bold text-navy-text">
                  {t('bloodFinder.empty.nationwideFound', { count: nationwideRows.length })}
                </Text>
                <View className="mt-3" style={{ gap: 10 }}>
                  {nationwideRows.slice(0, 5).map((facility) => (
                    <BloodBankCard
                      key={facility.id}
                      facility={facility}
                      onRequest={() => onOpenFacility(facility)}
                    />
                  ))}
                </View>
              </>
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ActionRow({
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
      accessibilityRole="button"
      className="h-12 flex-row items-center rounded-xl border border-cream-300 bg-white px-3"
    >
      <View className="h-8 w-8 items-center justify-center rounded-lg bg-brand-50">
        <Icon size={15} color={colors.brand[600]} />
      </View>
      <Text className="ml-3 flex-1 text-xs font-bold text-navy-text">{label}</Text>
      <ChevronRight size={15} color={colors.navy.muted} />
    </Pressable>
  );
}

/** Status tone for a request the patient already placed. */
function statusTone(status: string): string {
  switch (status) {
    case 'confirmed':
    case 'ready':
    case 'fulfilled':
      return colors.semantic.success;
    case 'pending':
      return colors.semantic.warning;
    case 'rejected':
    case 'expired':
      return colors.semantic.danger;
    default:
      return colors.navy.muted;
  }
}

function urgencyTone(urgency: string): string {
  switch (urgency) {
    case 'emergency':
      return colors.semantic.danger;
    case 'urgent':
      return colors.semantic.warning;
    default:
      return colors.navy.secondary;
  }
}

function OpenRequestCard({
  request,
  cancelling,
  onCancel,
}: {
  request: BloodRequest;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const tone = statusTone(request.status);
  const uTone = urgencyTone(request.urgency);

  return (
    <View className="rounded-2xl border border-cream-300 bg-white p-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <View className="flex-row items-center">
            <Text className="text-sm font-extrabold text-navy-text">
              {`${request.blood_group}  •  ${t(`bloodFinder.components.${request.component_type}`)}`}
            </Text>
            <View
              className="ml-2 rounded-md px-1.5 py-0.5"
              style={{
                backgroundColor:
                  request.urgency === 'emergency'
                    ? colors.semantic.dangerSurface
                    : request.urgency === 'urgent'
                      ? colors.semantic.warningSurface
                      : colors.cream[200],
              }}
            >
              <Text className="text-[9px] font-extrabold" style={{ color: uTone }}>
                {t(`bloodFinder.urgencies.${request.urgency}`)}
              </Text>
            </View>
          </View>
          <Text className="mt-1 text-[11px] text-navy-secondary" numberOfLines={1}>
            {request.facility?.name ?? ''}
          </Text>
          <Text className="mt-1 text-[11px] text-navy-muted">
            {`${t('bloodFinder.reference', { reference: request.reference })}  •  ${request.quantity} ${t('bloodFinder.request.quantity')}`}
          </Text>
        </View>

        <View className="rounded-lg px-2 py-1" style={{ backgroundColor: colors.cream[200] }}>
          <Text className="text-[10px] font-bold" style={{ color: tone }}>
            {t(`bloodFinder.statuses.${request.status}`, { defaultValue: request.status_label })}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row" style={{ gap: 8 }}>
        {request.facility?.phone ? (
          <Pressable
            onPress={() => dial(request.facility?.phone)}
            accessibilityRole="button"
            className="h-10 flex-1 flex-row items-center justify-center rounded-xl border border-brand-500"
          >
            <Phone size={13} color={colors.brand[600]} />
            <Text className="ml-2 text-xs font-bold text-brand-600">
              {t('bloodFinder.callShort')}
            </Text>
          </Pressable>
        ) : null}

        {request.is_cancellable ? (
          <Pressable
            onPress={onCancel}
            disabled={cancelling}
            accessibilityRole="button"
            className="h-10 flex-1 items-center justify-center rounded-xl border"
            style={{ opacity: cancelling ? 0.5 : 1, borderColor: colors.semantic.danger }}
          >
            {cancelling ? (
              <ActivityIndicator size="small" color={colors.semantic.danger} />
            ) : (
              <Text className="text-xs font-bold" style={{ color: colors.semantic.danger }}>
                {t('bloodFinder.request.cancel')}
              </Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Placeholder card while the search runs — communicates "working", not "broken". */
function SkeletonCard() {
  return (
    <View className="rounded-2xl border border-cream-300 bg-white p-4">
      <View className="flex-row">
        <View className="h-14 w-14 rounded-2xl bg-cream-200" />
        <View className="ml-3 flex-1 justify-center">
          <View className="h-3 w-3/4 rounded-full bg-cream-200" />
          <View className="mt-2 h-2.5 w-1/2 rounded-full bg-cream-200" />
        </View>
      </View>
      <View className="mt-3 h-12 rounded-xl bg-cream-200" />
    </View>
  );
}

function FilterChip({
  icon: Icon,
  label,
  onPress,
  active,
  caret,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  active?: boolean;
  caret?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`h-11 flex-1 flex-row items-center rounded-2xl border px-3 ${
        active ? 'border-brand-500 bg-brand-50' : 'border-cream-300 bg-white'
      }`}
    >
      <Icon size={14} color={active ? colors.brand[600] : colors.navy.secondary} />
      <Text
        className={`ml-1.5 flex-1 text-xs font-semibold ${
          active ? 'text-brand-700' : 'text-navy-text'
        }`}
        numberOfLines={1}
      >
        {label}
      </Text>
      {caret ? <ChevronDown size={13} color={colors.navy.muted} /> : null}
    </Pressable>
  );
}

function OptionPanel({ children }: { children: React.ReactNode }) {
  return (
    <View className="mt-2 overflow-hidden rounded-2xl border border-cream-300 bg-white">
      {children}
    </View>
  );
}

function OptionRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center justify-between border-b border-cream-200 px-4 py-3"
    >
      <Text className={`text-sm ${selected ? 'font-bold text-brand-700' : 'text-navy-text'}`}>
        {label}
      </Text>
      {selected ? <View className="h-2 w-2 rounded-full bg-brand-500" /> : null}
    </Pressable>
  );
}

function ErrorPanel({
  message,
  actionLabel,
  onRetry,
}: {
  message: string;
  actionLabel: string;
  onRetry: () => void;
}) {
  return (
    <View className="mt-4 items-center rounded-2xl border border-cream-300 bg-white px-6 py-8">
      <CircleAlert size={22} color={colors.semantic.danger} />
      <Text className="mt-2 text-center text-sm text-navy-secondary">{message}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        className="mt-3 rounded-xl border border-brand-500 px-4 py-2"
      >
        <Text className="text-xs font-bold text-brand-600">{actionLabel}</Text>
      </Pressable>
    </View>
  );
}
