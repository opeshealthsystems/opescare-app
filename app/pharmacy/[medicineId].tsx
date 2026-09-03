import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Baby,
  BadgeCheck,
  Bug,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleDot,
  Clock,
  Crosshair,
  Droplet,
  FileText,
  FlaskConical,
  HeartPulse,
  Info,
  MapPin,
  Minus,
  Package,
  Pill,
  Plus,
  ShieldPlus,
  ShoppingCart,
  Sparkles,
  Store,
  Ticket,
  Wind,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { colors } from '../../theme/tokens';
import {
  useCancelMedicineReservation,
  useMedicine,
  useMedicineReservations,
  useNearbyPharmacies,
  usePrescriptionsForReservation,
  useReserveMedicine,
  type MedicineReservation,
  type NearbyPharmacy,
  type StockStatusValue,
} from '../../lib/api/queries';
import { formatXaf, formatXafBare, reserveErrorCode } from '../../lib/api/pharmacyQueries';

/**
 * Selected Medicine — the drill-in from the Medicine Finder.
 *
 * Reference: the right-hand "Selected Medicine" column of
 * `Mobile app screens/a_clean_mobile_app_ui_screenshot_of_a_medicine_fi.png`
 * — medicine summary, About, pack-size options, price at the chosen pharmacy,
 * Reserve / Get Directions / Call Pharmacy, and the "Have a prescription?"
 * block. On a phone that column is a full screen, with the reference's
 * left-hand pharmacy list folded in as the stocking-pharmacy picker so the
 * price and the Reserve button always refer to a pharmacy you actually chose.
 *
 * The search origin (lat/lng/radius) travels in the route params so this screen
 * asks GET /mobile/pharmacy/nearby the same question the list screen did —
 * note that endpoint takes `lat`/`lng`, while the catalog endpoint takes none.
 *
 * Reserving places a hold only. No payment is taken here and none is implied:
 * the patient pays at the counter (Mobile Money capture is a later step).
 */

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

/** MedicineReservationService::MAX_QUANTITY — the server clamps to this too. */
const MAX_QUANTITY = 10;

/** Widening steps, capped at MedicineFinderService::MAX_RADIUS_KM (50). */
const RADIUS_LADDER = [5, 10, 25, 50];

/** Route params are strings and may be absent or junk — never trust `Number()`. */
function numberParam(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const CARD_SHADOW = {
  shadowColor: colors.navy.text,
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

export default function MedicineDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    medicineId?: string;
    pharmacyId?: string;
    lat?: string;
    lng?: string;
    radiusKm?: string;
  }>();

  const medicineId = params.medicineId;
  // Douala is the fallback origin — it is where the reported pharmacy stock
  // lives, so a deep link without coordinates still lands on real data.
  // Route params are strings from an arbitrary URL: `Number('')` is 0, which
  // would silently mean "the Gulf of Guinea", so parse defensively.
  const lat = numberParam(params.lat, 4.0511);
  const lng = numberParam(params.lng, 9.7679);

  // The radius arrives from the finder but stays adjustable here: stock is
  // sparse, so "nothing within 10 km" must offer a wider search rather than
  // dead-ending, and it must say which radius it actually searched.
  const [radiusKm, setRadiusKm] = useState(() => numberParam(params.radiusKm, 10));
  const nextRadiusKm = RADIUS_LADDER.find((km) => km > radiusKm) ?? null;

  const [pharmacyId, setPharmacyId] = useState<string | null>(params.pharmacyId ?? null);
  const [packSize, setPackSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [prescriptionId, setPrescriptionId] = useState<string | null>(null);
  const [prescriptionListOpen, setPrescriptionListOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<MedicineReservation | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState(false);

  const medicine = useMedicine(medicineId);
  const pharmacies = useNearbyPharmacies({
    lat,
    lng,
    radiusKm,
    medicineId: medicineId ?? null,
    enabled: !!medicineId,
  });
  const reserve = useReserveMedicine();
  const cancelReservation = useCancelMedicineReservation();

  const needsPrescription = medicine.data?.prescription_required ?? false;
  const prescriptions = usePrescriptionsForReservation(needsPrescription);

  // Holds the patient already has on THIS medicine — the reservation list
  // endpoint had no caller before, so an existing hold was invisible and the
  // patient's next reserve attempt just failed with RESERVATION_ALREADY_OPEN.
  const reservations = useMedicineReservations('open');
  const existingHolds = useMemo(
    () => (reservations.data ?? []).filter((r) => r.medicine?.id === medicineId),
    [reservations.data, medicineId],
  );

  // GET /mobile/pharmacy/nearby returns every pharmacy in the radius, and most
  // carry no stock row for this medicine at all (verified against the live API:
  // 25 rows in a 25 km radius around Douala, 3 of them with stock). Listing the
  // other 22 as "Stock Unknown" under a heading that says "Pharmacies stocking
  // this" would be noise and a small lie, so only rows the pharmacy has
  // actually reported on are shown — including out-of-stock ones, which are
  // real information. The directory of everything nearby lives on /pharmacy.
  const pharmacyRows = useMemo(
    () => (pharmacies.data ?? []).filter((p) => p.stock !== null),
    [pharmacies.data],
  );
  const pharmacy = useMemo(() => {
    if (pharmacyId) {
      const chosen = pharmacyRows.find((p) => p.id === pharmacyId);
      if (chosen) return chosen;
    }
    // Default to somewhere the hold can actually be placed, not merely the first row.
    return pharmacyRows.find((p) => p.stock?.reservation_enabled) ?? pharmacyRows[0] ?? null;
  }, [pharmacyRows, pharmacyId]);

  // Default the pack size to whatever the chosen pharmacy actually prices.
  useEffect(() => {
    if (packSize) return;
    const fallback = pharmacy?.stock?.pack_size ?? medicine.data?.default_pack_size ?? null;
    if (fallback) setPackSize(fallback);
  }, [pharmacy, medicine.data, packSize]);

  const unitPrice = pharmacy?.stock?.unit_price ?? null;
  const totalPrice = unitPrice === null ? null : unitPrice * quantity;
  const reservationEnabled = !!pharmacy?.stock?.reservation_enabled;
  const heldHere = !!pharmacy && existingHolds.some((r) => r.pharmacy?.id === pharmacy.id);
  const canReserve =
    reservationEnabled && !heldHere && (!needsPrescription || !!prescriptionId) && !confirmed;

  const onReserve = () => {
    if (!pharmacy || !medicineId) return;
    setErrorCode(null);
    reserve.mutate(
      {
        medicine_id: medicineId,
        care_facility_id: pharmacy.id,
        quantity,
        pack_size: packSize,
        prescription_id: prescriptionId,
      },
      {
        onSuccess: (reservation) => setConfirmed(reservation),
        onError: (error) => setErrorCode(reserveErrorCode(error)),
      },
    );
  };

  if (!medicineId) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <CircleAlert size={22} color={colors.semantic.danger} />
          <Text className="mt-2 text-sm text-navy-secondary">{t('pharmacy.loadFailed')}</Text>
          <Pressable
            onPress={() => router.replace('/pharmacy')}
            className="mt-4 rounded-xl border border-brand-500 px-4 py-2"
            accessibilityRole="button"
          >
            <Text className="text-xs font-bold text-brand-600">{t('pharmacy.back')}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const CategoryIcon = CATEGORY_ICONS[medicine.data?.category_icon ?? 'pill'] ?? Pill;
  const min = medicine.data?.availability.price_min ?? null;
  const max = medicine.data?.availability.price_max ?? null;
  const priceRangeLabel =
    min !== null && max !== null && min !== max
      ? t('pharmacy.priceRangeValue', { min: formatXafBare(min), max: formatXaf(max) })
      : (formatXaf(min ?? max) ?? t('pharmacy.priceUnavailable'));

  return (
    <Screen className="px-0">
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="mt-2 flex-row items-center">
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/pharmacy'))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('pharmacy.back')}
            className="h-10 w-10 items-center justify-center rounded-xl border border-cream-300 bg-white"
          >
            <ChevronLeft size={20} color={colors.navy.text} />
          </Pressable>
          <Text className="ml-3 flex-1 text-base font-extrabold text-navy-text">
            {t('pharmacy.selectedMedicine')}
          </Text>
        </View>

        {medicine.isPending ? (
          <View className="mt-20 items-center">
            <ActivityIndicator color={colors.brand[500]} />
          </View>
        ) : medicine.isError || !medicine.data ? (
          <View className="mt-10 items-center rounded-2xl border border-cream-300 bg-white px-6 py-8">
            <View
              className="h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.semantic.dangerSurface }}
            >
              <CircleAlert size={20} color={colors.semantic.danger} />
            </View>
            <Text className="mt-3 text-center text-sm text-navy-secondary">
              {t('pharmacy.loadFailed')}
            </Text>
            <Pressable
              onPress={() => medicine.refetch()}
              className="mt-4 rounded-xl border border-brand-500 px-4 py-2"
              accessibilityRole="button"
            >
              <Text className="text-xs font-bold text-brand-600">{t('pharmacy.retry')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Medicine hero */}
            <LinearGradient
              colors={[colors.brand[600], colors.brand[500], colors.brand[300]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 24, marginTop: 18, padding: 20 }}
            >
              <View className="flex-row">
                <View className="h-16 w-16 items-center justify-center rounded-2xl bg-white/20">
                  <CategoryIcon size={28} color={colors.white} />
                </View>
                <View className="ml-4 flex-1">
                  <Text className="text-lg font-extrabold text-white">{medicine.data.name}</Text>
                  <Text className="mt-1 text-xs text-white/85">
                    {t('pharmacy.generic', { name: medicine.data.generic_name })}
                  </Text>
                  {medicine.data.strength || medicine.data.form ? (
                    <Text className="mt-0.5 text-xs text-white/75">
                      {medicine.data.strength && medicine.data.form
                        ? t('pharmacy.strengthForm', {
                            strength: medicine.data.strength,
                            form: medicine.data.form,
                          })
                        : (medicine.data.strength ?? medicine.data.form)}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View className="mt-4 flex-row flex-wrap" style={{ gap: 6 }}>
                <HeroBadge
                  label={
                    medicine.data.prescription_required
                      ? t('pharmacy.prescriptionRequired')
                      : t('pharmacy.prescriptionNotRequired')
                  }
                />
                {medicine.data.is_controlled ? (
                  <HeroBadge label={t('pharmacy.controlled')} />
                ) : null}
                <HeroBadge label={t(`pharmacy.categories.${medicine.data.category}`, {
                  defaultValue: medicine.data.category_label,
                })} />
              </View>

              <View className="mt-4 flex-row items-end justify-between border-t border-white/25 pt-4">
                <View className="flex-1 pr-3">
                  <Text className="text-[10px] font-medium text-white/80">
                    {t('pharmacy.priceRange')}
                  </Text>
                  <Text className="mt-0.5 text-xl font-extrabold text-white">
                    {priceRangeLabel}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-[10px] font-medium text-white/80">
                    {medicine.data.availability.is_available
                      ? t('pharmacy.available')
                      : t('pharmacy.unavailable')}
                  </Text>
                  <Text className="mt-0.5 text-xs font-bold text-white" numberOfLines={1}>
                    {medicine.data.availability.is_available
                      ? t('pharmacy.pharmacyCount', {
                          count: medicine.data.availability.pharmacy_count,
                        })
                      : t('pharmacy.availabilityNone')}
                  </Text>
                </View>
              </View>
            </LinearGradient>

            {/* Existing holds on this medicine */}
            {existingHolds.length > 0 ? (
              <View className="mt-4 rounded-2xl border border-brand-100 bg-brand-50 p-4">
                <View className="flex-row items-center">
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-white">
                    <Ticket size={16} color={colors.brand[600]} />
                  </View>
                  <Text className="ml-3 flex-1 text-sm font-bold text-navy-text">
                    {t('pharmacy.reservationsTitle')}
                  </Text>
                </View>

                <View className="mt-3" style={{ gap: 8 }}>
                  {existingHolds.map((hold) => (
                    <View key={hold.id} className="rounded-xl border border-cream-300 bg-white p-3">
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1 pr-2">
                          <Text className="text-xs font-bold text-navy-text" numberOfLines={1}>
                            {hold.pharmacy?.name ?? t('pharmacy.selectedMedicine')}
                          </Text>
                          <Text className="mt-0.5 text-[10px] text-navy-secondary">
                            {t('pharmacy.reservationQuantity', { count: hold.quantity })}
                            {hold.total_price !== null
                              ? `  ·  ${formatXaf(hold.total_price)}`
                              : ''}
                          </Text>
                        </View>
                        <View className="rounded-lg bg-cream-200 px-2 py-1">
                          <Text className="text-[10px] font-bold text-navy-secondary">
                            {t('pharmacy.reservationRef', { reference: hold.reference })}
                          </Text>
                        </View>
                      </View>

                      <View className="mt-2 flex-row items-center justify-between border-t border-cream-200 pt-2">
                        <Text className="flex-1 pr-2 text-[10px] text-navy-muted" numberOfLines={1}>
                          {formatDateTime(hold.expires_at, i18n.language)
                            ? t('pharmacy.reservationExpires', {
                                when: formatDateTime(hold.expires_at, i18n.language),
                              })
                            : hold.status_label}
                        </Text>
                        {hold.is_cancellable ? (
                          <Pressable
                            onPress={() => {
                              setCancelError(false);
                              cancelReservation.mutate(
                                { id: hold.id },
                                { onError: () => setCancelError(true) },
                              );
                            }}
                            disabled={cancelReservation.isPending}
                            hitSlop={6}
                            accessibilityRole="button"
                            className="rounded-lg px-2 py-1"
                            style={{
                              backgroundColor: colors.semantic.dangerSurface,
                              opacity:
                                cancelReservation.isPending &&
                                cancelReservation.variables?.id === hold.id
                                  ? 0.6
                                  : 1,
                            }}
                          >
                            <Text
                              className="text-[10px] font-bold"
                              style={{ color: colors.semantic.danger }}
                            >
                              {t('pharmacy.reservationCancel')}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>

                {cancelError ? (
                  <Text className="mt-2 text-[11px]" style={{ color: colors.semantic.danger }}>
                    {t('pharmacy.reservationCancelFailed')}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* About */}
            <SectionTitle>{t('pharmacy.aboutMedicine')}</SectionTitle>
            <View className="mt-2 rounded-2xl border border-cream-300 bg-white p-4">
              <Text className="text-sm leading-5 text-navy-secondary">
                {medicine.data.description ?? t('pharmacy.noDescription')}
              </Text>
              {medicine.data.indications.length > 0 ? (
                <View className="mt-3 flex-row flex-wrap" style={{ gap: 6 }}>
                  {medicine.data.indications.map((tag) => (
                    <View key={tag} className="rounded-lg bg-cream-200 px-2 py-1">
                      <Text className="text-[11px] font-medium text-navy-secondary">{tag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {/* Pack size */}
            {medicine.data.pack_size_options.length > 0 ? (
              <>
                <SectionTitle>{t('pharmacy.packSizeOptions')}</SectionTitle>
                <View className="mt-2 flex-row flex-wrap" style={{ gap: 8 }}>
                  {medicine.data.pack_size_options.map((option) => {
                    const active = option === packSize;
                    return (
                      <Pressable
                        key={option}
                        onPress={() => setPackSize(option)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        className={`rounded-xl border px-3 py-2.5 ${
                          active ? 'border-brand-500 bg-brand-50' : 'border-cream-300 bg-white'
                        }`}
                      >
                        <Text
                          className={`text-xs font-semibold ${
                            active ? 'text-brand-700' : 'text-navy-secondary'
                          }`}
                        >
                          {option}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {/* Quantity */}
            <SectionTitle>{t('pharmacy.quantity')}</SectionTitle>
            <View className="mt-2 flex-row items-center justify-between rounded-2xl border border-cream-300 bg-white px-4 py-3">
              <View className="flex-1 pr-3">
                <Text className="text-[11px] text-navy-secondary">
                  {t('pharmacy.quantityHint', { max: MAX_QUANTITY })}
                </Text>
              </View>
              <View className="flex-row items-center">
                <Pressable
                  onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="h-9 w-9 items-center justify-center rounded-xl border border-cream-300 bg-cream-100"
                  style={{ opacity: quantity <= 1 ? 0.4 : 1 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('pharmacy.quantity')}
                >
                  <Minus size={15} color={colors.navy.text} />
                </Pressable>
                <Text className="mx-4 text-base font-extrabold text-navy-text">{quantity}</Text>
                <Pressable
                  onPress={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                  disabled={quantity >= MAX_QUANTITY}
                  className="h-9 w-9 items-center justify-center rounded-xl border border-cream-300 bg-cream-100"
                  style={{ opacity: quantity >= MAX_QUANTITY ? 0.4 : 1 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('pharmacy.quantity')}
                >
                  <Plus size={15} color={colors.navy.text} />
                </Pressable>
              </View>
            </View>

            {/* Stocking pharmacies */}
            <View className="mt-6 flex-row items-center justify-between">
              <Text className="flex-1 pr-3 text-base font-bold text-navy-text">
                {t('pharmacy.pharmaciesStocking')}
              </Text>
              {nextRadiusKm ? (
                <Pressable
                  onPress={() => {
                    setRadiusKm(nextRadiusKm);
                    setPharmacyId(null);
                  }}
                  className="flex-row items-center rounded-xl border border-cream-300 bg-white px-3 py-1.5"
                  accessibilityRole="button"
                  accessibilityLabel={t('pharmacy.radiusPickerTitle')}
                >
                  <Crosshair size={12} color={colors.brand[600]} />
                  <Text className="ml-1.5 text-[10px] font-bold text-navy-secondary">
                    {t('pharmacy.radius', { km: radiusKm })}
                  </Text>
                </Pressable>
              ) : (
                <View className="rounded-xl border border-cream-300 bg-white px-3 py-1.5">
                  <Text className="text-[10px] font-bold text-navy-secondary">
                    {t('pharmacy.radius', { km: radiusKm })}
                  </Text>
                </View>
              )}
            </View>
            <Text className="mt-0.5 text-[11px] text-navy-secondary">
              {t('pharmacy.pharmaciesStockingHint')}
            </Text>

            {pharmacies.isPending ? (
              <View className="mt-4 items-center">
                <ActivityIndicator color={colors.brand[500]} />
                <Text className="mt-2 text-[11px] text-navy-muted">
                  {t('pharmacy.loadingPharmacies')}
                </Text>
              </View>
            ) : pharmacies.isError ? (
              <View className="mt-3 items-center rounded-2xl border border-cream-300 bg-white px-6 py-6">
                <CircleAlert size={20} color={colors.semantic.danger} />
                <Text className="mt-2 text-center text-xs text-navy-secondary">
                  {t('pharmacy.loadFailed')}
                </Text>
                <Pressable
                  onPress={() => pharmacies.refetch()}
                  className="mt-3 rounded-xl border border-brand-500 px-4 py-2"
                  accessibilityRole="button"
                >
                  <Text className="text-xs font-bold text-brand-600">{t('pharmacy.retry')}</Text>
                </Pressable>
              </View>
            ) : pharmacyRows.length === 0 ? (
              <View className="mt-3 items-center rounded-2xl border border-cream-300 bg-white px-6 py-8">
                <View className="h-12 w-12 items-center justify-center rounded-full bg-cream-200">
                  <Store size={20} color={colors.navy.muted} />
                </View>
                {/* No pharmacy inside the radius has reported this medicine —
                    not the same as "no pharmacies exist here", so say the
                    stock thing first and offer a wider search. */}
                <Text className="mt-3 text-center text-sm font-bold text-navy-text">
                  {t('pharmacy.availabilityNone')}
                </Text>
                <Text className="mt-1 text-center text-xs leading-4 text-navy-secondary">
                  {t('pharmacy.noPharmacies', { km: radiusKm })}
                </Text>
                {nextRadiusKm ? (
                  <Pressable
                    onPress={() => {
                      setRadiusKm(nextRadiusKm);
                      setPharmacyId(null);
                    }}
                    className="mt-4 rounded-xl border border-brand-500 px-4 py-2"
                    accessibilityRole="button"
                  >
                    <Text className="text-xs font-bold text-brand-600">
                      {`${t('pharmacy.radiusPickerTitle')}: ${t('pharmacy.radius', { km: nextRadiusKm })}`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View className="mt-3" style={{ gap: 10 }}>
                {pharmacyRows.map((row) => (
                  <PharmacyOption
                    key={row.id}
                    pharmacy={row}
                    selected={pharmacy?.id === row.id}
                    onPress={() => {
                      setPharmacyId(row.id);
                      setConfirmed(null);
                      setErrorCode(null);
                    }}
                    onOpenFacility={() =>
                      router.push({ pathname: '/facility/[id]', params: { id: row.id } })
                    }
                  />
                ))}
              </View>
            )}

            {/* Price summary */}
            <View
              className="mt-6 rounded-2xl border border-cream-300 bg-white p-4"
              style={CARD_SHADOW}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-[11px] text-navy-secondary">{t('pharmacy.unitPrice')}</Text>
                <Text className="text-xs font-semibold text-navy-text">
                  {formatXaf(unitPrice) ?? t('pharmacy.priceUnavailable')}
                </Text>
              </View>
              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-[11px] text-navy-secondary">{t('pharmacy.quantity')}</Text>
                <Text className="text-xs font-semibold text-navy-text">
                  {t('pharmacy.reservationQuantity', { count: quantity })}
                </Text>
              </View>

              <View className="mt-3 border-t border-cream-200 pt-3">
                <Text className="text-[11px] text-navy-muted">{t('pharmacy.totalPrice')}</Text>
                <Text className="mt-1 text-2xl font-extrabold text-brand-600">
                  {formatXaf(totalPrice) ?? t('pharmacy.priceUnavailable')}
                </Text>
                <Text className="mt-1 text-xs text-navy-secondary" numberOfLines={1}>
                  {pharmacy?.name ?? t('pharmacy.noPharmacySelected')}
                </Text>
              </View>

              <View className="mt-3 flex-row items-start rounded-xl bg-cream-100 p-3">
                <Info size={13} color={colors.navy.muted} style={{ marginTop: 1 }} />
                <Text className="ml-2 flex-1 text-[11px] leading-4 text-navy-secondary">
                  {t('pharmacy.paymentNote')}
                </Text>
              </View>
            </View>

            {/* Prescription — this is business logic, not an error */}
            {needsPrescription ? (
              <View className="mt-4 rounded-2xl border border-brand-100 bg-brand-50 p-4">
                <View className="flex-row items-start">
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-white">
                    <FileText size={16} color={colors.brand[600]} />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-sm font-bold text-navy-text">
                      {t('pharmacy.prescriptionExplainerTitle')}
                    </Text>
                    <Text className="mt-1 text-xs leading-4 text-navy-secondary">
                      {t('pharmacy.prescriptionExplainerBody')}
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={() => setPrescriptionListOpen((open) => !open)}
                  className="mt-3 h-11 flex-row items-center justify-center rounded-xl border border-brand-500 bg-white px-3"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: prescriptionListOpen }}
                >
                  {prescriptionId ? (
                    <Check size={15} color={colors.brand[600]} />
                  ) : (
                    <FileText size={15} color={colors.brand[600]} />
                  )}
                  <Text className="ml-2 text-xs font-bold text-brand-600">
                    {prescriptionId
                      ? t('pharmacy.prescriptionAttached')
                      : t('pharmacy.attachPrescription')}
                  </Text>
                </Pressable>

                {prescriptionListOpen ? (
                  prescriptions.isPending ? (
                    <View className="mt-3 items-center">
                      <ActivityIndicator color={colors.brand[500]} />
                    </View>
                  ) : (prescriptions.data ?? []).length === 0 ? (
                    <View className="mt-3 items-center rounded-xl border border-cream-300 bg-white px-4 py-5">
                      <Text className="text-center text-xs text-navy-secondary">
                        {t('pharmacy.noPrescriptions')}
                      </Text>
                      <Pressable
                        onPress={() => router.push('/prescriptions')}
                        className="mt-3 rounded-xl border border-brand-500 px-4 py-2"
                        accessibilityRole="button"
                      >
                        <Text className="text-xs font-bold text-brand-600">
                          {t('pharmacy.openPrescriptions')}
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View className="mt-3 overflow-hidden rounded-xl border border-cream-300 bg-white">
                      {(prescriptions.data ?? []).map((rx, index, all) => {
                        const active = rx.id === prescriptionId;
                        return (
                          <Pressable
                            key={rx.id}
                            onPress={() => {
                              setPrescriptionId(active ? null : rx.id);
                              setPrescriptionListOpen(false);
                              setErrorCode(null);
                            }}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            className={`flex-row items-center justify-between px-3 py-3 ${
                              index === all.length - 1 ? '' : 'border-b border-cream-200'
                            }`}
                          >
                            <View className="flex-1 pr-2">
                              {/* facility_name is nullable on the prescriptions
                                  payload; when it is absent the item count
                                  becomes the headline rather than a placeholder. */}
                              <Text
                                className="text-xs font-semibold text-navy-text"
                                numberOfLines={1}
                              >
                                {rx.facility_name ??
                                  t('pharmacy.prescriptionItems', { count: rx.item_count })}
                              </Text>
                              <Text className="mt-0.5 text-[11px] text-navy-secondary">
                                {rx.facility_name
                                  ? t('pharmacy.prescriptionItems', { count: rx.item_count })
                                  : ''}
                                {rx.prescribed_at
                                  ? `${rx.facility_name ? '  ·  ' : ''}${formatDate(rx.prescribed_at, i18n.language)}`
                                  : ''}
                              </Text>
                            </View>
                            {active ? <Check size={16} color={colors.brand[600]} /> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  )
                ) : null}
              </View>
            ) : null}

            {/* Outcome banners */}
            {confirmed ? (
              <View
                className="mt-4 flex-row rounded-2xl p-4"
                style={{ backgroundColor: colors.semantic.successSurface }}
              >
                <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-white">
                  <BadgeCheck size={16} color={colors.semantic.success} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-bold" style={{ color: colors.semantic.success }}>
                    {t('pharmacy.reserveSuccessTitle')}
                  </Text>
                  <Text className="mt-1 text-xs leading-4 text-navy-secondary">
                    {t('pharmacy.reserveSuccessBody', {
                      reference: confirmed.reference,
                      pharmacy: confirmed.pharmacy?.name ?? pharmacy?.name ?? '',
                    })}
                  </Text>
                </View>
              </View>
            ) : null}

            {errorCode ? (
              <View
                className="mt-4 flex-row rounded-2xl p-4"
                style={{
                  backgroundColor:
                    errorCode === 'PRESCRIPTION_REQUIRED'
                      ? colors.semantic.infoSurface
                      : colors.semantic.dangerSurface,
                }}
              >
                <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-white">
                  {errorCode === 'PRESCRIPTION_REQUIRED' ? (
                    <FileText size={16} color={colors.semantic.info} />
                  ) : (
                    <CircleAlert size={16} color={colors.semantic.danger} />
                  )}
                </View>
                <View className="flex-1">
                  <Text
                    className="text-xs font-bold"
                    style={{
                      color:
                        errorCode === 'PRESCRIPTION_REQUIRED'
                          ? colors.semantic.info
                          : colors.semantic.danger,
                    }}
                  >
                    {errorCode === 'PRESCRIPTION_REQUIRED'
                      ? t('pharmacy.prescriptionExplainerTitle')
                      : t('pharmacy.loadFailed')}
                  </Text>
                  <Text className="mt-1 text-xs leading-4 text-navy-secondary">
                    {t(`pharmacy.reserveError.${errorCode}`, {
                      defaultValue: t('pharmacy.reserveError.generic'),
                    })}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Actions */}
            <View className="mt-5" style={{ gap: 12 }}>
              <Button
                label={t('pharmacy.reserve')}
                onPress={onReserve}
                leftIcon={ShoppingCart}
                showChevron={false}
                loading={reserve.isPending}
                disabled={!canReserve}
              />

              {directionsUrl(pharmacy) ? (
                <Button
                  label={t('pharmacy.getDirections')}
                  variant="outline"
                  onPress={() => {
                    const url = directionsUrl(pharmacy);
                    if (url) Linking.openURL(url).catch(() => undefined);
                  }}
                />
              ) : null}

              {callablePhone(pharmacy) ? (
                <Button
                  label={t('pharmacy.callPharmacy')}
                  variant="outline"
                  onPress={() => {
                    const number = callablePhone(pharmacy);
                    if (number) Linking.openURL(`tel:${number}`).catch(() => undefined);
                  }}
                />
              ) : null}
            </View>

            {/* Why the CTA is disabled — never leave a dead button unexplained. */}
            {!canReserve && !confirmed ? (
              <Text className="mt-3 text-center text-[11px] leading-4 text-navy-muted">
                {!pharmacy
                  ? t('pharmacy.noPharmacySelected')
                  : heldHere
                    ? t('pharmacy.reservationHeldHere')
                    : !reservationEnabled
                      ? pharmacy.stock?.status === 'out_of_stock'
                        ? t('pharmacy.outOfStockNote')
                        : t('pharmacy.noReservationEnabled')
                      : t('pharmacy.reserveError.PRESCRIPTION_REQUIRED')}
              </Text>
            ) : null}
          </>
        )}

        <View className="h-10" />
      </ScrollView>
    </Screen>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text className="mt-6 text-base font-bold text-navy-text">{children}</Text>;
}

function HeroBadge({ label }: { label: string }) {
  return (
    <View className="rounded-lg bg-white/20 px-2 py-1">
      <Text className="text-[10px] font-bold text-white">{label}</Text>
    </View>
  );
}

function stockTone(status: StockStatusValue | undefined): { color: string; surface: string } {
  switch (status) {
    case 'in_stock':
      return { color: colors.semantic.success, surface: colors.semantic.successSurface };
    case 'low_stock':
      return { color: colors.semantic.warning, surface: colors.semantic.warningSurface };
    case 'out_of_stock':
      return { color: colors.semantic.danger, surface: colors.semantic.dangerSurface };
    default:
      return { color: colors.navy.muted, surface: colors.cream[200] };
  }
}

function PharmacyOption({
  pharmacy,
  selected,
  onPress,
  onOpenFacility,
}: {
  pharmacy: NearbyPharmacy;
  selected: boolean;
  onPress: () => void;
  onOpenFacility: () => void;
}) {
  const { t, i18n } = useTranslation();
  const price = formatXaf(pharmacy.stock?.unit_price);
  const tone = stockTone(pharmacy.stock?.status);
  const reportedAt = formatDate(pharmacy.stock?.last_reported_at, i18n.language) || null;

  const hoursLine = pharmacy.is_24_hours
    ? t('pharmacy.open24')
    : pharmacy.is_open && pharmacy.closes_at
      ? t('pharmacy.closesAt', { time: pharmacy.closes_at })
      : !pharmacy.is_open && pharmacy.opens_at
        ? t('pharmacy.opensAt', { time: pharmacy.opens_at })
        : pharmacy.is_open === null
          ? t('pharmacy.hoursUnknown')
          : pharmacy.is_open
            ? t('pharmacy.open')
            : t('pharmacy.closed');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`rounded-2xl border p-3 ${
        selected ? 'border-brand-500 bg-brand-50' : 'border-cream-300 bg-white'
      }`}
      style={selected ? undefined : CARD_SHADOW}
    >
      <View className="flex-row items-start">
        <View
          className="h-11 w-11 items-center justify-center rounded-xl"
          style={{ backgroundColor: selected ? colors.white : colors.brand[50] }}
        >
          <Store size={18} color={colors.brand[600]} />
        </View>

        <View className="ml-3 flex-1">
          <Text className="text-sm font-bold text-navy-text" numberOfLines={1}>
            {pharmacy.name}
          </Text>
          <View className="mt-1 flex-row items-center">
            <MapPin size={11} color={colors.navy.muted} />
            <Text className="ml-1 text-[11px] text-navy-secondary" numberOfLines={1}>
              {t('pharmacy.distanceKm', { km: pharmacy.distance_km })}
            </Text>
            <Clock size={11} color={colors.navy.muted} style={{ marginLeft: 10 }} />
            <Text className="ml-1 flex-1 text-[11px] text-navy-secondary" numberOfLines={1}>
              {hoursLine}
            </Text>
          </View>
        </View>

        <View
          className="h-5 w-5 items-center justify-center rounded-full border"
          style={{
            borderColor: selected ? colors.brand[500] : colors.cream[300],
            backgroundColor: selected ? colors.brand[500] : colors.white,
          }}
        >
          {selected ? <Check size={12} color={colors.white} /> : null}
        </View>
      </View>

      <View className="mt-2.5 flex-row items-center justify-between border-t border-cream-200 pt-2.5">
        <View className="flex-1 flex-row items-center">
          <View className="rounded-lg px-2 py-1" style={{ backgroundColor: tone.surface }}>
            <Text className="text-[10px] font-bold" style={{ color: tone.color }}>
              {pharmacy.stock
                ? t(`pharmacy.stock.${pharmacy.stock.status}`)
                : t('pharmacy.stock.unknown')}
            </Text>
          </View>
          {pharmacy.stock?.packs_available ? (
            <Text className="ml-2 text-[10px] text-navy-secondary" numberOfLines={1}>
              {t('pharmacy.packsLeft', { count: pharmacy.stock.packs_available })}
            </Text>
          ) : reportedAt ? (
            <Text className="ml-2 flex-1 text-[10px] text-navy-muted" numberOfLines={1}>
              {t('pharmacy.stockUpdated', { when: reportedAt })}
            </Text>
          ) : null}
        </View>

        <View className="flex-row items-center">
          {price ? (
            <Text className="mr-3 text-xs font-extrabold text-brand-700">{price}</Text>
          ) : null}
          <Pressable
            onPress={onOpenFacility}
            hitSlop={6}
            accessibilityRole="button"
            className="flex-row items-center"
          >
            <Text className="text-[11px] font-bold text-brand-600">
              {t('pharmacy.viewPharmacy')}
            </Text>
            <ChevronRight size={12} color={colors.brand[600]} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * The care_facilities directory stores a placeholder where a pharmacy has no
 * published number — the live rows literally hold the string "N/A", which
 * would otherwise become a `tel:N/A` link that does nothing but look broken.
 * Anything without at least four digits is treated as absent.
 */
function callablePhone(pharmacy: NearbyPharmacy | null): string | null {
  const raw = pharmacy?.phone?.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 4 ? raw : null;
}

/** Deep-link to the platform maps app — same shape as care-map / facility. */
function directionsUrl(pharmacy: NearbyPharmacy | null): string | null {
  if (!pharmacy) return null;
  const label = encodeURIComponent(pharmacy.name);

  if (pharmacy.latitude != null && pharmacy.longitude != null) {
    const lat = pharmacy.latitude;
    const lng = pharmacy.longitude;
    return (
      Platform.select({
        ios: `maps:0,0?q=${label}@${lat},${lng}`,
        android: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
        default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      }) ?? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    );
  }

  const address = [pharmacy.address, pharmacy.city, pharmacy.region].filter(Boolean).join(', ');
  return address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;
}

function localeTag(language: string): string {
  return language?.startsWith('fr') ? 'fr-FR' : 'en-US';
}

function formatDateTime(value: string | null | undefined, language: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(localeTag(language), {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatDate(value: string | null | undefined, language: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(localeTag(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
