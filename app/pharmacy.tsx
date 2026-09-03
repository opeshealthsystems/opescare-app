import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Baby,
  Bug,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleDot,
  Clock,
  Crosshair,
  Droplet,
  FlaskConical,
  HeartPulse,
  LayoutGrid,
  MapPin,
  Package,
  Pill,
  Search,
  ShieldCheck,
  ShieldPlus,
  Sparkles,
  Store,
  Ticket,
  Wind,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../components/ui/Screen';
import { colors } from '../theme/tokens';
import {
  useCancelMedicineReservation,
  useMedicineCategories,
  useMedicineReservations,
  useNearbyPharmacies,
  type Medicine,
  type MedicineCategoryValue,
  type MedicineReservation,
  type NearbyPharmacy,
} from '../lib/api/queries';
import { formatXaf, formatXafBare, useMedicineCatalog } from '../lib/api/pharmacyQueries';

/**
 * Medicine Finder — search the national catalogue, see where a medicine is
 * stocked, and manage the holds you already have.
 *
 * Reference: `Mobile app screens/a_clean_mobile_app_ui_screenshot_of_a_medicine_fi.png`
 * (search field → filter row → category tiles → medicine card → nearby pharmacy
 * list → safety banner). The reference is drawn in a green/white palette; per
 * the design spec that palette is superseded by the gold/cream brand, so the
 * layout and interaction model are matched while every colour comes from
 * theme/tokens. The reference's two-column desktop split (list on the left,
 * "Selected Medicine" panel on the right) becomes a drill-in on a phone:
 * tapping a medicine opens app/pharmacy/[medicineId].tsx.
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

/** Maps the `category_icon` key MedicineCategory::iconKey() returns onto a
 *  Lucide icon. Every value the enum can emit is covered; `Package` is the
 *  defensive fallback if the enum gains a case before this map does. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  pill: Pill,
  'shield-plus': ShieldPlus,
  droplet: Droplet,
  'heart-pulse': HeartPulse,
  'flask-conical': FlaskConical,
  wind: Wind,
  sparkles: Sparkles,
  'circle-dot': CircleDot,
  bug: Bug,
  baby: Baby,
  package: Package,
};

const CARD_SHADOW = {
  shadowColor: colors.navy.text,
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

type SheetKey = 'city' | 'radius' | null;
/** null = both kinds, true = prescription-only, false = over-the-counter. */
type RxFilter = boolean | null;

export default function PharmacyScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

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
  const [cancelError, setCancelError] = useState(false);

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

  const openMedicine = (medicine: Medicine) =>
    router.push({
      pathname: '/pharmacy/[medicineId]',
      params: {
        medicineId: medicine.id,
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
            accessibilityLabel={t('pharmacy.back')}
            className="h-10 w-10 items-center justify-center rounded-xl border border-cream-300 bg-white"
          >
            <ChevronLeft size={20} color={colors.navy.text} />
          </Pressable>

          <View className="flex-row items-center">
            <Text className="text-base font-extrabold text-navy-text">Opes</Text>
            <Text className="text-base font-extrabold text-brand-500">Care</Text>
          </View>

          {openHolds.length > 0 ? (
            <Pressable
              onPress={() => setReservationsOpen((open) => !open)}
              className="h-10 flex-row items-center rounded-xl border border-brand-500 bg-brand-50 px-3"
              accessibilityRole="button"
              accessibilityLabel={t('pharmacy.reservationsTitle')}
            >
              <Ticket size={15} color={colors.brand[600]} />
              <Text className="ml-1.5 text-xs font-extrabold text-brand-700">
                {openHolds.length}
              </Text>
            </Pressable>
          ) : (
            <View className="h-10 w-10" />
          )}
        </View>

        {/* Hero */}
        <LinearGradient
          colors={[colors.brand[600], colors.brand[500], colors.brand[300]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 24, marginTop: 20, padding: 20 }}
        >
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-2xl font-extrabold text-white">{t('pharmacy.title')}</Text>
              <Text className="mt-1.5 text-xs leading-4 text-white/85">
                {t('pharmacy.subtitle')}
              </Text>
            </View>
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
              <Pill color={colors.white} size={26} />
            </View>
          </View>

          <View className="mt-5 flex-row">
            <HeroStat
              label={t('pharmacy.resultsTitle')}
              value={catalog.isPending ? '—' : String(total)}
            />
            <View className="mx-4 w-px bg-white/25" />
            <HeroStat
              label={t('pharmacy.nearbyTitle')}
              value={pharmacies.isPending ? '—' : String(pharmacyRows.length)}
            />
          </View>
        </LinearGradient>

        {/* Search */}
        <View
          className="mt-4 h-14 flex-row items-center rounded-2xl border border-cream-300 bg-white px-4"
          style={CARD_SHADOW}
        >
          <Search size={18} color={colors.brand[600]} />
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder={t('pharmacy.searchPlaceholder')}
            placeholderTextColor={colors.navy.muted}
            className="ml-3 flex-1 text-base text-navy-text"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel={t('pharmacy.searchPlaceholder')}
          />
          {term.length > 0 ? (
            <Pressable
              onPress={() => setTerm('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('pharmacy.close')}
            >
              <View className="h-6 w-6 items-center justify-center rounded-full bg-cream-200">
                <X size={13} color={colors.navy.secondary} />
              </View>
            </Pressable>
          ) : null}
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-6 mt-3 px-6"
          contentContainerStyle={{ gap: 8, paddingRight: 24 }}
        >
          <FilterChip
            icon={MapPin}
            label={city.name}
            caret
            active={sheet === 'city'}
            onPress={() => setSheet((s) => (s === 'city' ? null : 'city'))}
          />
          <FilterChip
            icon={Crosshair}
            label={t('pharmacy.radius', { km: radiusKm })}
            caret
            active={sheet === 'radius'}
            onPress={() => setSheet((s) => (s === 'radius' ? null : 'radius'))}
          />
          <FilterChip
            icon={openNowOnly ? Clock : Store}
            label={openNowOnly ? t('pharmacy.openNow') : t('pharmacy.allPharmacies')}
            active={openNowOnly}
            onPress={() => setOpenNowOnly((only) => !only)}
          />
          <FilterChip
            icon={ShieldPlus}
            label={t('pharmacy.filterRx')}
            active={rxFilter === true}
            onPress={() => setRxFilter((v) => (v === true ? null : true))}
          />
          <FilterChip
            icon={Sparkles}
            label={t('pharmacy.filterOtc')}
            active={rxFilter === false}
            onPress={() => setRxFilter((v) => (v === false ? null : false))}
          />
        </ScrollView>

        {sheet === 'city' ? (
          <OptionPanel title={t('pharmacy.cityPickerTitle')}>
            {CITIES.map((option, index) => (
              <OptionRow
                key={option.key}
                label={option.name}
                selected={option.key === city.key}
                last={index === CITIES.length - 1}
                onPress={() => {
                  setCity(option);
                  setSheet(null);
                }}
              />
            ))}
          </OptionPanel>
        ) : null}

        {sheet === 'radius' ? (
          <OptionPanel title={t('pharmacy.radiusPickerTitle')}>
            {RADIUS_OPTIONS.map((option, index) => (
              <OptionRow
                key={option}
                label={t('pharmacy.radius', { km: option })}
                selected={option === radiusKm}
                last={index === RADIUS_OPTIONS.length - 1}
                onPress={() => {
                  setRadiusKm(option);
                  setSheet(null);
                }}
              />
            ))}
          </OptionPanel>
        ) : null}

        {/* Category tiles */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-6 mt-4 px-6"
          contentContainerStyle={{ gap: 8, paddingRight: 24 }}
        >
          <CategoryChip
            icon={LayoutGrid}
            label={t('pharmacy.categoryAll')}
            selected={category === null}
            onPress={() => setCategory(null)}
          />
          {(categories.data?.categories ?? [])
            .filter((c) => c.medicine_count > 0)
            .map((c) => (
              <CategoryChip
                key={c.value}
                icon={CATEGORY_ICONS[c.icon] ?? Package}
                label={t(`pharmacy.categories.${c.value}`, { defaultValue: c.label })}
                count={c.medicine_count}
                selected={category === c.value}
                onPress={() => setCategory(category === c.value ? null : c.value)}
              />
            ))}
        </ScrollView>

        {/* Open holds */}
        {openHolds.length > 0 ? (
          <View className="mt-6 rounded-2xl border border-brand-100 bg-cream-200 p-4">
            <Pressable
              onPress={() => setReservationsOpen((open) => !open)}
              className="flex-row items-center"
              accessibilityRole="button"
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-white">
                <Ticket size={18} color={colors.brand[600]} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-sm font-bold text-navy-text">
                  {t('pharmacy.reservationsTitle')}
                </Text>
                <Text className="mt-0.5 text-[11px] text-navy-secondary">
                  {t('pharmacy.reservationsSubtitle', { count: openHolds.length })}
                </Text>
              </View>
              <Text className="text-[11px] font-bold text-brand-600">
                {reservationsOpen ? t('pharmacy.reservationsHide') : t('pharmacy.reservationsShow')}
              </Text>
              <ChevronDown
                size={14}
                color={colors.brand[600]}
                style={{
                  marginLeft: 4,
                  transform: [{ rotate: reservationsOpen ? '180deg' : '0deg' }],
                }}
              />
            </Pressable>

            {reservationsOpen ? (
              <View className="mt-3" style={{ gap: 8 }}>
                {openHolds.map((hold) => (
                  <ReservationRow
                    key={hold.id}
                    reservation={hold}
                    language={i18n.language}
                    cancelling={
                      cancelReservation.isPending && cancelReservation.variables?.id === hold.id
                    }
                    onOpenMedicine={
                      hold.medicine
                        ? () =>
                            router.push({
                              pathname: '/pharmacy/[medicineId]',
                              params: {
                                medicineId: hold.medicine!.id,
                                lat: String(city.lat),
                                lng: String(city.lng),
                                radiusKm: String(radiusKm),
                              },
                            })
                        : null
                    }
                    onCancel={() => {
                      setCancelError(false);
                      cancelReservation.mutate(
                        { id: hold.id },
                        { onError: () => setCancelError(true) },
                      );
                    }}
                  />
                ))}
                {cancelError ? (
                  <Text
                    className="mt-1 text-[11px]"
                    style={{ color: colors.semantic.danger }}
                  >
                    {t('pharmacy.reservationCancelFailed')}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Catalogue results */}
        <View className="mt-6 flex-row items-center justify-between">
          <Text className="text-base font-bold text-navy-text">{t('pharmacy.resultsTitle')}</Text>
          {catalog.isPending ? (
            <Text className="text-[11px] text-navy-muted">{t('pharmacy.searching')}</Text>
          ) : (
            <View className="flex-row items-center">
              <Text className="text-[11px] font-semibold text-navy-secondary">
                {t('pharmacy.resultsCount', { count: total })}
              </Text>
              {filtersActive ? (
                <Pressable onPress={clearFilters} hitSlop={8} className="ml-3">
                  <Text className="text-[11px] font-bold text-brand-600">
                    {t('pharmacy.clearFilters')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>

        {catalog.isPending ? (
          <View className="mt-3" style={{ gap: 12 }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : catalog.isError ? (
          <ErrorPanel
            message={t('pharmacy.loadFailed')}
            actionLabel={t('pharmacy.retry')}
            onRetry={() => catalog.refetch()}
          />
        ) : results.length === 0 ? (
          <EmptyPanel
            icon={Search}
            title={t('pharmacy.noMedicines')}
            body={t('pharmacy.noResultsHint')}
            actionLabel={filtersActive ? t('pharmacy.clearFilters') : null}
            onAction={filtersActive ? clearFilters : null}
          />
        ) : (
          <View className="mt-3" style={{ gap: 12 }}>
            {results.map((medicine) => (
              <MedicineCard
                key={medicine.id}
                medicine={medicine}
                onPress={() => openMedicine(medicine)}
              />
            ))}
          </View>
        )}

        {/* Pharmacies near the chosen origin */}
        <View className="mt-8 flex-row items-end justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-base font-bold text-navy-text">
              {pharmacies.isSuccess
                ? t('pharmacy.nearbyPharmacies', { count: pharmacyRows.length })
                : t('pharmacy.nearbyTitle')}
            </Text>
            <Text className="mt-0.5 text-[11px] text-navy-secondary">
              {t('pharmacy.nearbySubtitle')}
            </Text>
          </View>
          <View className="rounded-xl border border-cream-300 bg-white px-3 py-1.5">
            <Text className="text-[10px] font-semibold text-navy-secondary">
              {t('pharmacy.sortByDistance')}
            </Text>
          </View>
        </View>

        {pharmacies.isPending ? (
          <View className="mt-4 items-center">
            <ActivityIndicator color={colors.brand[500]} />
            <Text className="mt-2 text-[11px] text-navy-muted">
              {t('pharmacy.loadingPharmacies')}
            </Text>
          </View>
        ) : pharmacies.isError ? (
          <ErrorPanel
            message={t('pharmacy.loadFailed')}
            actionLabel={t('pharmacy.retry')}
            onRetry={() => pharmacies.refetch()}
          />
        ) : pharmacyRows.length === 0 ? (
          // Two different empty causes, two different escapes: nothing in the
          // radius at all, or the "open now" narrowing hid everything.
          openNowOnly && allPharmacyRows.length > 0 ? (
            <EmptyPanel
              icon={Clock}
              title={t('pharmacy.closed')}
              body={t('pharmacy.nearbySubtitle')}
              actionLabel={t('pharmacy.allPharmacies')}
              onAction={() => setOpenNowOnly(false)}
            />
          ) : (
            <EmptyPanel
              icon={Store}
              title={t('pharmacy.noPharmacies', { km: radiusKm })}
              body={t('pharmacy.nearbySubtitle')}
              actionLabel={t('pharmacy.radiusPickerTitle')}
              onAction={() => setSheet('radius')}
            />
          )
        ) : (
          <View className="mt-3" style={{ gap: 12 }}>
            {(showAllPharmacies ? pharmacyRows : pharmacyRows.slice(0, NEARBY_PREVIEW)).map(
              (pharmacy) => (
                <PharmacyCard
                  key={pharmacy.id}
                  pharmacy={pharmacy}
                  onPress={() =>
                    router.push({ pathname: '/facility/[id]', params: { id: pharmacy.id } })
                  }
                />
              ),
            )}

            {pharmacyRows.length > NEARBY_PREVIEW ? (
              <Pressable
                onPress={() => setShowAllPharmacies((open) => !open)}
                className="h-11 flex-row items-center justify-center rounded-2xl border border-cream-300 bg-white"
                accessibilityRole="button"
                accessibilityState={{ expanded: showAllPharmacies }}
              >
                <Text className="text-xs font-bold text-brand-600">
                  {showAllPharmacies ? t('pharmacy.showLess') : t('pharmacy.showAll')}
                </Text>
                <ChevronDown
                  size={14}
                  color={colors.brand[600]}
                  style={{
                    marginLeft: 4,
                    transform: [{ rotate: showAllPharmacies ? '180deg' : '0deg' }],
                  }}
                />
              </Pressable>
            ) : null}
          </View>
        )}

        {/* Safety notice */}
        <View className="mt-6 flex-row rounded-2xl border border-brand-100 bg-brand-50 p-4">
          <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-white">
            <ShieldCheck size={18} color={colors.brand[600]} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-navy-text">{t('pharmacy.safetyTitle')}</Text>
            <Text className="mt-1 text-xs leading-4 text-navy-secondary">
              {t('pharmacy.safetyBody')}
            </Text>
          </View>
        </View>

        <View className="h-10" />
      </ScrollView>
    </Screen>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1">
      <Text className="text-xl font-extrabold text-white">{value}</Text>
      <Text className="mt-0.5 text-[10px] font-medium text-white/80" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function MedicineCard({ medicine, onPress }: { medicine: Medicine; onPress: () => void }) {
  const { t } = useTranslation();
  const CategoryIcon = CATEGORY_ICONS[medicine.category_icon] ?? Pill;

  const { price_min: min, price_max: max, pharmacy_count: count, is_available } =
    medicine.availability;

  const priceLabel =
    min !== null && max !== null && min !== max
      ? t('pharmacy.priceRangeValue', { min: formatXafBare(min), max: formatXaf(max) })
      : (formatXaf(min ?? max) ?? t('pharmacy.priceUnavailable'));

  const subtitle = [
    t('pharmacy.generic', { name: medicine.generic_name }),
    medicine.strength && medicine.form
      ? t('pharmacy.strengthForm', { strength: medicine.strength, form: medicine.form })
      : (medicine.strength ?? medicine.form ?? null),
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl border border-cream-300 bg-white p-4"
      style={CARD_SHADOW}
      accessibilityRole="button"
      accessibilityLabel={medicine.name}
    >
      <View className="flex-row">
        <View className="h-14 w-14 items-center justify-center rounded-2xl bg-brand-50">
          <CategoryIcon size={24} color={colors.brand[600]} />
        </View>

        <View className="ml-3 flex-1">
          <View className="flex-row items-start">
            <Text className="flex-1 pr-2 text-sm font-extrabold text-navy-text" numberOfLines={2}>
              {medicine.name}
            </Text>
            {medicine.prescription_required ? (
              <View
                className="rounded-lg px-2 py-0.5"
                style={{ backgroundColor: colors.semantic.infoSurface }}
              >
                <Text
                  className="text-[10px] font-extrabold"
                  style={{ color: colors.semantic.info }}
                >
                  {t('pharmacy.rxBadge')}
                </Text>
              </View>
            ) : null}
          </View>

          <Text className="mt-1 text-[11px] text-navy-secondary" numberOfLines={1}>
            {subtitle}
          </Text>

          {medicine.indications.length > 0 ? (
            <View className="mt-2 flex-row flex-wrap" style={{ gap: 6 }}>
              {medicine.indications.slice(0, 3).map((tag) => (
                <View key={tag} className="rounded-lg bg-cream-200 px-2 py-0.5">
                  <Text className="text-[10px] font-medium text-navy-secondary">{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <ChevronRight
          size={16}
          color={colors.navy.muted}
          style={{ alignSelf: 'center', marginLeft: 4 }}
        />
      </View>

      <View className="mt-3 flex-row items-end justify-between border-t border-cream-200 pt-3">
        <View className="flex-1 pr-3">
          <View className="flex-row items-center">
            <View
              className="mr-1.5 h-2 w-2 rounded-full"
              style={{
                backgroundColor: is_available ? colors.semantic.success : colors.navy.muted,
              }}
            />
            <Text
              className="text-[11px] font-semibold"
              style={{ color: is_available ? colors.semantic.success : colors.navy.muted }}
              numberOfLines={1}
            >
              {is_available
                ? t('pharmacy.pharmacyCount', { count })
                : t('pharmacy.availabilityNone')}
            </Text>
          </View>
          {medicine.default_pack_size ? (
            <Text className="mt-1 text-[10px] text-navy-muted" numberOfLines={1}>
              {t('pharmacy.packSize', { size: medicine.default_pack_size })}
            </Text>
          ) : null}
        </View>

        <View className="items-end">
          <Text className="text-[10px] text-navy-muted">{t('pharmacy.priceRange')}</Text>
          <Text className="mt-0.5 text-sm font-extrabold text-brand-600">{priceLabel}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Directory card. This list is fetched without a `medicine_id`, and
 * MedicineFinderService only loads stock rows when a medicine is supplied, so
 * `stock` is always null here by construction — per-medicine stock, price and
 * the reserve action all live on the detail screen instead.
 */
function PharmacyCard({ pharmacy, onPress }: { pharmacy: NearbyPharmacy; onPress: () => void }) {
  const { t } = useTranslation();

  const openLabel = pharmacy.is_24_hours
    ? t('pharmacy.open24')
    : pharmacy.is_open === null
      ? t('pharmacy.hoursUnknown')
      : pharmacy.is_open
        ? t('pharmacy.open')
        : t('pharmacy.closed');

  const hoursLine = pharmacy.is_24_hours
    ? null
    : pharmacy.is_open && pharmacy.closes_at
      ? t('pharmacy.closesAt', { time: pharmacy.closes_at })
      : !pharmacy.is_open && pharmacy.opens_at
        ? t('pharmacy.opensAt', { time: pharmacy.opens_at })
        : null;

  return (
    <Pressable
      onPress={onPress}
      className="flex-row rounded-2xl border border-cream-300 bg-white p-3"
      style={CARD_SHADOW}
      accessibilityRole="button"
      accessibilityLabel={pharmacy.name}
    >
      <View className="h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
        <Store size={22} color={colors.brand[600]} />
      </View>

      <View className="ml-3 flex-1">
        <View className="flex-row items-start justify-between">
          <Text className="flex-1 pr-2 text-sm font-bold text-navy-text" numberOfLines={1}>
            {pharmacy.name}
          </Text>
          <View
            className="rounded-lg px-2 py-0.5"
            style={{
              backgroundColor:
                pharmacy.is_open === false
                  ? colors.semantic.dangerSurface
                  : pharmacy.is_open === null
                    ? colors.cream[200]
                    : colors.semantic.successSurface,
            }}
          >
            <Text
              className="text-[10px] font-bold"
              style={{
                color:
                  pharmacy.is_open === false
                    ? colors.semantic.danger
                    : pharmacy.is_open === null
                      ? colors.navy.muted
                      : colors.semantic.success,
              }}
            >
              {openLabel}
            </Text>
          </View>
        </View>

        <View className="mt-1 flex-row items-center">
          <MapPin size={11} color={colors.navy.muted} />
          <Text className="ml-1 flex-1 text-[11px] text-navy-secondary" numberOfLines={1}>
            {t('pharmacy.distanceKm', { km: pharmacy.distance_km })}
            {pharmacy.city ? `  ·  ${pharmacy.city}` : ''}
          </Text>
        </View>

        {hoursLine ? (
          <View className="mt-0.5 flex-row items-center">
            <Clock size={11} color={colors.navy.muted} />
            <Text className="ml-1 text-[11px] text-navy-secondary" numberOfLines={1}>
              {hoursLine}
            </Text>
          </View>
        ) : null}

        <View className="mt-2 flex-row items-center justify-between">
          <Text className="flex-1 pr-2 text-[10px] text-navy-muted" numberOfLines={1}>
            {[pharmacy.address, pharmacy.region].filter(Boolean).join(', ')}
          </Text>
          <View className="flex-row items-center">
            <Text className="text-[11px] font-bold text-brand-600">
              {t('pharmacy.viewPharmacy')}
            </Text>
            <ChevronRight size={12} color={colors.brand[600]} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function ReservationRow({
  reservation,
  language,
  cancelling,
  onCancel,
  onOpenMedicine,
}: {
  reservation: MedicineReservation;
  language: string;
  cancelling: boolean;
  onCancel: () => void;
  onOpenMedicine: (() => void) | null;
}) {
  const { t } = useTranslation();
  const expiry = formatDateTime(reservation.expires_at, language);

  return (
    <View className="rounded-xl border border-cream-300 bg-white p-3">
      <View className="flex-row items-start">
        <View className="flex-1 pr-2">
          <Text className="text-xs font-bold text-navy-text" numberOfLines={1}>
            {reservation.medicine?.name ?? t('pharmacy.selectedMedicine')}
          </Text>
          <Text className="mt-0.5 text-[11px] text-navy-secondary" numberOfLines={1}>
            {reservation.pharmacy?.name ?? ''}
          </Text>
        </View>
        <View className="rounded-lg bg-cream-200 px-2 py-1">
          <Text className="text-[10px] font-bold text-navy-secondary">
            {t('pharmacy.reservationRef', { reference: reservation.reference })}
          </Text>
        </View>
      </View>

      <View className="mt-2 flex-row items-center">
        <Text className="text-[10px] text-navy-muted">
          {t('pharmacy.reservationQuantity', { count: reservation.quantity })}
          {reservation.total_price !== null ? `  ·  ${formatXaf(reservation.total_price)}` : ''}
        </Text>
      </View>

      <View className="mt-2 flex-row items-center justify-between border-t border-cream-200 pt-2">
        <Text className="flex-1 pr-2 text-[10px] text-navy-muted" numberOfLines={1}>
          {expiry ? t('pharmacy.reservationExpires', { when: expiry }) : reservation.status_label}
        </Text>

        <View className="flex-row items-center">
          {onOpenMedicine ? (
            <Pressable onPress={onOpenMedicine} hitSlop={6} className="mr-3">
              <Text className="text-[11px] font-bold text-brand-600">
                {t('pharmacy.viewDetails')}
              </Text>
            </Pressable>
          ) : null}

          {reservation.is_cancellable ? (
            <Pressable
              onPress={onCancel}
              disabled={cancelling}
              hitSlop={6}
              accessibilityRole="button"
              className="rounded-lg px-2 py-1"
              style={{ backgroundColor: colors.semantic.dangerSurface, opacity: cancelling ? 0.6 : 1 }}
            >
              {cancelling ? (
                <ActivityIndicator size="small" color={colors.semantic.danger} />
              ) : (
                <Text className="text-[10px] font-bold" style={{ color: colors.semantic.danger }}>
                  {t('pharmacy.reservationCancel')}
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
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
      accessibilityState={{ selected: !!active }}
      className={`h-10 flex-row items-center rounded-xl border px-3 ${
        active ? 'border-brand-500 bg-brand-50' : 'border-cream-300 bg-white'
      }`}
    >
      <Icon size={14} color={active ? colors.brand[600] : colors.navy.secondary} />
      <Text
        className={`ml-1.5 text-xs font-semibold ${active ? 'text-brand-700' : 'text-navy-text'}`}
        numberOfLines={1}
      >
        {label}
      </Text>
      {caret ? <ChevronDown size={13} color={colors.navy.muted} style={{ marginLeft: 4 }} /> : null}
    </Pressable>
  );
}

function CategoryChip({
  icon: Icon,
  label,
  count,
  selected,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  count?: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`items-center justify-start rounded-2xl border px-2 py-3 ${
        selected ? 'border-brand-500 bg-brand-50' : 'border-cream-300 bg-white'
      }`}
      style={{ width: 86 }}
    >
      <View
        className="h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: selected ? colors.white : colors.cream[100] }}
      >
        <Icon size={18} color={selected ? colors.brand[600] : colors.navy.secondary} />
      </View>
      <Text
        className={`mt-1.5 text-center text-[10px] font-semibold ${
          selected ? 'text-brand-700' : 'text-navy-secondary'
        }`}
        numberOfLines={2}
      >
        {label}
      </Text>
      {count !== undefined ? (
        <Text className="mt-0.5 text-[9px] text-navy-muted">{count}</Text>
      ) : null}
    </Pressable>
  );
}

function OptionPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      className="mt-3 overflow-hidden rounded-2xl border border-cream-300 bg-white"
      style={CARD_SHADOW}
    >
      <Text className="px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-navy-muted">
        {title}
      </Text>
      {children}
    </View>
  );
}

function OptionRow({
  label,
  selected,
  last,
  onPress,
}: {
  label: string;
  selected: boolean;
  last?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-row items-center justify-between px-4 py-3 ${
        last ? '' : 'border-b border-cream-200'
      }`}
    >
      <Text className={`text-sm ${selected ? 'font-bold text-brand-700' : 'text-navy-text'}`}>
        {label}
      </Text>
      {selected ? <View className="h-2 w-2 rounded-full bg-brand-500" /> : null}
    </Pressable>
  );
}

/** Content-shaped placeholder so the first paint is not an empty page. */
function SkeletonCard() {
  return (
    <View className="rounded-2xl border border-cream-300 bg-white p-4">
      <View className="flex-row">
        <View className="h-14 w-14 rounded-2xl bg-cream-200" />
        <View className="ml-3 flex-1 justify-center">
          <View className="h-3 w-2/3 rounded-full bg-cream-200" />
          <View className="mt-2 h-2.5 w-1/2 rounded-full bg-cream-200" />
        </View>
      </View>
      <View className="mt-3 h-2.5 w-1/3 rounded-full bg-cream-200" />
    </View>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  actionLabel?: string | null;
  onAction?: (() => void) | null;
}) {
  return (
    <View className="mt-4 items-center rounded-2xl border border-cream-300 bg-white px-6 py-8">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-cream-200">
        <Icon size={20} color={colors.navy.muted} />
      </View>
      <Text className="mt-3 text-center text-sm font-bold text-navy-text">{title}</Text>
      {body ? (
        <Text className="mt-1 text-center text-xs leading-4 text-navy-secondary">{body}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          className="mt-4 rounded-xl border border-brand-500 px-4 py-2"
          accessibilityRole="button"
        >
          <Text className="text-xs font-bold text-brand-600">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
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
      <View
        className="h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.semantic.dangerSurface }}
      >
        <CircleAlert size={20} color={colors.semantic.danger} />
      </View>
      <Text className="mt-3 text-center text-sm text-navy-secondary">{message}</Text>
      <Pressable
        onPress={onRetry}
        className="mt-4 rounded-xl border border-brand-500 px-4 py-2"
        accessibilityRole="button"
      >
        <Text className="text-xs font-bold text-brand-600">{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

function formatDateTime(value: string | null | undefined, language: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language?.startsWith('fr') ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
