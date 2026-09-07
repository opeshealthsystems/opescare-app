import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  Icon,
  LastUpdatedLine,
  ListRow,
  ResultList,
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
import { MedButton, TintCircle } from '@/components/meds/shared';
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
 * Presentation follows the MED-01 render `reference/medicine/medicine_finder.png`:
 * a large rounded search field with a clear button → a row of outlined dropdown
 * pills (location | radius | pharmacy type | Filters) → the boxed category rail
 * → medicine cards drawn as the reference's green-tinted hero (product mark,
 * name, generic, indication tags, prescription line, then availability / price
 * range / pack size) → the nearby-pharmacy list (mark, name, open pill,
 * distance + hours, "View Details") → the safety strip. Colours come from
 * `useTheme()`; green is the medicine accent, as in the render.
 *
 * ── 375pt COMPROMISES (the render is drawn at ~430pt, in two columns) ───────
 *  • The render's two-column split — pharmacy list on the left, "Selected
 *    Medicine" panel on the right — is a drill-in on a phone: tapping a
 *    medicine opens app/pharmacy/[medicineId].tsx, which carries the whole
 *    right-hand panel. This screen stays single column.
 *  • The hero card's right-hand column (availability, price range, pack size)
 *    cannot sit beside a drug name at 375pt without clipping the name (see the
 *    `MedicineRow` note below), so it becomes a full-width tier underneath.
 *  • The render's "Sort by: Distance" dropdown is rendered as a static pill:
 *    GET /mobile/pharmacy/nearby only ever orders by distance, and a chevron
 *    that opens a menu with one item is a control that lies.
 *  • Pharmacy PHOTOS in the render are not in any payload this app receives —
 *    `NearbyPharmacy` carries no image field at all — so each row shows a
 *    tinted storefront mark instead. Nothing is fabricated to fill the slot.
 *  • The render's "Learn More" button on the safety strip has no destination
 *    that is actually about buying safely, so it is not drawn. (The detail
 *    screen's privacy panel does have one — /privacy — and keeps its link.)
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
 * The tint each category wears on the rail, keyed by the same icon key the API
 * sends. The reference gives every tile its own colour and that variety IS the
 * rail — a rail in one grey reads as a row of chips. Values are palette keys,
 * so both brands and both themes resolve them themselves.
 */
type TintKey = 'tintRed' | 'tintGreen' | 'tintBlue' | 'tintAmber' | 'tintPurple';

const CATEGORY_TINTS: Record<string, TintKey> = {
  pill: 'tintRed',
  'shield-plus': 'tintGreen',
  droplet: 'tintPurple',
  'heart-pulse': 'tintRed',
  'flask-conical': 'tintBlue',
  wind: 'tintGreen',
  sparkles: 'tintAmber',
  'circle-dot': 'tintAmber',
  bug: 'tintPurple',
  baby: 'tintBlue',
  package: 'tintBlue',
};

const FALLBACK_CATEGORY_TINT: TintKey = 'tintBlue';

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

/**
 * Which dropdown pill is currently open. The MED-01 render draws these four
 * controls as dropdowns, not as toggle chips, so only one panel is open at a
 * time and the pill that owns it shows a chevron-up.
 */
type SheetKey = 'city' | 'radius' | 'type' | 'filters' | null;
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
  /** Badge on the render's "Filters" pill — only what that panel itself owns. */
  const activeFilterCount = (reportedOnly ? 1 : 0) + (rxFilter !== null ? 1 : 0);
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
        // The detail screen draws the render's "Your location" cell. It has
        // only coordinates otherwise, and "4.051, 9.768" is not a place a
        // patient recognises — so the chosen origin travels by name too.
        city: city.name,
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
        {/* Search — the render's big rounded field with a clear button.
            Built here rather than with the kit `PillInput`, whose hexagon
            icon badge is a login-screen mark the render does not draw. */}
        <SearchField
          value={term}
          onChangeText={setTerm}
          placeholder={t('pharmacy.searchPlaceholder')}
          clearLabel={t('pharmacy.clearSearch', { defaultValue: 'Clear search' })}
        />

        {/* Filter row — four outlined dropdown pills, exactly as the render:
            location | radius | pharmacy type | Filters. The prescription and
            in-stock toggles live behind "Filters" rather than as loose chips. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRail}
          contentContainerStyle={styles.chipRailContent}
        >
          <DropPill
            icon="location"
            label={city.name}
            open={sheet === 'city'}
            onPress={() => setSheet((s) => (s === 'city' ? null : 'city'))}
            accessibilityLabel={`${t('pharmacy.cityPickerTitle')}: ${city.name}`}
          />
          <DropPill
            icon="target"
            label={t('pharmacy.radius', { km: radiusKm })}
            open={sheet === 'radius'}
            onPress={() => setSheet((s) => (s === 'radius' ? null : 'radius'))}
            accessibilityLabel={`${t('pharmacy.radiusPickerTitle')}: ${t('pharmacy.radius', { km: radiusKm })}`}
          />
          <DropPill
            icon={openNowOnly ? 'clock' : 'store'}
            label={openNowOnly ? t('pharmacy.openNow') : t('pharmacy.allPharmacies')}
            open={sheet === 'type'}
            onPress={() => setSheet((s) => (s === 'type' ? null : 'type'))}
            accessibilityLabel={t('pharmacy.pharmacyType')}
          />
          <DropPill
            icon="filter"
            label={t('pharmacy.filters')}
            open={sheet === 'filters'}
            count={activeFilterCount}
            chevron={false}
            onPress={() => setSheet((s) => (s === 'filters' ? null : 'filters'))}
            accessibilityLabel={t('pharmacy.filtersTitle')}
          />
        </ScrollView>

        {sheet === 'type' ? (
          <OptionCard title={t('pharmacy.pharmacyType')}>
            <ListRow
              title={t('pharmacy.allPharmacies')}
              trailing={!openNowOnly ? <Icon name="check" size={18} color={colors.blue} /> : undefined}
              chevron={false}
              divider
              onPress={() => {
                setOpenNowOnly(false);
                setSheet(null);
              }}
            />
            <ListRow
              title={t('pharmacy.openNow')}
              trailing={openNowOnly ? <Icon name="check" size={18} color={colors.blue} /> : undefined}
              chevron={false}
              divider={false}
              onPress={() => {
                setOpenNowOnly(true);
                setSheet(null);
              }}
            />
          </OptionCard>
        ) : null}

        {sheet === 'filters' ? (
          <OptionCard title={t('pharmacy.filtersTitle')}>
            <ListRow
              title={t('pharmacy.stockingOnly')}
              meta={[
                t('pharmacy.catalogueScopeHint', {
                  defaultValue:
                    'Availability counts every pharmacy in the national directory that reports stock — not only those near you.',
                }),
              ]}
              trailing={
                <Icon
                  name={reportedOnly ? 'check-circle' : 'circle'}
                  size={20}
                  color={reportedOnly ? colors.statusNormal : colors.textMuted}
                />
              }
              chevron={false}
              divider
              onPress={() => setReportedOnly((only) => !only)}
            />
            <ListRow
              title={t('pharmacy.filterRx')}
              trailing={
                <Icon
                  name={rxFilter === true ? 'check-circle' : 'circle'}
                  size={20}
                  color={rxFilter === true ? colors.statusNormal : colors.textMuted}
                />
              }
              chevron={false}
              divider
              onPress={() => setRxFilter((v) => (v === true ? null : true))}
            />
            <ListRow
              title={t('pharmacy.filterOtc')}
              trailing={
                <Icon
                  name={rxFilter === false ? 'check-circle' : 'circle'}
                  size={20}
                  color={rxFilter === false ? colors.statusNormal : colors.textMuted}
                />
              }
              chevron={false}
              divider={filtersActive}
              onPress={() => setRxFilter((v) => (v === false ? null : false))}
            />
            {filtersActive ? (
              <ListRow
                icon="close"
                tint="red"
                title={t('pharmacy.clearFilters')}
                chevron={false}
                divider={false}
                onPress={() => {
                  clearFilters();
                  setSheet(null);
                }}
              />
            ) : null}
          </OptionCard>
        ) : null}

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

        {/* The render's category rail: boxed icon-over-label tiles, "All"
            first, selected tile outlined and filled green. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRail}
          contentContainerStyle={styles.chipRailContent}
        >
          <CategoryTile
            icon="grid"
            label={t('pharmacy.categoryAll')}
            selected={category === null}
            onPress={() => setCategory(null)}
          />
          {(categories.data?.categories ?? [])
            .filter((c) => c.medicine_count > 0)
            .map((c) => (
              <CategoryTile
                key={c.value}
                icon={CATEGORY_ICONS[c.icon] ?? FALLBACK_CATEGORY_ICON}
                tint={CATEGORY_TINTS[c.icon] ?? FALLBACK_CATEGORY_TINT}
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
              {/* Twelve medicines are twelve things to compare, not one
                  object with twelve properties. Each gets its own card; the
                  gap is what says they are separate. */}
              <ResultList>
                {shownResults.map((medicine) => (
                  <Card key={medicine.id} variant="flush">
                    <MedicineRow
                      medicine={medicine}
                      divider={false}
                      onPress={() => openMedicine(medicine.id)}
                    />
                  </Card>
                ))}
              </ResultList>

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
          {/* "Nearby Pharmacies (12)" with the render's sort control on the
              right. It is a STATIC pill, not a dropdown: the endpoint orders
              by distance and offers no other ordering, and a chevron opening a
              one-item menu would be a control that lies. */}
          <View style={styles.listHead}>
            <Text style={styles.listHeadTitle} accessibilityRole="header" numberOfLines={1}>
              {pharmacies.isSuccess
                ? t('pharmacy.nearbyPharmacies', { count: pharmacyRows.length })
                : t('pharmacy.nearbyTitle')}
            </Text>
            <View style={styles.sortPill}>
              <Icon name="arrow-down" size={13} color={colors.textMuted} />
              <Text style={styles.sortPillText}>{t('pharmacy.sortByDistance')}</Text>
            </View>
          </View>
          <Text style={styles.sectionHint}>
            {t('pharmacy.radiusSearched', {
              km: radiusKm,
              defaultValue: 'Searched within {{km}} km',
            })}
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

        {/* Safety notice — the render's blue strip, shield inside a round mark. */}
        <View style={styles.notice} accessibilityRole="summary">
          <View style={styles.noticeMark}>
            <Icon name="shield-check" size={20} color={colors.blue} />
          </View>
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

/**
 * The render's big rounded search field: magnifier, field, clear button.
 *
 * Local rather than the kit `PillInput` because that control wraps its icon in
 * the hexagon badge from the login screens, which MED-01 does not draw. Every
 * colour and token still comes from the theme.
 */
function SearchField({
  value,
  onChangeText,
  placeholder,
  clearLabel,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  clearLabel: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.search, focused && { borderColor: colors.borderFocus }]}>
      <Icon name="search" size={20} color={focused ? colors.blue : colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel={placeholder}
        style={styles.searchInput}
      />
      {value.length > 0 ? (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          hitSlop={10}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
        >
          <Icon name="x-circle" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/**
 * One of the render's outlined dropdown pills: icon, current value, chevron.
 *
 * Not the kit `Chip` — a chip is a filled on/off toggle, and MED-01 draws
 * these as white bordered controls that OPEN something. The chevron flips to
 * `chevron-up` while its panel is open so the pill says which one is showing.
 */
function DropPill({
  icon,
  label,
  open,
  count,
  chevron = true,
  onPress,
  accessibilityLabel,
}: {
  icon: IconName;
  label: string;
  open: boolean;
  count?: number;
  chevron?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fg = open ? colors.blue : colors.textSecondary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: open }}
      style={[styles.dropPill, open && { borderColor: colors.blue, backgroundColor: colors.primarySoft }]}
    >
      <Icon name={icon} size={15} color={fg} />
      <Text style={[styles.dropPillText, open && { color: colors.blue }]} numberOfLines={1}>
        {label}
      </Text>
      {count ? (
        <View style={styles.dropPillCount}>
          <Text style={styles.dropPillCountText}>{count}</Text>
        </View>
      ) : null}
      {chevron ? (
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
      ) : null}
    </TouchableOpacity>
  );
}

/**
 * One tile of the reference's category rail (MED-01).
 *
 * The image draws these as boxed icon-over-label tiles rather than text chips,
 * and the rail is the most recognisable thing on the Medicine Finder. The
 * count rides in the corner so a category with nothing in it is visibly empty
 * instead of silently returning no results.
 */
function CategoryTile({
  icon,
  label,
  count,
  tint,
  selected,
  onPress,
}: {
  icon: IconName;
  label: string;
  count?: number;
  /** Palette key for this category's colour; omitted by the "All" tile. */
  tint?: TintKey;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const stroke = tint ? colors[tint] : colors.blue;
  const fill = tint ? colors[`${tint}Bg` as keyof typeof colors] : colors.primarySoft;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
      style={[
        styles.catTile,
        {
          borderColor: selected ? stroke : colors.border,
          backgroundColor: selected ? fill : colors.surface,
        },
      ]}
    >
      <View style={[styles.catMark, { backgroundColor: selected ? colors.surface : fill }]}>
        <Icon name={icon} size={19} color={stroke} />
      </View>
      <Text
        style={[styles.catLabel, selected && { color: colors.textPrimary }]}
        numberOfLines={2}
      >
        {label}
      </Text>
      {count !== undefined ? <Text style={styles.catCount}>{count}</Text> : null}
    </TouchableOpacity>
  );
}


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
 * One catalogue row, drawn as the MED-01 render's green-tinted medicine hero:
 * a product mark on the left, then name / "Generic: …" / indication tag pills /
 * the prescription line, with availability, price range and pack size below.
 *
 * ── What is NOT here, and why ─────────────────────────────────────────────
 * The render shows a photograph of the box. No medicine payload this app
 * receives carries an image of any kind (see `Medicine` in lib/api/queries.ts),
 * so the slot holds a tinted category mark rather than a stock photo of some
 * other manufacturer's packet.
 *
 * ── Why the render's right-hand column is a tier, not a column ─────────────
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
  const rx = medicine.prescription_required;

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

  // The render's three tag pills. These are the medicine's own `indications`;
  // when the catalogue carries none the row simply has no tags — nothing is
  // synthesised from the category to fill the space. Capped at three because
  // that is what fits on one line at 375pt.
  const tags = (medicine.indications ?? []).slice(0, 3);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={[
        medicine.name,
        identity,
        dose,
        rx ? t('pharmacy.prescriptionRequired') : t('pharmacy.prescriptionNotRequired'),
        medicine.is_controlled ? t('pharmacy.controlled') : null,
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
      style={[
        styles.medRow,
        // The render tints the hero card green. Here that tint carries the one
        // fact it is honest for it to carry: a pharmacy somewhere has reported
        // this medicine. Rows nobody has reported stay on the plain surface.
        available && styles.medRowAvailable,
        divider && styles.medRowDivider,
      ]}
    >
      <View style={styles.medHead}>
        {/* Product mark — the render's photograph has no payload behind it. */}
        <View
          style={[
            styles.medShot,
            {
              backgroundColor: medicine.is_controlled
                ? colors.tintAmberBg
                : available
                  ? colors.tintGreenBg
                  : colors.tintBlueBg,
            },
          ]}
        >
          <Icon
            name={CATEGORY_ICONS[medicine.category_icon] ?? 'pill'}
            size={30}
            color={
              medicine.is_controlled
                ? colors.tintAmber
                : available
                  ? colors.tintGreen
                  : colors.tintBlue
            }
          />
        </View>

        <View style={styles.medBody}>
          <Text style={styles.medName} numberOfLines={3}>
            {medicine.name}
          </Text>
          {identity ? (
            <Text style={styles.medMeta} numberOfLines={1}>
              {identity}
            </Text>
          ) : null}
          {dose ? (
            <Text style={styles.medMeta} numberOfLines={1}>
              {dose}
            </Text>
          ) : null}

          {tags.length > 0 ? (
            <View style={styles.tagRow}>
              {tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText} numberOfLines={1}>
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* The render's green tick + "Prescription not required" line. */}
          <View style={styles.rxLine}>
            <Icon
              name={rx ? 'alert-circle' : 'check-circle'}
              size={15}
              color={rx ? colors.statusWarning : colors.statusNormal}
            />
            <Text
              style={[
                styles.rxLineText,
                { color: rx ? colors.statusWarning : colors.statusNormal },
              ]}
              numberOfLines={2}
            >
              {rx ? t('pharmacy.prescriptionRequired') : t('pharmacy.prescriptionNotRequired')}
            </Text>
            {medicine.is_controlled ? (
              <StatusBadge
                status="controlled"
                tone="warning"
                label={t('pharmacy.controlled')}
                size="sm"
              />
            ) : null}
          </View>
        </View>

        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      </View>

      {/* The render's right-hand column, carried as a full-width tier: the
          availability claim, the price range, the pack size. It wraps, so a
          long range and a long badge stack instead of clipping each other. */}
      <View style={styles.medFoot}>
        <View style={styles.medFootCell}>
          <View style={styles.medFootHead}>
            <Icon
              name={available ? 'check-circle' : 'info'}
              size={14}
              color={available ? colors.statusNormal : colors.textMuted}
            />
            <Text style={styles.medFootLabel} numberOfLines={1}>
              {t('pharmacy.pricingStock')}
            </Text>
          </View>
          <Text
            style={[
              styles.medFootValue,
              { color: available ? colors.statusNormal : colors.textMuted },
            ]}
            numberOfLines={2}
          >
            {available
              ? t('pharmacy.available')
              : t('pharmacy.notReported', { defaultValue: 'Not reported' })}
          </Text>
        </View>

        {quote ? (
          <View style={[styles.medFootCell, styles.medFootCellDivided]}>
            <Text style={styles.medFootLabel} numberOfLines={1}>
              {/* A figure nobody is charging must not look like a quote. */}
              {quote.reported
                ? t('pharmacy.priceRange')
                : t('pharmacy.priceIndicative', { defaultValue: 'Catalogue price' })}
            </Text>
            <Text style={styles.medFootPrice} numberOfLines={2}>
              {quote.label}
            </Text>
          </View>
        ) : null}

        {medicine.default_pack_size ? (
          <View style={[styles.medFootCell, styles.medFootCellDivided]}>
            <Text style={styles.medFootLabel} numberOfLines={1}>
              {t('pharmacy.packSizeLabel', { defaultValue: 'Pack size' })}
            </Text>
            <Text style={styles.medFootValue} numberOfLines={2}>
              {medicine.default_pack_size}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

/**
 * Directory row, drawn as the MED-01 render's pharmacy card: mark on the left,
 * then name with an Open / Closed pill beside it, the distance-and-hours line,
 * and a "View Details" outlined button.
 *
 * ── Two things the render draws that this row must not ────────────────────
 *  • The PHOTO. `NearbyPharmacy` carries no image field; a storefront picture
 *    would have to be invented. The slot holds a tinted mark instead.
 *  • The STOCK LINE and the PRICE PILL. This list is fetched without a
 *    `medicine_id`, and MedicineFinderService only loads stock rows when a
 *    medicine is supplied, so `stock` is always null here by construction.
 *    Per-medicine stock, price and the reserve action live on the detail
 *    screen. Nothing on this row claims anything about the shelf.
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
  // fallback for a listing that carries only an area.
  const place = pharmacy.address ?? ([pharmacy.city, pharmacy.region].filter(Boolean).join(', ') || null);

  // "1.2 km  •  Closes 8:00 PM" — the render's second line, verbatim.
  const distanceHours = [t('pharmacy.distanceKm', { km: pharmacy.distance_km }), hoursLine]
    .filter(Boolean)
    .join('  •  ');

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={[pharmacy.name, openLabel, distanceHours, verification]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={t('pharmacy.viewPharmacy')}
      style={[styles.phRow, divider && styles.phRowDivider]}
    >
      {/* Storefront mark. The render shows a photo; no payload carries one. */}
      <View style={styles.phShot}>
        <Icon name="store" size={26} color={colors.tintBlue} />
      </View>

      <View style={styles.phBody}>
        <View style={styles.phTitleRow}>
          <Text style={styles.phName} numberOfLines={2}>
            {pharmacy.name}
          </Text>
          <StatusBadge status={openLabel} tone={openTone} label={openLabel} size="sm" />
        </View>

        <Text style={styles.phMeta} numberOfLines={1}>
          {distanceHours}
        </Text>
        {verification ? (
          <Text style={styles.phMeta} numberOfLines={1}>
            {verification}
          </Text>
        ) : null}
        {place ? (
          <Text style={styles.phMeta} numberOfLines={1}>
            {place}
          </Text>
        ) : null}

        <MedButton
          label={t('pharmacy.viewDetails')}
          icon="store"
          variant="secondary"
          size="sm"
          onPress={onPress}
          style={styles.phAction}
        />
      </View>
    </TouchableOpacity>
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
    /* MED-01 category rail */
    catTile: {
      width: 84,
      minHeight: 92,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingHorizontal: 6,
      paddingVertical: spacing.sm,
      marginRight: spacing.xs,
    },
    catMark: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 11,
      lineHeight: 14,
      textAlign: 'center',
      color: c.textSecondary,
    },
    catCount: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 10,
      color: c.textMuted,
    },

    screen: { flex: 1, backgroundColor: c.page },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    stack: { gap: spacing.md },

    /* MED-01 search field */
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      minHeight: 52,
      paddingHorizontal: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1.4,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },

    /* MED-01 filter dropdown pills */
    dropPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: 210,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    dropPillText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: c.textSecondary,
    },
    dropPillCount: {
      minWidth: 18,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: radii.pill,
      backgroundColor: c.statusNormalBg,
    },
    dropPillCountText: {
      textAlign: 'center',
      fontFamily: typography.fontFamily.bold,
      fontSize: 10,
      color: c.statusNormal,
    },

    /* Section head with the render's static "Sort by: Distance" pill */
    listHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: spacing.sm + 2,
    },
    listHeadTitle: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },
    sortPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    sortPillText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 11,
      color: c.textMuted,
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

    /* MED-01 medicine hero card — the name owns the full width and wraps;
       availability, price and pack size sit on their own tier underneath.
       `medBody` needs `minWidth: 0` or the flex child refuses to shrink and
       the text overflows the row instead of wrapping inside it. */
    medRow: { paddingVertical: 14, paddingHorizontal: spacing.md, gap: spacing.sm + 2 },
    medRowAvailable: { backgroundColor: c.statusNormalBg },
    medRowDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
    medHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    medShot: {
      width: 62,
      height: 62,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
    /* The render's indication tag pills. */
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
    tag: {
      maxWidth: 130,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    tagText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: 11,
      color: c.textSecondary,
    },
    rxLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    rxLineText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
    },
    /* The render's right-hand column, carried as a tier at 375pt. */
    medFoot: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      flexWrap: 'wrap',
      rowGap: spacing.sm,
      paddingTop: spacing.sm + 2,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    medFootCell: { flexGrow: 1, flexBasis: '30%', minWidth: 92, gap: 2, paddingRight: 8 },
    medFootCellDivided: { borderLeftWidth: 1, borderLeftColor: c.divider, paddingLeft: 10 },
    medFootHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    medFootLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: 14,
      color: c.textMuted,
    },
    medFootValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textPrimary,
    },
    medFootPrice: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.statusNormal,
    },

    /* MED-01 pharmacy card */
    phRow: { flexDirection: 'row', gap: 12, paddingVertical: 14, paddingHorizontal: spacing.md },
    phRowDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
    phShot: {
      width: 56,
      height: 56,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.tintBlueBg,
    },
    phBody: { flex: 1, minWidth: 0, gap: 2 },
    phTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    phName: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textPrimary,
    },
    phMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
    phAction: { alignSelf: 'flex-start', marginTop: spacing.sm },

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
    noticeMark: {
      width: 40,
      height: 40,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
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
