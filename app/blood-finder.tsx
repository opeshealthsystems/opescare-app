import { useCallback, useEffect, useMemo, useState } from 'react';
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
  ScreenHeader,
  SectionHeader,
  StaleNotice,
  StatusBadge,
  formatLabel,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import { CareButton, LoadingBlock, NoticeBanner } from '@/components/care/shared';
import { useAuthStore } from '@/lib/store/auth';
import { useNationwideBloodSearch } from '@/lib/api/bloodQueries';
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
 * ── On empty results ────────────────────────────────────────────────────────
 * `blood_availability` is facility-self-reported and frequently empty, so "no
 * results" is the NORMAL outcome, not an edge case. It is therefore built as a
 * first-class screen state with real, working next steps — widen the radius,
 * search the whole country (a supported origin-less query), switch to a
 * clinically compatible group that *does* have reported stock, fall back to
 * whole blood, or go find a hospital to phone. Nothing here is faked: every
 * number on this screen came from the API.
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
  { key: 'douala', name: 'Douala, Cameroon', lat: 4.0511, lng: 9.7679 },
  { key: 'yaounde', name: 'Yaounde, Cameroon', lat: 3.848, lng: 11.5021 },
  { key: 'bafoussam', name: 'Bafoussam, Cameroon', lat: 5.4737, lng: 10.4179 },
  { key: 'bamenda', name: 'Bamenda, Cameroon', lat: 5.9631, lng: 10.1591 },
  { key: 'buea', name: 'Buea, Cameroon', lat: 4.1527, lng: 9.292 },
  { key: 'garoua', name: 'Garoua, Cameroon', lat: 9.3017, lng: 13.3921 },
];

/** Blood travels further than a pharmacy trip — the radii start wider. */
const RADIUS_OPTIONS = [10, 25, 50, 100];

/** Nationwide sweep rows shown inline before the patient goes looking further. */
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

/** English fallbacks for the stock-status badge (see the i18n note in the report). */
const STOCK_FALLBACK: Record<string, string> = {
  available: 'Available',
  in_stock: 'Available',
  low: 'Low stock',
  limited: 'Low stock',
  none: 'None reported',
  out_of_stock: 'None reported',
  unavailable: 'Not reported',
  unknown: 'Not reported',
};

/** available → success · low → warning · none → critical (per the kit's tones). */
function stockTone(status: string | null | undefined): StatusTone {
  switch ((status ?? '').toLowerCase()) {
    case 'available':
    case 'in_stock':
      return 'normal';
    case 'low':
    case 'limited':
      return 'warning';
    case 'none':
    case 'out_of_stock':
    case 'unavailable':
      return 'critical';
    default:
      return 'neutral';
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

type SheetKey = 'city' | 'radius' | null;

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
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [sheet, setSheet] = useState<SheetKey>(null);
  const [nationwideOpen, setNationwideOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
  const rows = useMemo(() => search.data ?? [], [search.data]);
  const results = useMemo(() => {
    if (!debouncedTerm) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(debouncedTerm) ||
        (row.city ?? '').toLowerCase().includes(debouncedTerm),
    );
  }, [rows, debouncedTerm]);

  // Only the results that actually carry coordinates can be plotted; the map is
  // suppressed entirely when none do (embedMapUrl would also return null, but
  // guarding here keeps the surrounding spacing from rendering an empty gap).
  const mappable = useMemo(
    () => results.filter((row) => row.latitude != null && row.longitude != null),
    [results],
  );

  const openRequests = requests.data ?? [];
  const nextRadius = RADIUS_OPTIONS.find((r) => r > radiusKm) ?? null;

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

  /** Cancelling a reservation is unrecoverable — confirm before firing it. */
  const confirmCancel = (request: BloodRequest) =>
    dialog.confirm({
      title: t('bloodFinder.request.cancel'),
      message: [
        `${request.blood_group}  •  ${t(`bloodFinder.components.${request.component_type}`)}`,
        request.facility?.name,
        t('bloodFinder.reference', { reference: request.reference }),
      ]
        .filter(Boolean)
        .join('\n'),
      confirmLabel: t('bloodFinder.request.cancel'),
      destructive: true,
      onConfirm: async () => {
        try {
          await cancelRequest.mutateAsync({ id: request.id });
        } catch {
          dialog.alert(
            t('bloodFinder.loadFailed'),
            t('bloodFinder.errors.REQUEST_NOT_CANCELLABLE'),
            'critical',
          );
        }
      },
    });

  const headerActions = [
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
      <ScreenHeader
        title={t('bloodFinder.title')}
        subtitle={t('bloodFinder.subtitle')}
        onBack={goBack}
        actions={headerActions}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />
        }
      >
        {/*
          Escalation, above everything else. Blood stock here is self-reported
          and may be hours old; a patient who is actually in danger should be
          moving toward a hospital, not filtering a list. No emergency hotline
          number is hardcoded — none exists anywhere in this codebase and
          inventing one would be dangerous — so both actions lead to real
          screens that surface real, API-sourced numbers.
        */}
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

        {/* ── Step 1 — blood group ─────────────────────────────────────────── */}
        <View>
          <SectionHeader
            title={t('bloodFinder.stepGroup')}
            actionLabel={ownGroup ? t('bloodFinder.yourGroup', { group: ownGroup.label }) : undefined}
            onAction={ownGroup ? () => setBloodGroup(ownGroup.value) : undefined}
          />

          {options.isPending ? (
            <LoadingBlock label={t('bloodFinder.searching')} />
          ) : options.isError ? (
            <Card variant="flush">
              <EmptyState
                icon="alert-circle"
                tint="red"
                title={t('bloodFinder.loadFailed')}
                actionLabel={t('bloodFinder.retry')}
                onAction={() => options.refetch()}
              />
            </Card>
          ) : (
            <View style={styles.chipWrap}>
              {groupOptions.map((group) => (
                <Chip
                  key={group.value}
                  icon="droplet"
                  label={group.label}
                  count={group.facility_count > 0 ? group.facility_count : undefined}
                  selected={group.value === bloodGroup}
                  onPress={() => setBloodGroup(group.value === bloodGroup ? null : group.value)}
                  accessibilityLabel={`${group.label} — ${
                    group.facility_count > 0
                      ? t('bloodFinder.sites', { count: group.facility_count })
                      : t('bloodFinder.noSites')
                  }`}
                />
              ))}
            </View>
          )}
        </View>

        {/* Compatibility hint for the chosen group */}
        {selectedGroup ? (
          <NoticeBanner
            icon="info"
            tone="pending"
            title={t('bloodFinder.compatibleTitle', { group: selectedGroup.label })}
            message={t('bloodFinder.compatibleBody', {
              group: selectedGroup.label,
              groups: selectedGroup.can_receive_from.join(', '),
            })}
          />
        ) : null}

        {/* ── Step 2 — component ───────────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('bloodFinder.stepComponent')} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRail}
            contentContainerStyle={styles.chipRailContent}
          >
            {(componentOptions.length > 0
              ? componentOptions.map((c) => ({ value: c.value, icon: c.icon }))
              : COMPONENT_FALLBACK.map((value) => ({ value, icon: 'droplet' }))
            ).map(({ value, icon }) => (
              <Chip
                key={value}
                icon={COMPONENT_ICONS[icon] ?? 'droplet'}
                label={t(`bloodFinder.components.${value}`)}
                selected={value === componentType}
                onPress={() => setComponentType(value)}
              />
            ))}
          </ScrollView>
        </View>

        {/* ── Step 3 — where ───────────────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('bloodFinder.stepWhere')} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRail}
            contentContainerStyle={styles.chipRailContent}
          >
            <Chip
              icon="location"
              label={originLabel}
              selected={sheet === 'city'}
              onPress={() => setSheet((s) => (s === 'city' ? null : 'city'))}
              accessibilityLabel={t('bloodFinder.changeLocation')}
            />
            <Chip
              icon="target"
              label={t('bloodFinder.radius', { km: radiusKm })}
              selected={sheet === 'radius'}
              onPress={() => setSheet((s) => (s === 'radius' ? null : 'radius'))}
            />
            <Chip
              icon="location"
              label={locating ? t('bloodFinder.locating') : t('bloodFinder.myLocation')}
              selected={!!deviceCoords}
              onPress={() => {
                void useMyLocation();
              }}
              accessibilityLabel={t('bloodFinder.useMyLocation')}
            />
          </ScrollView>

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
            <OptionCard title={t('bloodFinder.radius', { km: radiusKm })}>
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
            <View style={styles.afterRail}>
              <NoticeBanner
                icon="location"
                tone="warning"
                message={t('bloodFinder.locationDenied')}
              />
            </View>
          ) : null}
        </View>

        {/* ── Results ──────────────────────────────────────────────────────── */}
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
              />
              <Text style={styles.sectionHint}>
                {t('bloodFinder.sortByDistance')}
                {'  ·  '}
                {`${bloodGroup}  •  ${selectedComponentLabel}`}
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
                filtered={!!debouncedTerm}
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
                nationwideRows={nationwide.data ?? []}
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
                {results.map((facility) => (
                  <BloodBankCard
                    key={facility.id}
                    facility={facility}
                    onRequest={() => goToRequest(facility)}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Open requests */}
        {openRequests.length > 0 ? (
          <View style={styles.stack}>
            <SectionHeader title={t('bloodFinder.myRequests')} />
            {openRequests.map((request) => (
              <OpenRequestCard
                key={request.id}
                request={request}
                cancelling={
                  cancelRequest.isPending && cancelRequest.variables?.id === request.id
                }
                onCancel={() => confirmCancel(request)}
              />
            ))}
          </View>
        ) : null}

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
 * A facility that reports the requested units.
 *
 * One `Card variant="flush"`: the kit `ListRow` (red tint circle, distance and
 * the stock `StatusBadge` on the right) over the two actions the patient came
 * for. Tapping the row and pressing "Request units" do the same thing.
 */
function BloodBankCard({
  facility,
  onRequest,
}: {
  facility: BloodBankResult;
  onRequest: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const availability = facility.availability;
  const phone = facility.emergency_contact ?? facility.phone;
  // `status` is the facility's own stock word; `unknown` keeps the badge from
  // rendering an empty pill if a row ever arrives without one.
  const stockKey = (availability?.status ?? '').toLowerCase() || 'unknown';
  const stockLabel = availability
    ? t(`bloodFinder.stock.${stockKey}`, {
        defaultValue: STOCK_FALLBACK[stockKey] ?? formatLabel(availability.status),
      })
    : t('bloodFinder.unitsUnknown');
  const distance =
    facility.distance_km === null
      ? t('bloodFinder.distanceUnknown')
      : t('bloodFinder.distanceKm', { km: facility.distance_km });

  return (
    <Card variant="flush">
      <ListRow
        icon={facilityIcon(facility.facility_type)}
        tint={BLOOD_TINT}
        title={facility.name}
        meta={[
          facility.city,
          availability?.units_range
            ? t('bloodFinder.unitsRange', { range: availability.units_range })
            : t('bloodFinder.unitsUnknown'),
          availability?.freshness
            ? t(`bloodFinder.freshness.${availability.freshness}`, {
                defaultValue: t('bloodFinder.freshness.stale'),
              })
            : null,
          isVerified(facility.verification_status) ? t('bloodFinder.verified') : null,
        ]}
        trailing={
          <View style={styles.rowAside}>
            <Text style={styles.rowValue} numberOfLines={1}>
              {distance}
            </Text>
            <StatusBadge
              status={stockKey}
              tone={stockTone(stockKey)}
              label={stockLabel}
              size="sm"
            />
          </View>
        }
        onPress={onRequest}
        accessibilityHint={t('bloodFinder.requestUnits')}
        divider
      />

      <View style={styles.cardFoot}>
        <CareButton
          label={phone ? t('bloodFinder.callShort') : t('bloodFinder.noPhone')}
          icon="phone"
          variant="secondary"
          size="sm"
          disabled={!phone}
          onPress={() => dial(phone)}
          style={styles.footCall}
        />
        <View style={styles.footCta}>
          <GradientButton
            label={t('bloodFinder.requestUnits')}
            icon="none"
            onPress={onRequest}
            accessibilityHint={t('bloodFinder.request.subtitle')}
          />
        </View>
      </View>
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
          title={t('bloodFinder.noResults', { km: radiusKm })}
          message={t('bloodFinder.noResultsHint')}
          actionLabel={t('bloodFinder.clear')}
          onAction={onClearFilter}
        />
      </Card>
    );
  }

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
                    ? t('bloodFinder.sites', { count: option.facility_count })
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
              <SectionHeader
                variant="overline"
                title={t('bloodFinder.empty.nationwideFound', { count: nationwideRows.length })}
              />
              <View style={styles.stack}>
                {nationwideRows.slice(0, NATIONWIDE_PREVIEW).map((facility) => (
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const phone = request.facility?.phone ?? null;

  return (
    <Card variant="flush">
      <ListRow
        icon="receipt"
        tint={BLOOD_TINT}
        title={`${request.blood_group}  •  ${t(`bloodFinder.components.${request.component_type}`)}`}
        meta={[
          request.facility?.name,
          t('bloodFinder.reference', { reference: request.reference }),
          `${request.quantity} ${t('bloodFinder.request.quantity')}`,
        ]}
        chevron={false}
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
        divider={!!phone || request.is_cancellable}
      />

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
