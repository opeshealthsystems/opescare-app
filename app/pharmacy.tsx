import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  ListRow,
  PillInput,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  formatDateTime,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
} from '@/components/opes-ui';
import { FactCell, MedButton, TintCircle } from '@/components/meds/shared';
import { FacilityMap } from '@/components/map/FacilityMap';
import {
  useCancelMedicineReservation,
  useMedicineCategories,
  useMedicineReservations,
  useNearbyPharmacies,
  type Medicine,
  type MedicineCategoryValue,
  type MedicineReservation,
  type NearbyPharmacy,
} from '@/lib/api/queries';
import { formatXaf, formatXafBare, useMedicineCatalog } from '@/lib/api/pharmacyQueries';

/**
 * Medicine Finder — search the national catalogue, see where a medicine is
 * stocked, and manage the holds you already have.
 *
 * Presentation: the OPES kit (`ScreenHeader` → `PillInput` search → filter and
 * category `Chip`s → results as `Card variant="flush"` + `ListRow`s → nearby
 * pharmacies with the embedded `FacilityMap` → safety strip), in the app's own
 * palette via `useTheme()`. Layout reference: `UIUX/src/screens/meds/
 * OrderFromPharmacyScreen.tsx`. The reference's two-column desktop split (list
 * on the left, "Selected Medicine" on the right) is a drill-in on a phone:
 * tapping a medicine opens app/pharmacy/[medicineId].tsx.
 *
 * Data layer is untouched: `useMedicineCatalog`, `useMedicineCategories`,
 * `useNearbyPharmacies`, `useMedicineReservations`, `useCancelMedicineReservation`.
 *
 * Location is a city picker, not a device GPS fix: the app ships no native
 * location dependency, and GET /mobile/pharmacy/nearby takes a plain lat/lng,
 * so a chosen city is a real search origin rather than a stub.
 *
 * Endpoint parameter names differ between the two pharmacy endpoints and are
 * easy to transpose:
 *   /mobile/pharmacy/medicines → q, category, prescription_required, per_page
 *                                (no coordinates — verified against
 *                                MobilePharmacyController::searchMedicines)
 *   /mobile/pharmacy/nearby    → lat, lng, radius_km, medicine_id, only_stocking
 */

interface City {
  key: string;
  name: string;
  lat: number;
  lng: number;
}

/** Search origins. Coordinates are the city centres the API's Haversine filter
 *  measures from — the real pharmacy rows carry OpenStreetMap coordinates. */
const CITIES: City[] = [
  { key: 'douala', name: 'Douala, Cameroon', lat: 4.0511, lng: 9.7679 },
  { key: 'yaounde', name: 'Yaounde, Cameroon', lat: 3.848, lng: 11.5021 },
  { key: 'bafoussam', name: 'Bafoussam, Cameroon', lat: 5.4737, lng: 10.4179 },
  { key: 'bamenda', name: 'Bamenda, Cameroon', lat: 5.9631, lng: 10.1591 },
  { key: 'buea', name: 'Buea, Cameroon', lat: 4.1527, lng: 9.292 },
  { key: 'garoua', name: 'Garoua, Cameroon', lat: 9.3017, lng: 13.3921 },
];

/** MedicineFinderService::MAX_RADIUS_KM is 50 — never offer more than that. */
const RADIUS_OPTIONS = [2, 5, 10, 25, 50];

/** Nearby pharmacies shown before the "show all" toggle (the API returns 25). */
const NEARBY_PREVIEW = 6;

/**
 * Maps the `category_icon` key MedicineCategory::iconKey() returns onto a kit
 * glyph. Every value the enum can emit is covered; `first-aid` is the
 * defensive fallback if the enum gains a case before this map does.
 */
const CATEGORY_ICONS: Record<string, IconName> = {
  pill: 'pill',
  'shield-plus': 'shield',
  droplet: 'droplet',
  'heart-pulse': 'heart-pulse',
  'flask-conical': 'flask',
  wind: 'lungs',
  sparkles: 'sun',
  'circle-dot': 'target',
  bug: 'microscope',
  baby: 'baby',
  package: 'first-aid',
};

const FALLBACK_CATEGORY_ICON: IconName = 'first-aid';

type SheetKey = 'city' | 'radius' | null;
/** null = both kinds, true = prescription-only, false = over-the-counter. */
type RxFilter = boolean | null;

export default function PharmacyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [category, setCategory] = useState<MedicineCategoryValue | null>(null);
  const [rxFilter, setRxFilter] = useState<RxFilter>(null);
  const [city, setCity] = useState<City>(CITIES[0]);
  // 10 km, not 5: measured against the live directory, a 5 km circle on Douala
  // centre reaches very few of the pharmacies that actually report stock.
  const [radiusKm, setRadiusKm] = useState(10);
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [sheet, setSheet] = useState<SheetKey>(null);
  const [reservationsOpen, setReservationsOpen] = useState(false);
  const [showAllPharmacies, setShowAllPharmacies] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedTerm(term.trim()), 300);
    return () => clearTimeout(handle);
  }, [term]);

  const categories = useMedicineCategories();
  const catalog = useMedicineCatalog({
    q: debouncedTerm,
    category,
    prescriptionRequired: rxFilter,
  });

  // Open holds — the reservation list endpoint existed with nothing calling it,
  // so a patient could create a hold and never see it again.
  const reservations = useMedicineReservations('open');
  const cancelReservation = useCancelMedicineReservation();
  const openHolds = useMemo(() => reservations.data ?? [], [reservations.data]);

  // Pharmacy directory for the chosen origin. Deliberately no medicine_id and
  // no only_stocking: MedicineFinderService only loads stock rows when a
  // medicine is supplied, so `only_stocking` on this call would filter every
  // pharmacy out. The per-medicine stock view lives on the detail screen; the
  // "open now" narrowing below is applied to the returned rows instead.
  const pharmacies = useNearbyPharmacies({
    lat: city.lat,
    lng: city.lng,
    radiusKm,
  });

  const results = catalog.data?.items ?? [];
  const total = catalog.data?.total ?? 0;
  const allPharmacyRows = pharmacies.data ?? [];
  const pharmacyRows = openNowOnly
    ? allPharmacyRows.filter((p) => p.is_open !== false)
    : allPharmacyRows;
  const filtersActive = !!debouncedTerm || category !== null || rxFilter !== null;
  const hasMappable = pharmacyRows.some((p) => p.latitude != null && p.longitude != null);

  const openMedicine = (medicineId: string) =>
    router.push({
      pathname: '/pharmacy/[medicineId]',
      params: {
        medicineId,
        lat: String(city.lat),
        lng: String(city.lng),
        radiusKm: String(radiusKm),
      },
    });

  const clearFilters = () => {
    setTerm('');
    setDebouncedTerm('');
    setCategory(null);
    setRxFilter(null);
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        catalog.refetch(),
        pharmacies.refetch(),
        reservations.refetch(),
        categories.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [catalog, pharmacies, reservations, categories]);

  /** Cancelling a hold is destructive and unrecoverable — confirm first. */
  const confirmCancel = (hold: MedicineReservation) =>
    dialog.confirm({
      title: t('pharmacy.reservationCancel'),
      message: [
        hold.medicine?.name,
        hold.pharmacy?.name,
        t('pharmacy.reservationRef', { reference: hold.reference }),
      ]
        .filter(Boolean)
        .join('\n'),
      confirmLabel: t('pharmacy.reservationCancel'),
      destructive: true,
      onConfirm: async () => {
        try {
          await cancelReservation.mutateAsync({ id: hold.id });
        } catch {
          dialog.alert(t('pharmacy.loadFailed'), t('pharmacy.reservationCancelFailed'), 'critical');
        }
      },
    });

  const headerActions =
    openHolds.length > 0
      ? [
          {
            icon: 'receipt' as IconName,
            badge: openHolds.length,
            onPress: () => setReservationsOpen((open) => !open),
            accessibilityLabel: t('pharmacy.reservationsTitle'),
          },
        ]
      : undefined;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={t('pharmacy.title')}
        subtitle={t('pharmacy.subtitle')}
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
        {/* At-a-glance counts */}
        <Card>
          <View style={styles.factRow}>
            <FactCell
              icon="pill"
              label={t('pharmacy.resultsTitle')}
              value={catalog.isPending ? '—' : String(total)}
              valueColor={colors.link}
              align="center"
            />
            <FactCell
              icon="store"
              label={t('pharmacy.nearbyTitle')}
              value={pharmacies.isPending ? '—' : String(pharmacyRows.length)}
              valueColor={colors.link}
              align="center"
              divided
            />
          </View>
        </Card>

        {/* Search */}
        <View style={styles.searchWrap}>
          <PillInput
            icon={<Icon name="search" size={18} color={colors.blue} />}
            value={term}
            onChangeText={setTerm}
            placeholder={t('pharmacy.searchPlaceholder')}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel={t('pharmacy.searchPlaceholder')}
          />
          {term.length > 0 ? (
            <TouchableOpacity
              onPress={() => setTerm('')}
              hitSlop={10}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('pharmacy.close')}
              style={styles.searchClear}
            >
              <Icon name="x-circle" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRail}
          contentContainerStyle={styles.chipRailContent}
        >
          <Chip
            icon="location"
            label={city.name}
            selected={sheet === 'city'}
            onPress={() => setSheet((s) => (s === 'city' ? null : 'city'))}
            accessibilityLabel={t('pharmacy.cityPickerTitle')}
          />
          <Chip
            icon="target"
            label={t('pharmacy.radius', { km: radiusKm })}
            selected={sheet === 'radius'}
            onPress={() => setSheet((s) => (s === 'radius' ? null : 'radius'))}
            accessibilityLabel={t('pharmacy.radiusPickerTitle')}
          />
          <Chip
            icon={openNowOnly ? 'clock' : 'store'}
            label={openNowOnly ? t('pharmacy.openNow') : t('pharmacy.allPharmacies')}
            selected={openNowOnly}
            onPress={() => setOpenNowOnly((only) => !only)}
          />
          <Chip
            icon="document-text"
            label={t('pharmacy.filterRx')}
            selected={rxFilter === true}
            onPress={() => setRxFilter((v) => (v === true ? null : true))}
          />
          <Chip
            icon="check-circle"
            label={t('pharmacy.filterOtc')}
            selected={rxFilter === false}
            onPress={() => setRxFilter((v) => (v === false ? null : false))}
          />
        </ScrollView>

        {sheet === 'city' ? (
          <OptionCard title={t('pharmacy.cityPickerTitle')}>
            {CITIES.map((option, index) => (
              <ListRow
                key={option.key}
                title={option.name}
                trailing={
                  option.key === city.key ? (
                    <Icon name="check" size={18} color={colors.blue} />
                  ) : undefined
                }
                chevron={false}
                divider={index < CITIES.length - 1}
                onPress={() => {
                  setCity(option);
                  setSheet(null);
                }}
              />
            ))}
          </OptionCard>
        ) : null}

        {sheet === 'radius' ? (
          <OptionCard title={t('pharmacy.radiusPickerTitle')}>
            {RADIUS_OPTIONS.map((option, index) => (
              <ListRow
                key={option}
                title={t('pharmacy.radius', { km: option })}
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

        {/* Category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRail}
          contentContainerStyle={styles.chipRailContent}
        >
          <Chip
            icon="grid"
            label={t('pharmacy.categoryAll')}
            selected={category === null}
            onPress={() => setCategory(null)}
          />
          {(categories.data?.categories ?? [])
            .filter((c) => c.medicine_count > 0)
            .map((c) => (
              <Chip
                key={c.value}
                icon={CATEGORY_ICONS[c.icon] ?? FALLBACK_CATEGORY_ICON}
                label={t(`pharmacy.categories.${c.value}`, { defaultValue: c.label })}
                count={c.medicine_count}
                selected={category === c.value}
                onPress={() => setCategory(category === c.value ? null : c.value)}
              />
            ))}
        </ScrollView>

        {/* Open holds */}
        {openHolds.length > 0 ? (
          <View>
            <SectionHeader
              title={t('pharmacy.reservationsSubtitle', { count: openHolds.length })}
              actionLabel={
                reservationsOpen ? t('pharmacy.reservationsHide') : t('pharmacy.reservationsShow')
              }
              actionChevron
              onAction={() => setReservationsOpen((open) => !open)}
            />
            {reservationsOpen ? (
              <View style={styles.stack}>
                {openHolds.map((hold) => (
                  <HoldCard
                    key={hold.id}
                    reservation={hold}
                    cancelling={
                      cancelReservation.isPending && cancelReservation.variables?.id === hold.id
                    }
                    onOpenMedicine={
                      hold.medicine ? () => openMedicine(hold.medicine!.id) : null
                    }
                    onCancel={() => confirmCancel(hold)}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Catalogue results */}
        <View>
          <SectionHeader
            title={
              catalog.isPending
                ? t('pharmacy.resultsTitle')
                : t('pharmacy.resultsCount', { count: total })
            }
            actionLabel={t('pharmacy.clearFilters')}
            onAction={filtersActive ? clearFilters : undefined}
          />

          {catalog.isPending ? (
            <LoadingBlock label={t('pharmacy.searching')} />
          ) : catalog.isError ? (
            <Card variant="flush">
              <EmptyState
                icon="alert-circle"
                tint="red"
                title={t('pharmacy.loadFailed')}
                actionLabel={t('pharmacy.retry')}
                onAction={() => catalog.refetch()}
              />
            </Card>
          ) : results.length === 0 ? (
            <Card variant="flush">
              <EmptyState
                icon="search"
                tint="blue"
                title={t('pharmacy.noMedicines')}
                message={t('pharmacy.noResultsHint')}
                actionLabel={filtersActive ? t('pharmacy.clearFilters') : undefined}
                onAction={filtersActive ? clearFilters : undefined}
              />
            </Card>
          ) : (
            <Card variant="flush">
              {results.map((medicine, index) => (
                <MedicineRow
                  key={medicine.id}
                  medicine={medicine}
                  divider={index < results.length - 1}
                  onPress={() => openMedicine(medicine.id)}
                />
              ))}
            </Card>
          )}
        </View>

        {/* Pharmacies near the chosen origin */}
        <View>
          <SectionHeader
            title={
              pharmacies.isSuccess
                ? t('pharmacy.nearbyPharmacies', { count: pharmacyRows.length })
                : t('pharmacy.nearbyTitle')
            }
            actionLabel={showAllPharmacies ? t('pharmacy.showLess') : t('pharmacy.showAll')}
            actionChevron
            onAction={
              pharmacyRows.length > NEARBY_PREVIEW
                ? () => setShowAllPharmacies((open) => !open)
                : undefined
            }
          />
          <Text style={styles.sectionHint}>
            {t('pharmacy.nearbySubtitle')}
            {'  ·  '}
            {t('pharmacy.sortByDistance')}
          </Text>

          {pharmacies.isPending ? (
            <LoadingBlock label={t('pharmacy.loadingPharmacies')} />
          ) : pharmacies.isError ? (
            <Card variant="flush">
              <EmptyState
                icon="alert-circle"
                tint="red"
                title={t('pharmacy.loadFailed')}
                actionLabel={t('pharmacy.retry')}
                onAction={() => pharmacies.refetch()}
              />
            </Card>
          ) : pharmacyRows.length === 0 ? (
            // Two different empty causes, two different escapes: nothing in the
            // radius at all, or the "open now" narrowing hid everything.
            openNowOnly && allPharmacyRows.length > 0 ? (
              <Card variant="flush">
                <EmptyState
                  icon="clock"
                  tint="amber"
                  title={t('pharmacy.closed')}
                  message={t('pharmacy.nearbySubtitle')}
                  actionLabel={t('pharmacy.allPharmacies')}
                  onAction={() => setOpenNowOnly(false)}
                />
              </Card>
            ) : (
              <Card variant="flush">
                <EmptyState
                  icon="store"
                  tint="blue"
                  title={t('pharmacy.noPharmacies', { km: radiusKm })}
                  message={t('pharmacy.nearbySubtitle')}
                  actionLabel={t('pharmacy.radiusPickerTitle')}
                  onAction={() => setSheet('radius')}
                />
              </Card>
            )
          ) : (
            <View style={styles.stack}>
              {/* Real embedded OpenStreetMap of the nearby pharmacies — the in-app
                  answer to "where are these". FacilityMap skips coordinate-less
                  rows, so only render it when at least one row has coordinates. */}
              {hasMappable ? (
                <Card variant="flush">
                  <FacilityMap facilities={pharmacyRows} height={240} />
                </Card>
              ) : null}

              <Card variant="flush">
                {(showAllPharmacies ? pharmacyRows : pharmacyRows.slice(0, NEARBY_PREVIEW)).map(
                  (pharmacy, index, shown) => (
                    <PharmacyRow
                      key={pharmacy.id}
                      pharmacy={pharmacy}
                      divider={index < shown.length - 1}
                      onPress={() =>
                        router.push({ pathname: '/facility/[id]', params: { id: pharmacy.id } })
                      }
                    />
                  ),
                )}
              </Card>

              {pharmacyRows.length > NEARBY_PREVIEW ? (
                <MedButton
                  label={showAllPharmacies ? t('pharmacy.showLess') : t('pharmacy.showAll')}
                  iconRight={showAllPharmacies ? 'chevron-up' : 'chevron-down'}
                  variant="secondary"
                  size="sm"
                  onPress={() => setShowAllPharmacies((open) => !open)}
                />
              ) : null}
            </View>
          )}
        </View>

        {/* Safety notice */}
        <View style={styles.notice} accessibilityRole="summary">
          <Icon name="shield-check" size={20} color={colors.blue} />
          <View style={styles.noticeBody}>
            <Text style={styles.noticeTitle}>{t('pharmacy.safetyTitle')}</Text>
            <Text style={styles.noticeText}>{t('pharmacy.safetyBody')}</Text>
          </View>
        </View>
      </ScrollView>

      {dialog.element}
    </SafeAreaView>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

/** Bordered picker used by the city / radius sheets. */
function OptionCard({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Card variant="flush">
      <Text style={styles.optionTitle}>{title}</Text>
      {children}
    </Card>
  );
}

function LoadingBlock({ label }: { label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.loading} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.blue} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

function MedicineRow({
  medicine,
  divider,
  onPress,
}: {
  medicine: Medicine;
  divider: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { price_min: min, price_max: max, pharmacy_count: count, is_available } =
    medicine.availability;

  const priceLabel =
    min !== null && max !== null && min !== max
      ? t('pharmacy.priceRangeValue', { min: formatXafBare(min), max: formatXaf(max) })
      : (formatXaf(min ?? max) ?? t('pharmacy.priceUnavailable'));

  const strengthForm =
    medicine.strength && medicine.form
      ? t('pharmacy.strengthForm', { strength: medicine.strength, form: medicine.form })
      : (medicine.strength ?? medicine.form ?? null);

  return (
    <ListRow
      icon={CATEGORY_ICONS[medicine.category_icon] ?? 'pill'}
      tint={is_available ? 'green' : 'blue'}
      title={medicine.name}
      meta={[
        t('pharmacy.generic', { name: medicine.generic_name }),
        strengthForm,
        medicine.prescription_required ? t('pharmacy.rxBadge') : null,
        is_available ? t('pharmacy.pharmacyCount', { count }) : null,
      ]}
      trailing={
        <View style={styles.rowAside}>
          <Text style={styles.rowPrice} numberOfLines={1}>
            {priceLabel}
          </Text>
          <StatusBadge
            status={is_available ? 'available' : 'unavailable'}
            tone={is_available ? 'normal' : 'neutral'}
            label={is_available ? t('pharmacy.available') : t('pharmacy.availabilityNone')}
            size="sm"
          />
        </View>
      }
      divider={divider}
      onPress={onPress}
      accessibilityLabel={[medicine.name, strengthForm, priceLabel].filter(Boolean).join(', ')}
      accessibilityHint={t('pharmacy.viewDetails')}
    />
  );
}

/**
 * Directory row. This list is fetched without a `medicine_id`, and
 * MedicineFinderService only loads stock rows when a medicine is supplied, so
 * `stock` is always null here by construction — per-medicine stock, price and
 * the reserve action all live on the detail screen instead.
 */
function PharmacyRow({
  pharmacy,
  divider,
  onPress,
}: {
  pharmacy: NearbyPharmacy;
  divider: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const openLabel = pharmacy.is_24_hours
    ? t('pharmacy.open24')
    : pharmacy.is_open === null
      ? t('pharmacy.hoursUnknown')
      : pharmacy.is_open
        ? t('pharmacy.open')
        : t('pharmacy.closed');

  const openTone: StatusTone = pharmacy.is_24_hours
    ? 'normal'
    : pharmacy.is_open === null
      ? 'neutral'
      : pharmacy.is_open
        ? 'normal'
        : 'critical';

  const hoursLine = pharmacy.is_24_hours
    ? null
    : pharmacy.is_open && pharmacy.closes_at
      ? t('pharmacy.closesAt', { time: pharmacy.closes_at })
      : !pharmacy.is_open && pharmacy.opens_at
        ? t('pharmacy.opensAt', { time: pharmacy.opens_at })
        : null;

  return (
    <ListRow
      icon="store"
      tint="blue"
      title={pharmacy.name}
      meta={[hoursLine, pharmacy.city, pharmacy.address]}
      trailing={
        <View style={styles.rowAside}>
          <Text style={styles.rowValue} numberOfLines={1}>
            {t('pharmacy.distanceKm', { km: pharmacy.distance_km })}
          </Text>
          <StatusBadge status={openLabel} tone={openTone} label={openLabel} size="sm" />
        </View>
      }
      divider={divider}
      onPress={onPress}
      accessibilityHint={t('pharmacy.viewPharmacy')}
    />
  );
}

function HoldCard({
  reservation,
  cancelling,
  onCancel,
  onOpenMedicine,
}: {
  reservation: MedicineReservation;
  cancelling: boolean;
  onCancel: () => void;
  onOpenMedicine: (() => void) | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const expiry = formatDateTime(reservation.expires_at);

  return (
    <Card>
      <View style={styles.holdHead}>
        <TintCircle icon="receipt" tint="amber" />
        <View style={styles.holdBody}>
          <Text style={styles.holdTitle} numberOfLines={1}>
            {reservation.medicine?.name ?? t('pharmacy.selectedMedicine')}
          </Text>
          <Text style={styles.holdMeta} numberOfLines={1}>
            {[
              reservation.pharmacy?.name,
              t('pharmacy.reservationQuantity', { count: reservation.quantity }),
              reservation.total_price !== null ? formatXaf(reservation.total_price) : null,
            ]
              .filter(Boolean)
              .join('  •  ')}
          </Text>
          <Text style={styles.holdMeta} numberOfLines={1}>
            {expiry ? t('pharmacy.reservationExpires', { when: expiry }) : reservation.status_label}
          </Text>
        </View>
        <StatusBadge
          status={reservation.status}
          tone="pending"
          label={t('pharmacy.reservationRef', { reference: reservation.reference })}
          size="sm"
        />
      </View>

      <View style={styles.holdActions}>
        {onOpenMedicine ? (
          <MedButton
            label={t('pharmacy.viewDetails')}
            icon="pill"
            variant="secondary"
            size="sm"
            onPress={onOpenMedicine}
            style={styles.holdAction}
          />
        ) : null}
        {reservation.is_cancellable ? (
          <MedButton
            label={t('pharmacy.reservationCancel')}
            icon="close"
            variant="ghost"
            size="sm"
            disabled={cancelling}
            onPress={onCancel}
            style={styles.holdAction}
          />
        ) : null}
      </View>
    </Card>
  );
}

/* ── Styles ───────────────────────────────────────────────────────────────── */

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.page },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    stack: { gap: spacing.md },

    factRow: { flexDirection: 'row', alignItems: 'flex-start' },

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

    chipRail: { marginHorizontal: -spacing.md },
    chipRailContent: {
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
      alignItems: 'center',
    },

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
      marginBottom: spacing.sm + 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    loading: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
    loadingText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    rowAside: { alignItems: 'flex-end', gap: 4 },
    rowPrice: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.link,
    },
    rowValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },

    holdHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 4 },
    holdBody: { flex: 1, minWidth: 0, gap: 2 },
    holdTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    holdMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    holdActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    holdAction: { flexGrow: 1 },

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
