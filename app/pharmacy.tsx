import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
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
  LastUpdatedLine,
  ListRow,
  PillInput,
  ScreenHeader,
  SectionHeader,
  StaleNotice,
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
 * ── What the numbers on this screen actually mean ─────────────────────────
 * Two different scopes share one screen, and conflating them would be a lie:
 *
 *   • `medicine.availability` is NATIONAL. The catalogue endpoint takes no
 *     coordinates at all; `MedicineFinderService::availabilitySummary()` counts
 *     every active pharmacy listing in the country whose stock row passes the
 *     `reportedByRealSource()` provenance allow-list. So "available in 4
 *     pharmacies" never means "4 near you", and the copy here never says so.
 *   • the pharmacy list is LOCAL — every active pharmacy listing inside the
 *     chosen radius, whether or not it stocks anything you searched for.
 *
 * The catalogue call carries no `medicine_id`, and `MedicineFinderService`
 * only loads stock rows when a medicine is supplied, so the pharmacy rows here
 * carry `stock: null` by construction. This screen therefore makes no stock
 * claim about any pharmacy at all — that is the medicine detail screen's job.
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
 * MobilePharmacyController::nearbyPharmacies defaults `limit` to 25 and the
 * hook sends none, so a full page is a TRUNCATED page, not "all of them".
 */
const NEARBY_API_LIMIT = 25;

/** `useMedicineCatalog` asks for 25 rows; the total it reports can exceed that. */
const CATALOG_PAGE_SIZE = 25;

/** MedicineReservationService::MAX_OPEN_RESERVATIONS — the server enforces it too. */
const MAX_OPEN_HOLDS = 10;

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

/**
 * `care_facilities.verification_status` is a free-form column, so only values
 * this app actually understands are rendered. Anything else — including null —
 * shows no verification line at all: silence is honest, a guess is not.
 */
const VERIFIED_STATUSES = new Set(['verified', 'verified_by_facility', 'facility_verified', 'approved']);
const UNVERIFIED_STATUSES = new Set(['unverified', 'pending', 'provisional', 'rejected', 'suspended']);

/** Reservation status → badge tone. Enum: App\Enums\MedicineReservationStatus. */
const RESERVATION_TONES: Record<string, StatusTone> = {
  pending: 'pending',
  confirmed: 'normal',
  ready_for_pickup: 'normal',
  collected: 'normal',
  rejected: 'critical',
  cancelled: 'neutral',
  expired: 'critical',
};

type SheetKey = 'city' | 'radius' | null;
/** null = both kinds, true = prescription-only, false = over-the-counter. */
type RxFilter = boolean | null;

/**
 * XAF quoted the way the counter says it, and never relabelled.
 *
 * `formatXaf` hard-codes the FCFA label, which is right for the only currency
 * this deployment carries. Every price in these payloads travels with its own
 * `currency` field, though, so a row that is not XAF is printed with its own
 * ISO code rather than silently renamed to francs.
 */
function money(value: number | null | undefined, currency?: string | null): string | null {
  const code = (currency ?? 'XAF').toUpperCase();
  if (code === 'XAF' || code === 'FCFA' || code === '') return formatXaf(value);
  const bare = formatXafBare(value);
  return bare === null ? null : `${bare} ${code}`;
}

/** Bare left half of a "200 – 500 FCFA" range (the right half carries the unit). */
function moneyBare(value: number | null | undefined): string | null {
  return formatXafBare(value);
}

/**
 * What the price figures on a catalogue row actually are.
 *
 * `medicinePayload()` builds `availability.price_min` as
 * `$availability['price_min'] ?? $medicine->price_min` — so when no pharmacy
 * has reported a priced stock row, the "range" is the catalogue's own
 * reference price, not something anybody is charging. `pharmacy_count === 0`
 * is the case we can prove, and it is labelled as indicative rather than
 * presented as a real quote.
 */
function priceQuote(
  medicine: Medicine,
  t: (key: string, params?: Record<string, unknown>) => string,
): { label: string; reported: boolean } | null {
  const { price_min: min, price_max: max, currency, pharmacy_count: count } = medicine.availability;
  if (min === null && max === null) return null;

  const label =
    min !== null && max !== null && min !== max
      ? t('pharmacy.priceRangeValue', { min: moneyBare(min), max: money(max, currency) })
      : (money(min ?? max, currency) ?? '');

  return label ? { label, reported: count > 0 } : null;
}

/** "500mg · Tablet", or whichever half exists. */
function strengthForm(
  medicine: Pick<Medicine, 'strength' | 'form'>,
  t: (key: string, params?: Record<string, unknown>) => string,
): string | null {
  if (medicine.strength && medicine.form) {
    return t('pharmacy.strengthForm', { strength: medicine.strength, form: medicine.form });
  }
  return medicine.strength ?? medicine.form ?? null;
}

/**
 * The care_facilities directory stores a placeholder where a pharmacy has no
 * published number — the live rows literally hold the string "N/A", which
 * would otherwise become a `tel:N/A` link that does nothing but look broken.
 * Anything without at least four digits is treated as absent.
 */
function callablePhone(phone: string | null | undefined): string | null {
  const raw = phone?.trim();
  if (!raw) return null;
  return raw.replace(/\D/g, '').length >= 4 ? raw : null;
}

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
  const [reportedOnly, setReportedOnly] = useState(false);
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
  // "Reported" is a national claim, not a local one — see the header comment.
  const shownResults = reportedOnly ? results.filter((m) => m.availability.is_available) : results;
  // The endpoint pages at 25; `total` can be larger, and printing the total
  // above 25 rows without saying so reads as a miscount.
  const resultsTruncated = !reportedOnly && total > results.length && results.length >= CATALOG_PAGE_SIZE;

  const allPharmacyRows = pharmacies.data ?? [];
  // "Open now" must not quietly include pharmacies whose hours nobody has
  // published: `is_open === null` means unknown, and unknown is not open.
  const pharmacyRows = openNowOnly
    ? allPharmacyRows.filter((p) => p.is_24_hours || p.is_open === true)
    : allPharmacyRows;
  const pharmaciesTruncated = allPharmacyRows.length >= NEARBY_API_LIMIT;

  const filtersActive = !!debouncedTerm || category !== null || rxFilter !== null || reportedOnly;
  const hasMappable = pharmacyRows.some((p) => p.latitude != null && p.longitude != null);
  const atHoldCap = openHolds.length >= MAX_OPEN_HOLDS;

  const loadedAt = Math.max(catalog.dataUpdatedAt ?? 0, pharmacies.dataUpdatedAt ?? 0);

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
    setReportedOnly(false);
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
        [t('pharmacy.reservationQuantity', { count: hold.quantity }), hold.pack_size]
          .filter(Boolean)
          .join(' · '),
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

  const callPharmacy = (name: string | undefined, phone: string) =>
    Linking.openURL(`tel:${phone.replace(/\s/g, '')}`).catch(() =>
      dialog.alert(
        t('opesMeds.pharmacy.callFailTitle'),
        t('opesMeds.pharmacy.callFailBody', { pharmacy: name ?? '', phone }),
        'warning',
      ),
    );

  const headerActions = [
    {
      icon: 'receipt' as IconName,
      badge: openHolds.length > 0 ? openHolds.length : undefined,
      onPress: () => setReservationsOpen((open) => !open),
      accessibilityLabel: t('pharmacy.reservationsTitle'),
    },
  ];

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
              value={catalog.isPending ? '—' : String(reportedOnly ? shownResults.length : total)}
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
            <FactCell
              icon="receipt"
              label={t('pharmacy.reservationsTitle')}
              value={reservations.isPending ? '—' : String(openHolds.length)}
              valueColor={openHolds.length > 0 ? colors.statusWarning : colors.link}
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
              accessibilityLabel={t('pharmacy.clearSearch', { defaultValue: 'Clear search' })}
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
            icon="check-double"
            label={t('pharmacy.stockingOnly')}
            selected={reportedOnly}
            onPress={() => setReportedOnly((only) => !only)}
            accessibilityHint={t('pharmacy.catalogueScopeHint', {
              defaultValue:
                'Availability counts every pharmacy in the national directory that reports stock — not only those near you.',
            })}
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
                  setShowAllPharmacies(false);
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
                  setShowAllPharmacies(false);
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

        {/* Your holds — always present, so "you have none" is a state the
            patient can see rather than a section that silently disappears. */}
        <View>
          <SectionHeader
            title={
              openHolds.length > 0
                ? t('pharmacy.reservationsSubtitle', { count: openHolds.length })
                : t('pharmacy.reservationsTitle')
            }
            actionLabel={
              reservationsOpen ? t('pharmacy.reservationsHide') : t('pharmacy.reservationsShow')
            }
            actionChevron
            onAction={() => setReservationsOpen((open) => !open)}
          />

          {reservationsOpen ? (
            reservations.isPending ? (
              <LoadingBlock
                label={t('pharmacy.reservationsLoading', { defaultValue: 'Loading your holds…' })}
              />
            ) : reservations.isError && openHolds.length === 0 ? (
              <Card variant="flush">
                <EmptyState
                  icon="alert-circle"
                  tint="red"
                  title={t('pharmacy.reservationsLoadFailed', {
                    defaultValue: 'Your holds could not be loaded.',
                  })}
                  actionLabel={t('pharmacy.retry')}
                  onAction={() => reservations.refetch()}
                />
              </Card>
            ) : openHolds.length === 0 ? (
              <Card variant="flush">
                <EmptyState
                  icon="receipt"
                  tint="blue"
                  title={t('pharmacy.reservationsNone', {
                    defaultValue: 'You have nothing on hold right now.',
                  })}
                  message={t('pharmacy.reservationsNoneHint', {
                    defaultValue:
                      'Reserve a medicine and the pharmacy holds it for you for 24 hours. You pay at the counter.',
                  })}
                />
              </Card>
            ) : (
              <View style={styles.stack}>
                {reservations.isError ? (
                  <StaleNotice
                    message={t('pharmacy.reservationsLoadFailed', {
                      defaultValue: 'Your holds could not be loaded.',
                    })}
                    loadedAt={reservations.dataUpdatedAt ? new Date(reservations.dataUpdatedAt) : null}
                    onRetry={() => reservations.refetch()}
                    retrying={reservations.isFetching}
                  />
                ) : null}

                {atHoldCap ? (
                  <NoticeStrip
                    icon="alert-triangle"
                    tone="warning"
                    text={t('pharmacy.reservationsAtCap', {
                      max: MAX_OPEN_HOLDS,
                      defaultValue:
                        'You have the maximum of {{max}} holds open. Cancel one before reserving another.',
                    })}
                  />
                ) : null}

                {openHolds.map((hold) => (
                  <HoldCard
                    key={hold.id}
                    reservation={hold}
                    cancelling={
                      cancelReservation.isPending && cancelReservation.variables?.id === hold.id
                    }
                    onOpenMedicine={hold.medicine ? () => openMedicine(hold.medicine!.id) : null}
                    onCall={(phone) => callPharmacy(hold.pharmacy?.name, phone)}
                    onCancel={() => confirmCancel(hold)}
                  />
                ))}
              </View>
            )
          ) : null}
        </View>

        {/* Catalogue results */}
        <View>
          <SectionHeader
            title={
              catalog.isPending
                ? t('pharmacy.resultsTitle')
                : t('pharmacy.resultsCount', { count: reportedOnly ? shownResults.length : total })
            }
            actionLabel={t('pharmacy.clearFilters')}
            onAction={filtersActive ? clearFilters : undefined}
          />
          <Text style={styles.sectionHint}>
            {t('pharmacy.catalogueScopeHint', {
              defaultValue:
                'Availability counts every pharmacy in the national directory that reports stock — not only those near you.',
            })}
          </Text>

          {/* A failed refresh over data already on screen is not an empty
              screen — say the figures are old rather than showing them as new. */}
          {catalog.isError && results.length > 0 ? (
            <View style={styles.staleWrap}>
              <StaleNotice
                message={t('pharmacy.loadFailed')}
                loadedAt={catalog.dataUpdatedAt ? new Date(catalog.dataUpdatedAt) : null}
                onRetry={() => catalog.refetch()}
                retrying={catalog.isFetching}
              />
            </View>
          ) : null}

          {catalog.isPending ? (
            <LoadingBlock label={t('pharmacy.searching')} />
          ) : catalog.isError && results.length === 0 ? (
            <Card variant="flush">
              <EmptyState
                icon="alert-circle"
                tint="red"
                title={t('pharmacy.loadFailed')}
                actionLabel={t('pharmacy.retry')}
                onAction={() => catalog.refetch()}
              />
            </Card>
          ) : shownResults.length === 0 ? (
            // Three different reasons for an empty list, three different escapes.
            <Card variant="flush">
              <EmptyState
                icon={reportedOnly && results.length > 0 ? 'check-double' : 'search'}
                tint="blue"
                title={
                  reportedOnly && results.length > 0
                    ? t('pharmacy.noneReportedAnywhere', {
                        defaultValue: 'No pharmacy has reported stock for these medicines.',
                      })
                    : t('pharmacy.noMedicines')
                }
                message={
                  reportedOnly && results.length > 0
                    ? t('pharmacy.catalogueScopeHint', {
                        defaultValue:
                          'Availability counts every pharmacy in the national directory that reports stock — not only those near you.',
                      })
                    : t('pharmacy.noResultsHint')
                }
                actionLabel={
                  reportedOnly && results.length > 0
                    ? t('pharmacy.allPharmacies')
                    : filtersActive
                      ? t('pharmacy.clearFilters')
                      : undefined
                }
                onAction={
                  reportedOnly && results.length > 0
                    ? () => setReportedOnly(false)
                    : filtersActive
                      ? clearFilters
                      : undefined
                }
              />
            </Card>
          ) : (
            <View style={styles.stack}>
              <Card variant="flush">
                {shownResults.map((medicine, index) => (
                  <MedicineRow
                    key={medicine.id}
                    medicine={medicine}
                    divider={index < shownResults.length - 1}
                    onPress={() => openMedicine(medicine.id)}
                  />
                ))}
              </Card>

              {resultsTruncated ? (
                <Text style={styles.footNote}>
                  {t('pharmacy.resultsCapped', {
                    shown: results.length,
                    total,
                    defaultValue:
                      'Showing the first {{shown}} of {{total}} matches. Narrow your search to see the rest.',
                  })}
                </Text>
              ) : null}
            </View>
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
            {t('pharmacy.radiusSearched', {
              km: radiusKm,
              defaultValue: 'Searched within {{km}} km',
            })}
            {'  ·  '}
            {t('pharmacy.sortByDistance')}
            {'\n'}
            {/* This list carries no stock rows at all (no medicine_id was sent),
                so it must not be read as "these pharmacies have your medicine". */}
            {t('pharmacy.nearbyStockNote', {
              defaultValue:
                'Stock is not checked here. Open a medicine to see which of these pharmacies reports having it.',
            })}
          </Text>

          {pharmacies.isError && allPharmacyRows.length > 0 ? (
            <View style={styles.staleWrap}>
              <StaleNotice
                message={t('pharmacy.loadFailed')}
                loadedAt={pharmacies.dataUpdatedAt ? new Date(pharmacies.dataUpdatedAt) : null}
                onRetry={() => pharmacies.refetch()}
                retrying={pharmacies.isFetching}
              />
            </View>
          ) : null}

          {pharmacies.isPending ? (
            <LoadingBlock label={t('pharmacy.loadingPharmacies')} />
          ) : pharmacies.isError && allPharmacyRows.length === 0 ? (
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
                  message={t('pharmacy.hoursUnknown')}
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
                  actionLabel={
                    radiusKm < RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1]
                      ? t('pharmacy.radiusPickerTitle')
                      : undefined
                  }
                  onAction={
                    radiusKm < RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1]
                      ? () => setSheet('radius')
                      : undefined
                  }
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

              {/* The endpoint caps at 25 rows, so a full page is a truncated one. */}
              {pharmaciesTruncated ? (
                <Text style={styles.footNote}>
                  {t('pharmacy.nearbyCapped', {
                    max: NEARBY_API_LIMIT,
                    defaultValue:
                      'Only the {{max}} nearest pharmacies are listed. Narrow the radius to see the closest ones.',
                  })}
                </Text>
              ) : null}
            </View>
          )}
        </View>

        {/* When the figures on this screen were actually loaded. */}
        {loadedAt > 0 ? <LastUpdatedLine loadedAt={new Date(loadedAt)} /> : null}

        {/* Safety notice */}
        <View style={styles.notice} accessibilityRole="summary">
          <Icon name="shield-check" size={20} color={colors.blue} />
          <View style={styles.noticeBody}>
            <Text style={styles.noticeTitle}>{t('pharmacy.safetyTitle')}</Text>
            <Text style={styles.noticeText}>{t('pharmacy.safetyBody')}</Text>
            <Text style={styles.noticeText}>
              {t('pharmacy.stockProvenance', {
                defaultValue:
                  'Stock levels and prices are reported by each pharmacy, not measured by OpesCare.',
              })}
            </Text>
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

/** Tinted one-liner used for cautions that are not errors. */
function NoticeStrip({
  icon,
  tone,
  text,
}: {
  icon: IconName;
  tone: 'warning' | 'info';
  text: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const bg = tone === 'warning' ? colors.statusWarningBg : colors.primarySoft;
  const fg = tone === 'warning' ? colors.statusWarning : colors.blue;
  return (
    <View style={[styles.strip, { backgroundColor: bg }]} accessibilityRole="summary">
      <Icon name={icon} size={18} color={fg} />
      <Text style={styles.stripText}>{text}</Text>
    </View>
  );
}

/**
 * One catalogue row. Everything the medicines payload actually carries is on
 * it — brand, generic, strength/form, category, prescription and controlled
 * status, default pack — with the national availability figure underneath.
 *
 * ── Why this is not a `ListRow` ───────────────────────────────────────────
 * `ListRow` is a three-column layout — tint circle, flexible centre, trailing
 * block allowed up to 45 % of the row — and it clamps its title to one line.
 * This row's trailing block carried a price range, a "catalogue price" caption
 * and an availability badge, which at 375 px left the name about 90 px: nine
 * characters. `Acetazolamide 250mg Tablet` rendered as "Acetazola…".
 *
 * For a medicine that is not cosmetic. Across the live catalogue (419 rows,
 * `GET /mobile/pharmacy/medicines`) many names share their opening characters:
 * `Coagulation Factor IX 500 IU Powder for Injection` and `Coagulation Factor
 * VIII 250 IU Powder for Injection` clip to the *same* string, as do the three
 * `Ciprofloxacin` entries — 0.3 % ear drops, 0.3 % eye drops and the 500 mg
 * tablet. A clipped drug name is an ambiguous drug name.
 *
 * So the name takes the full width of the row and wraps, and everything that
 * was bidding against it — price, caption, availability badge — moves to a
 * second tier underneath where it has the whole row to spread across. Three
 * lines is the clamp: the longest name in the catalogue (`Rifampicin +
 * Isoniazid + Pyrazinamide + Ethambutol 150/75/400/275mg Tablet`, 74
 * characters) needs three at 375 px, so nothing in the live catalogue
 * truncates, while a hypothetical longer one still cannot run the row off the
 * screen.
 */
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

  const { pharmacy_count: count, is_available: available } = medicine.availability;
  const quote = priceQuote(medicine, t);
  const dose = strengthForm(medicine, t);

  // The row carries the facts that decide whether to open it — identity, dose,
  // whether it needs a prescription, and how widely it is reported. Brand,
  // category and pack size are on the detail screen.
  //
  // The catalogue frequently repeats the generic as the display name; printing
  // "Generic: Paracetamol" under "Paracetamol" is noise, so it is dropped and
  // the brand takes the slot when there is one to show.
  const sameAsName = (value: string | null) =>
    !!value && value.trim().toLowerCase() === medicine.name.trim().toLowerCase();

  const identity =
    medicine.generic_name && !sameAsName(medicine.generic_name)
      ? t('pharmacy.generic', { name: medicine.generic_name })
      : medicine.brand_name && !sameAsName(medicine.brand_name)
        ? t('pharmacy.brand', { name: medicine.brand_name, defaultValue: 'Brand: {{name}}' })
        : null;

  const meta = [
    identity,
    dose,
    medicine.prescription_required ? t('pharmacy.filterRx') : null,
    medicine.is_controlled ? t('pharmacy.controlled') : null,
    available ? t('pharmacy.pharmacyCount', { count }) : null,
  ]
    .filter(Boolean)
    .join('  •  ');

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={[
        medicine.name,
        dose,
        medicine.prescription_required ? t('pharmacy.prescriptionRequired') : null,
        quote?.label,
        available
          ? t('pharmacy.pharmacyCount', { count })
          : t('pharmacy.notReportedAnywhere', {
              defaultValue: 'No pharmacy has reported stock for this medicine.',
            }),
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={t('pharmacy.viewDetails')}
      style={[styles.medRow, divider && styles.medRowDivider]}
    >
      <View style={styles.medHead}>
        <TintCircle
          icon={CATEGORY_ICONS[medicine.category_icon] ?? 'pill'}
          tint={medicine.is_controlled ? 'amber' : available ? 'green' : 'blue'}
        />
        <View style={styles.medBody}>
          <Text style={styles.medName} numberOfLines={3}>
            {medicine.name}
          </Text>
          {meta ? (
            <Text style={styles.medMeta} numberOfLines={2}>
              {meta}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      </View>

      {/* Second tier: what used to squeeze the name. It wraps, so a long price
          range and a long badge label stack instead of clipping each other. */}
      <View style={styles.medFoot}>
        <StatusBadge
          status={available ? 'available' : 'unknown'}
          tone={available ? 'normal' : 'neutral'}
          label={
            available
              ? t('pharmacy.available')
              : t('pharmacy.notReported', { defaultValue: 'Not reported' })
          }
          size="sm"
        />
        {quote ? (
          <View style={styles.medPrice}>
            <Text style={styles.rowPrice}>{quote.label}</Text>
            {/* A figure nobody is charging must not look like a quote. */}
            {!quote.reported ? (
              <Text style={styles.rowCaption}>
                {t('pharmacy.priceIndicative', { defaultValue: 'Catalogue price' })}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

/**
 * Directory row. This list is fetched without a `medicine_id`, and
 * MedicineFinderService only loads stock rows when a medicine is supplied, so
 * `stock` is always null here by construction — per-medicine stock, price and
 * the reserve action all live on the detail screen instead. Nothing on this
 * row therefore claims anything about what the pharmacy has on the shelf.
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

  const verification = verificationLine(pharmacy.verification_status, t);
  // The street address already names the town on most rows; city/region is the
  // fallback for a listing that carries only an area. Two lines of metadata is
  // the room `ListRow` gives, so only one place line goes in.
  const place = pharmacy.address ?? ([pharmacy.city, pharmacy.region].filter(Boolean).join(', ') || null);

  return (
    <ListRow
      icon="store"
      tint="blue"
      title={pharmacy.name}
      meta={[verification, hoursLine, place]}
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

/**
 * "Verified pharmacy" / "Not verified", or nothing at all.
 *
 * The safety strip on this screen tells patients to buy from verified
 * pharmacies, so the directory has to say which ones are — and must not imply
 * an answer for a status value it does not recognise.
 */
function verificationLine(
  status: string | null | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
): string | null {
  const value = (status ?? '').trim().toLowerCase();
  if (VERIFIED_STATUSES.has(value)) {
    return t('pharmacy.verified', { defaultValue: 'Verified pharmacy' });
  }
  if (UNVERIFIED_STATUSES.has(value)) {
    return t('pharmacy.notVerified', { defaultValue: 'Not verified' });
  }
  return null;
}

/**
 * One open hold, in full: what is being held, where, for how much, until when,
 * whether a prescription is attached, and anything the pharmacy wrote back.
 */
function HoldCard({
  reservation,
  cancelling,
  onCancel,
  onCall,
  onOpenMedicine,
}: {
  reservation: MedicineReservation;
  cancelling: boolean;
  onCancel: () => void;
  onCall: (phone: string) => void;
  onOpenMedicine: (() => void) | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const expiresAt = reservation.expires_at ? new Date(reservation.expires_at) : null;
  const expired =
    reservation.status === 'expired' ||
    (!!expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now());

  const statusLabel = t(`pharmacy.reservationStatus.${reservation.status}`, {
    // The API's own label is the fallback, so an enum case this app has not
    // translated yet still reads as words rather than a database token.
    defaultValue: reservation.status_label,
  });
  const tone: StatusTone = expired ? 'critical' : (RESERVATION_TONES[reservation.status] ?? 'pending');

  const unit = money(reservation.unit_price, reservation.currency);
  const totalLabel = money(reservation.total_price, reservation.currency);
  const phone = callablePhone(reservation.pharmacy?.phone);

  return (
    <Card>
      <View style={styles.holdHead}>
        <TintCircle icon="receipt" tint={expired ? 'red' : 'amber'} />
        <View style={styles.holdBody}>
          <Text style={styles.holdTitle} numberOfLines={2}>
            {reservation.medicine?.name ?? t('pharmacy.selectedMedicine')}
          </Text>
          {reservation.medicine?.generic_name &&
          reservation.medicine.generic_name.toLowerCase() !==
            (reservation.medicine.name ?? '').toLowerCase() ? (
            <Text style={styles.holdMeta} numberOfLines={1}>
              {t('pharmacy.generic', { name: reservation.medicine.generic_name })}
            </Text>
          ) : null}
          <Text style={styles.holdMeta} numberOfLines={2}>
            {[
              reservation.pharmacy?.name,
              reservation.pharmacy?.city,
              t('pharmacy.reservationQuantity', { count: reservation.quantity }),
              reservation.pack_size,
            ]
              .filter(Boolean)
              .join('  •  ')}
          </Text>
        </View>
        <StatusBadge status={reservation.status} tone={tone} label={statusLabel} size="sm" />
      </View>

      <View style={styles.holdFacts}>
        <HoldFact label={t('pharmacy.reservationRef', { reference: reservation.reference })} strong />
        {unit ? <HoldFact label={`${t('pharmacy.unitPrice')}: ${unit}`} /> : null}
        {totalLabel ? <HoldFact label={`${t('pharmacy.totalPrice')}: ${totalLabel}`} strong /> : null}
        {reservation.created_at ? (
          <HoldFact
            label={t('pharmacy.reservationPlaced', {
              when: formatDateTime(reservation.created_at),
              defaultValue: 'Placed {{when}}',
            })}
          />
        ) : null}
        <HoldFact
          label={
            expired
              ? t('pharmacy.reservationExpired')
              : expiresAt
                ? t('pharmacy.reservationExpires', { when: formatDateTime(expiresAt) })
                : statusLabel
          }
          tone={expired ? 'critical' : undefined}
        />
        {reservation.prescription_id ? (
          <HoldFact
            label={t('pharmacy.reservationPrescriptionAttached', {
              defaultValue: 'Prescription attached',
            })}
          />
        ) : null}
      </View>

      {/* Anything written on the hold belongs to the patient — never hidden. */}
      {reservation.pharmacy_note ? (
        <NoticeStrip
          icon="chat"
          tone="info"
          text={`${t('pharmacy.reservationPharmacyNote', { defaultValue: 'Note from the pharmacy' })}: ${reservation.pharmacy_note}`}
        />
      ) : null}
      {reservation.patient_note ? (
        <Text style={styles.holdNote}>
          {t('pharmacy.reservationYourNote', { defaultValue: 'Your note' })}:{' '}
          {reservation.patient_note}
        </Text>
      ) : null}

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
        {phone ? (
          <MedButton
            label={t('pharmacy.callPharmacy')}
            icon="phone"
            variant="secondary"
            size="sm"
            onPress={() => onCall(phone)}
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

function HoldFact({
  label,
  strong,
  tone,
}: {
  label: string;
  strong?: boolean;
  tone?: 'critical';
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Text
      style={[
        styles.holdFact,
        strong && styles.holdFactStrong,
        tone === 'critical' && { color: colors.statusCritical },
      ]}
      numberOfLines={2}
    >
      {label}
    </Text>
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
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
    },
    footNote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
      textAlign: 'center',
    },
    staleWrap: { marginBottom: spacing.sm + 2 },

    loading: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
    loadingText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    strip: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginTop: spacing.sm + 2,
      padding: spacing.sm + 2,
      borderRadius: radii.sm,
    },
    stripText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },

    /* Catalogue row — the name owns the full width and wraps; price and
       availability sit on their own tier underneath. `medBody` needs
       `minWidth: 0` or the flex child refuses to shrink and the text overflows
       the row instead of wrapping inside it. */
    medRow: { paddingVertical: 14, paddingHorizontal: spacing.md, gap: spacing.sm },
    medRowDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
    medHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    medBody: { flex: 1, minWidth: 0, gap: 2 },
    medName: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: c.textPrimary,
    },
    medMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textSecondary,
    },
    medFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingLeft: 52,
    },
    medPrice: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 },

    rowAside: { alignItems: 'flex-end', gap: 4, maxWidth: 132 },
    rowPrice: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.link,
    },
    rowCaption: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
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
    holdFacts: {
      gap: 2,
      marginTop: spacing.sm + 2,
      paddingTop: spacing.sm + 2,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    holdFact: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
    holdFactStrong: {
      fontFamily: typography.fontFamily.semiBold,
      color: c.textPrimary,
    },
    holdNote: {
      marginTop: spacing.sm,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
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
    noticeBody: { flex: 1, minWidth: 0, gap: 4 },
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
