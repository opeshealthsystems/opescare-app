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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Chip,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  formatDate,
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
import { CardOverline, FactCell, MedButton, TintCircle } from '@/components/meds/shared';
import { FacilityMap } from '@/components/map/FacilityMap';
import {
  useCancelMedicineReservation,
  useMedicine,
  useMedicineReservations,
  useNearbyPharmacies,
  usePrescriptionsForReservation,
  useReserveMedicine,
  type Medicine,
  type MedicineReservation,
  type NearbyPharmacy,
  type StockStatusValue,
} from '@/lib/api/queries';
import { formatXaf, formatXafBare, reserveErrorCode } from '@/lib/api/pharmacyQueries';

/**
 * Selected Medicine — the drill-in from the Medicine Finder.
 *
 * Presentation: the OPES kit, laid out after `UIUX/src/screens/meds/
 * MedicationDetailScreen.tsx` — identity card with `TintCircle` + `FactCell`s,
 * overlined detail cards, the stocking-pharmacy picker as `Card variant="flush"`
 * + `ListRow`s with stock `StatusBadge`s, the embedded in-app `FacilityMap`,
 * a `GradientButton` "Reserve" confirmed through the kit `Dialog`, and
 * `MedButton` secondary actions (call / view pharmacy). Colours come from
 * `useTheme()` — the app's own palette.
 *
 * Data layer is untouched: `useMedicine`, `useNearbyPharmacies`,
 * `useReserveMedicine`, `useCancelMedicineReservation`,
 * `useMedicineReservations`, `usePrescriptionsForReservation`.
 *
 * The search origin (lat/lng/radius) travels in the route params so this screen
 * asks GET /mobile/pharmacy/nearby the same question the list screen did —
 * note that endpoint takes `lat`/`lng`, while the catalog endpoint takes none.
 *
 * Reserving places a hold only. No payment is taken here and none is implied:
 * the patient pays at the counter (Mobile Money capture is a later step).
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

/**
 * The kit's `toneForStatus` does not know the pharmacy stock vocabulary
 * (`in_stock` / `low_stock` / `out_of_stock`), so the tone is mapped here and
 * passed explicitly to `StatusBadge`.
 */
function stockTone(status: StockStatusValue | undefined): StatusTone {
  switch (status) {
    case 'in_stock':
      return 'normal';
    case 'low_stock':
      return 'warning';
    case 'out_of_stock':
      return 'critical';
    default:
      return 'neutral';
  }
}

export default function MedicineDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
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
  const [refreshing, setRefreshing] = useState(false);

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

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/pharmacy'));

  const widenRadius = () => {
    if (!nextRadiusKm) return;
    setRadiusKm(nextRadiusKm);
    setPharmacyId(null);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([medicine.refetch(), pharmacies.refetch(), reservations.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [medicine, pharmacies, reservations]);

  /** Places the hold. Runs inside the kit Dialog's confirm action. */
  const placeReservation = async () => {
    if (!pharmacy || !medicineId) return;
    setErrorCode(null);
    try {
      const reservation = await reserve.mutateAsync({
        medicine_id: medicineId,
        care_facility_id: pharmacy.id,
        quantity,
        pack_size: packSize,
        prescription_id: prescriptionId,
      });
      setConfirmed(reservation);
      dialog.alert(
        t('pharmacy.reserveSuccessTitle'),
        t('pharmacy.reserveSuccessBody', {
          reference: reservation.reference,
          pharmacy: reservation.pharmacy?.name ?? pharmacy.name,
        }),
        'success',
      );
    } catch (error) {
      const code = reserveErrorCode(error);
      setErrorCode(code);
      const isRx = code === 'PRESCRIPTION_REQUIRED';
      dialog.alert(
        isRx ? t('pharmacy.prescriptionExplainerTitle') : t('pharmacy.loadFailed'),
        t(`pharmacy.reserveError.${code}`, { defaultValue: t('pharmacy.reserveError.generic') }),
        isRx ? 'info' : 'critical',
      );
    }
  };

  const confirmReserve = () => {
    if (!pharmacy || !medicine.data) return;
    dialog.confirm({
      title: t('pharmacy.reserve'),
      message: [
        medicine.data.name,
        pharmacy.name,
        [t('pharmacy.reservationQuantity', { count: quantity }), packSize].filter(Boolean).join(' · '),
        `${t('pharmacy.totalPrice')}: ${formatXaf(totalPrice) ?? t('pharmacy.priceUnavailable')}`,
        '',
        t('pharmacy.paymentNote'),
      ].join('\n'),
      confirmLabel: t('pharmacy.reserve'),
      tone: 'info',
      onConfirm: placeReservation,
    });
  };

  /** Cancelling a hold is destructive and unrecoverable — confirm first. */
  const confirmCancel = (hold: MedicineReservation) =>
    dialog.confirm({
      title: t('pharmacy.reservationCancel'),
      message: [hold.pharmacy?.name, t('pharmacy.reservationRef', { reference: hold.reference })]
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

  const callPharmacy = () => {
    const number = callablePhone(pharmacy);
    if (!number) return;
    Linking.openURL(`tel:${number.replace(/\s/g, '')}`).catch(() =>
      dialog.alert(
        t('opesMeds.pharmacy.callFailTitle'),
        t('opesMeds.pharmacy.callFailBody', { pharmacy: pharmacy?.name ?? '', phone: number }),
        'warning',
      ),
    );
  };

  if (!medicineId) {
    return (
      <SafeAreaView edges={['top']} style={styles.screen}>
        <ScreenHeader title={t('pharmacy.selectedMedicine')} onBack={goBack} />
        <View style={styles.content}>
          <Card variant="flush">
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('pharmacy.loadFailed')}
              actionLabel={t('pharmacy.back')}
              onAction={() => router.replace('/pharmacy')}
            />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  const disabledReason = !canReserve && !confirmed
    ? !pharmacy
      ? t('pharmacy.noPharmacySelected')
      : heldHere
        ? t('pharmacy.reservationHeldHere')
        : !reservationEnabled
          ? pharmacy.stock?.status === 'out_of_stock'
            ? t('pharmacy.outOfStockNote')
            : t('pharmacy.noReservationEnabled')
          : t('pharmacy.reserveError.PRESCRIPTION_REQUIRED')
    : null;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={t('pharmacy.selectedMedicine')}
        subtitle={t('opesMeds.detail.subtitle')}
        onBack={goBack}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />
        }
      >
        {medicine.isPending ? (
          <View style={styles.loading} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.blue} />
            <Text style={styles.loadingText}>{t('opesMeds.detail.loading')}</Text>
          </View>
        ) : medicine.isError || !medicine.data ? (
          <Card variant="flush">
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('pharmacy.loadFailed')}
              actionLabel={t('pharmacy.retry')}
              onAction={() => medicine.refetch()}
            />
          </Card>
        ) : (
          <>
            {/* -- Identity ------------------------------------------------- */}
            <IdentityCard medicine={medicine.data} />

            {/* -- Existing holds on this medicine -------------------------- */}
            {existingHolds.length > 0 ? (
              <Card>
                <CardOverline title={t('pharmacy.reservationsTitle')} />
                {existingHolds.map((hold, index) => {
                  const expiry = formatDateTime(hold.expires_at);
                  const busy =
                    cancelReservation.isPending && cancelReservation.variables?.id === hold.id;
                  return (
                    <ListRow
                      key={hold.id}
                      icon="receipt"
                      tint="amber"
                      title={hold.pharmacy?.name ?? t('pharmacy.selectedMedicine')}
                      meta={[
                        t('pharmacy.reservationRef', { reference: hold.reference }),
                        t('pharmacy.reservationQuantity', { count: hold.quantity }),
                        hold.total_price !== null ? formatXaf(hold.total_price) : null,
                        expiry ? t('pharmacy.reservationExpires', { when: expiry }) : hold.status_label,
                      ]}
                      trailing={
                        hold.is_cancellable ? (
                          <MedButton
                            label={t('pharmacy.reservationCancel')}
                            icon="close"
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onPress={() => confirmCancel(hold)}
                          />
                        ) : undefined
                      }
                      chevron={false}
                      divider={index < existingHolds.length - 1}
                      style={styles.flushRow}
                    />
                  );
                })}
              </Card>
            ) : null}

            {/* -- About ---------------------------------------------------- */}
            <Card>
              <CardOverline title={t('pharmacy.aboutMedicine')} />
              <Text style={styles.body}>
                {medicine.data.description ?? t('pharmacy.noDescription')}
              </Text>
              {medicine.data.indications.length > 0 ? (
                <View style={styles.chipWrap}>
                  {medicine.data.indications.map((tag) => (
                    <Chip key={tag} label={tag} />
                  ))}
                </View>
              ) : null}
            </Card>

            {/* -- Pack size ------------------------------------------------ */}
            {medicine.data.pack_size_options.length > 0 ? (
              <Card>
                <CardOverline title={t('pharmacy.packSizeOptions')} />
                <View style={styles.chipWrap}>
                  {medicine.data.pack_size_options.map((option) => (
                    <Chip
                      key={option}
                      label={option}
                      selected={option === packSize}
                      onPress={() => setPackSize(option)}
                    />
                  ))}
                </View>
              </Card>
            ) : null}

            {/* -- Quantity ------------------------------------------------- */}
            <Card>
              <CardOverline
                title={t('pharmacy.quantity')}
                right={
                  <View style={styles.stepper}>
                    <StepperButton
                      icon="minus"
                      disabled={quantity <= 1}
                      onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                      accessibilityLabel={`${t('pharmacy.quantity')} −`}
                    />
                    <Text style={styles.stepperValue} accessibilityLiveRegion="polite">
                      {quantity}
                    </Text>
                    <StepperButton
                      icon="plus"
                      disabled={quantity >= MAX_QUANTITY}
                      onPress={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                      accessibilityLabel={`${t('pharmacy.quantity')} +`}
                    />
                  </View>
                }
              />
              <Text style={styles.hint}>{t('pharmacy.quantityHint', { max: MAX_QUANTITY })}</Text>
            </Card>

            {/* -- Stocking pharmacies -------------------------------------- */}
            <View>
              <SectionHeader
                title={t('pharmacy.pharmaciesStocking')}
                actionLabel={t('pharmacy.radius', { km: radiusKm })}
                actionChevron={!!nextRadiusKm}
                onAction={nextRadiusKm ? widenRadius : undefined}
              />
              {/* The header action carries the radius while it can still be
                  widened; at the 50 km cap there is no action, so say it here. */}
              <Text style={styles.sectionHint}>
                {t('pharmacy.pharmaciesStockingHint')}
                {nextRadiusKm ? '' : `  ·  ${t('pharmacy.radius', { km: radiusKm })}`}
              </Text>

              {pharmacies.isPending ? (
                <View style={styles.loading} accessibilityLiveRegion="polite">
                  <ActivityIndicator color={colors.blue} />
                  <Text style={styles.loadingText}>{t('pharmacy.loadingPharmacies')}</Text>
                </View>
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
                // No pharmacy inside the radius has reported this medicine —
                // not the same as "no pharmacies exist here", so say the stock
                // thing first and offer a wider search.
                <Card variant="flush">
                  <EmptyState
                    icon="store"
                    tint="blue"
                    title={t('pharmacy.availabilityNone')}
                    message={t('pharmacy.noPharmacies', { km: radiusKm })}
                    actionLabel={
                      nextRadiusKm
                        ? `${t('pharmacy.radiusPickerTitle')}: ${t('pharmacy.radius', { km: nextRadiusKm })}`
                        : undefined
                    }
                    onAction={nextRadiusKm ? widenRadius : undefined}
                  />
                </Card>
              ) : (
                <Card variant="flush">
                  {pharmacyRows.map((row, index) => (
                    <PharmacyOptionRow
                      key={row.id}
                      pharmacy={row}
                      selected={pharmacy?.id === row.id}
                      divider={index < pharmacyRows.length - 1}
                      onPress={() => {
                        setPharmacyId(row.id);
                        setConfirmed(null);
                        setErrorCode(null);
                      }}
                    />
                  ))}
                </Card>
              )}
            </View>

            {/* -- Where it is: embedded, in-app map (no external maps app) -- */}
            {pharmacy && pharmacy.latitude != null && pharmacy.longitude != null ? (
              <Card variant="flush">
                <FacilityMap facilities={pharmacy} height={180} directions />
              </Card>
            ) : null}

            {/* -- Price summary -------------------------------------------- */}
            <Card>
              <CardOverline title={t('pharmacy.totalPrice')} />
              <SummaryLine
                label={t('pharmacy.unitPrice')}
                value={formatXaf(unitPrice) ?? t('pharmacy.priceUnavailable')}
              />
              <SummaryLine
                label={t('pharmacy.quantity')}
                value={t('pharmacy.reservationQuantity', { count: quantity })}
              />
              <SummaryLine
                label={t('pharmacy.selectedPharmacy')}
                value={pharmacy?.name ?? t('pharmacy.noPharmacySelected')}
              />
              <View style={styles.totalRow}>
                <Text style={styles.total}>
                  {formatXaf(totalPrice) ?? t('pharmacy.priceUnavailable')}
                </Text>
              </View>
              <View style={styles.infoStrip}>
                <Icon name="info" size={18} color={colors.blue} />
                <Text style={styles.infoText}>{t('pharmacy.paymentNote')}</Text>
              </View>
            </Card>

            {/* -- Prescription — business logic, not an error ---------------- */}
            {needsPrescription ? (
              <Card>
                <View style={styles.rxHead}>
                  <TintCircle icon="document-text" tint="blue" />
                  <View style={styles.rxBody}>
                    <Text style={styles.rxTitle}>{t('pharmacy.prescriptionExplainerTitle')}</Text>
                    <Text style={styles.body}>{t('pharmacy.prescriptionExplainerBody')}</Text>
                  </View>
                </View>

                <MedButton
                  label={
                    prescriptionId
                      ? t('pharmacy.prescriptionAttached')
                      : t('pharmacy.attachPrescription')
                  }
                  icon={prescriptionId ? 'check' : 'paperclip'}
                  iconRight={prescriptionListOpen ? 'chevron-up' : 'chevron-down'}
                  variant={prescriptionId ? 'ghost' : 'secondary'}
                  onPress={() => setPrescriptionListOpen((open) => !open)}
                  style={styles.rxButton}
                />

                {prescriptionListOpen ? (
                  prescriptions.isPending ? (
                    <View style={styles.loading}>
                      <ActivityIndicator color={colors.blue} />
                    </View>
                  ) : (prescriptions.data ?? []).length === 0 ? (
                    <EmptyState
                      icon="document"
                      tint="blue"
                      title={t('pharmacy.noPrescriptions')}
                      actionLabel={t('pharmacy.openPrescriptions')}
                      onAction={() => router.push('/prescriptions')}
                    />
                  ) : (
                    <Card variant="flush" style={styles.rxList}>
                      {(prescriptions.data ?? []).map((rx, index, all) => {
                        const active = rx.id === prescriptionId;
                        // facility_name is nullable on the prescriptions payload;
                        // when it is absent the item count becomes the headline
                        // rather than a placeholder.
                        const items = t('pharmacy.prescriptionItems', { count: rx.item_count });
                        return (
                          <ListRow
                            key={rx.id}
                            icon="document-text"
                            tint={active ? 'green' : 'blue'}
                            title={rx.facility_name ?? items}
                            meta={[rx.facility_name ? items : null, formatDate(rx.prescribed_at) || null]}
                            trailing={
                              active ? <Icon name="check" size={18} color={colors.blue} /> : undefined
                            }
                            chevron={false}
                            divider={index < all.length - 1}
                            onPress={() => {
                              setPrescriptionId(active ? null : rx.id);
                              setPrescriptionListOpen(false);
                              setErrorCode(null);
                            }}
                          />
                        );
                      })}
                    </Card>
                  )
                ) : null}
              </Card>
            ) : null}

            {/* -- Outcome strips (the Dialog is transient; these persist) --- */}
            {confirmed ? (
              <View style={[styles.outcome, { backgroundColor: colors.statusNormalBg }]}>
                <Icon name="check-circle" size={20} color={colors.statusNormal} />
                <View style={styles.outcomeBody}>
                  <Text style={[styles.outcomeTitle, { color: colors.statusNormal }]}>
                    {t('pharmacy.reserveSuccessTitle')}
                  </Text>
                  <Text style={styles.body}>
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
                style={[
                  styles.outcome,
                  {
                    backgroundColor:
                      errorCode === 'PRESCRIPTION_REQUIRED'
                        ? colors.statusPendingBg
                        : colors.statusCriticalBg,
                  },
                ]}
              >
                <Icon
                  name={errorCode === 'PRESCRIPTION_REQUIRED' ? 'document-text' : 'alert-circle'}
                  size={20}
                  color={
                    errorCode === 'PRESCRIPTION_REQUIRED' ? colors.statusPending : colors.statusCritical
                  }
                />
                <View style={styles.outcomeBody}>
                  <Text
                    style={[
                      styles.outcomeTitle,
                      {
                        color:
                          errorCode === 'PRESCRIPTION_REQUIRED'
                            ? colors.statusPending
                            : colors.statusCritical,
                      },
                    ]}
                  >
                    {errorCode === 'PRESCRIPTION_REQUIRED'
                      ? t('pharmacy.prescriptionExplainerTitle')
                      : t('pharmacy.loadFailed')}
                  </Text>
                  <Text style={styles.body}>
                    {t(`pharmacy.reserveError.${errorCode}`, {
                      defaultValue: t('pharmacy.reserveError.generic'),
                    })}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* -- Actions -------------------------------------------------- */}
            <View style={styles.actions}>
              <GradientButton
                label={t('pharmacy.reserve')}
                onPress={confirmReserve}
                loading={reserve.isPending}
                disabled={!canReserve}
                accessibilityHint={t('pharmacy.paymentNote')}
              />

              {/* Why the CTA is disabled — never leave a dead button unexplained. */}
              {disabledReason ? <Text style={styles.disabledReason}>{disabledReason}</Text> : null}

              <View style={styles.secondaryActions}>
                {callablePhone(pharmacy) ? (
                  <MedButton
                    label={t('pharmacy.callPharmacy')}
                    icon="phone"
                    variant="secondary"
                    onPress={callPharmacy}
                    style={styles.secondaryAction}
                  />
                ) : null}
                {pharmacy ? (
                  <MedButton
                    label={t('pharmacy.viewPharmacy')}
                    icon="store"
                    variant="secondary"
                    onPress={() =>
                      router.push({ pathname: '/facility/[id]', params: { id: pharmacy.id } })
                    }
                    style={styles.secondaryAction}
                  />
                ) : null}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {dialog.element}
    </SafeAreaView>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

/** Name, generic, strength/form, Rx/controlled badges, price range, fact cells. */
function IdentityCard({ medicine }: { medicine: Medicine }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const min = medicine.availability.price_min ?? null;
  const max = medicine.availability.price_max ?? null;
  const priceRangeLabel =
    min !== null && max !== null && min !== max
      ? t('pharmacy.priceRangeValue', { min: formatXafBare(min), max: formatXaf(max) })
      : (formatXaf(min ?? max) ?? t('pharmacy.priceUnavailable'));

  const strengthForm =
    medicine.strength && medicine.form
      ? t('pharmacy.strengthForm', { strength: medicine.strength, form: medicine.form })
      : (medicine.strength ?? medicine.form ?? null);

  const categoryLabel = t(`pharmacy.categories.${medicine.category}`, {
    defaultValue: medicine.category_label,
  });

  return (
    <Card>
      <View style={styles.identity}>
        <TintCircle
          icon={CATEGORY_ICONS[medicine.category_icon] ?? 'pill'}
          tint="blue"
          size={72}
          square
        />
        <View style={styles.identityBody}>
          <Text style={styles.drugName} numberOfLines={2}>
            {medicine.name}
          </Text>
          <Text style={styles.drugForm}>{t('pharmacy.generic', { name: medicine.generic_name })}</Text>
          {strengthForm ? <Text style={styles.drugForm}>{strengthForm}</Text> : null}
          <View style={styles.badgeRow}>
            <StatusBadge
              status={medicine.prescription_required ? 'pending' : 'normal'}
              tone={medicine.prescription_required ? 'pending' : 'normal'}
              label={
                medicine.prescription_required
                  ? t('pharmacy.prescriptionRequired')
                  : t('pharmacy.prescriptionNotRequired')
              }
              size="sm"
            />
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
        <View style={styles.identityAside}>
          <Text style={styles.asideLabel}>{t('pharmacy.priceRange')}</Text>
          <Text style={styles.asideValue}>{priceRangeLabel}</Text>
          <Text style={[styles.asideLabel, styles.asideLabelSpaced]}>
            {medicine.availability.is_available ? t('pharmacy.available') : t('pharmacy.unavailable')}
          </Text>
          <Text
            style={[
              styles.asideValue,
              { color: medicine.availability.is_available ? colors.statusNormal : colors.textSecondary },
            ]}
            numberOfLines={2}
          >
            {medicine.availability.is_available
              ? t('pharmacy.pharmacyCount', { count: medicine.availability.pharmacy_count })
              : t('pharmacy.availabilityNone')}
          </Text>
        </View>
      </View>

      <View style={styles.identityFacts}>
        <FactCell
          icon="capsule"
          label={t('opesMeds.detail.dose')}
          value={medicine.strength ?? '—'}
          align="center"
        />
        <FactCell
          icon="pill"
          label={t('pharmacy.form', { defaultValue: 'Form' })}
          value={medicine.form ?? '—'}
          align="center"
          divided
        />
        <FactCell
          icon="grid"
          label={t('pharmacy.category', { defaultValue: 'Category' })}
          value={categoryLabel}
          align="center"
          divided
        />
        <FactCell
          icon="cart"
          label={t('pharmacy.packSizeOptions')}
          value={medicine.default_pack_size ?? '—'}
          align="center"
          divided
        />
      </View>
    </Card>
  );
}

/** One stocking pharmacy in the picker: stock badge, price, distance, hours. */
function PharmacyOptionRow({
  pharmacy,
  selected,
  divider,
  onPress,
}: {
  pharmacy: NearbyPharmacy;
  selected: boolean;
  divider: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const price = formatXaf(pharmacy.stock?.unit_price);
  const stockLabel = pharmacy.stock
    ? t(`pharmacy.stock.${pharmacy.stock.status}`)
    : t('pharmacy.stock.unknown');
  const reportedAt = formatDate(pharmacy.stock?.last_reported_at) || null;

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
    <ListRow
      leading={<TintCircle icon={selected ? 'check' : 'store'} tint={selected ? 'green' : 'blue'} />}
      title={pharmacy.name}
      meta={[
        t('pharmacy.distanceKm', { km: pharmacy.distance_km }),
        hoursLine,
        pharmacy.stock?.packs_available
          ? t('pharmacy.packsLeft', { count: pharmacy.stock.packs_available })
          : reportedAt
            ? t('pharmacy.stockUpdated', { when: reportedAt })
            : null,
      ]}
      trailing={
        <View style={styles.rowAside}>
          {price ? (
            <Text style={styles.rowPrice} numberOfLines={1}>
              {price}
            </Text>
          ) : null}
          <StatusBadge
            status={pharmacy.stock?.status ?? 'unknown'}
            tone={stockTone(pharmacy.stock?.status)}
            label={stockLabel}
            size="sm"
          />
        </View>
      }
      chevron={false}
      divider={divider}
      onPress={onPress}
      style={selected ? styles.selectedRow : undefined}
      accessibilityLabel={[pharmacy.name, stockLabel, price, hoursLine].filter(Boolean).join(', ')}
      accessibilityHint={selected ? t('pharmacy.selectedPharmacy') : t('pharmacy.reserveHere')}
    />
  );
}

function StepperButton({
  icon,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  icon: IconName;
  disabled: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={[styles.stepperButton, disabled && styles.stepperButtonOff]}
    >
      <Icon name={icon} size={18} color={colors.blue} />
    </TouchableOpacity>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.summaryLine} accessible accessibilityLabel={`${label}, ${value}`}>
      <Text style={styles.summaryLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.summaryValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
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

/* ── Styles ───────────────────────────────────────────────────────────────── */

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.page },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

    loading: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
    loadingText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    body: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textSecondary,
    },
    hint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    sectionHint: {
      marginTop: -spacing.xs,
      marginBottom: spacing.sm + 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    // Identity card (MED-005 recipe)
    identity: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 },
    // At 320px the 72px badge + 122px aside would crush the drug name into ~38px.
    // A minWidth on the body drops the aside to its own line on narrow screens;
    // wider screens keep badge, name and aside on one row.
    identityBody: { flex: 1, minWidth: 160, gap: 2 },
    drugName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      lineHeight: typography.lineHeight.lg,
      color: c.textPrimary,
    },
    drugForm: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textSecondary,
    },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    identityAside: {
      width: 122,
      paddingLeft: 12,
      borderLeftWidth: 1,
      borderLeftColor: c.divider,
      gap: 1,
    },
    asideLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textSecondary,
    },
    asideLabelSpaced: { marginTop: spacing.sm },
    asideValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.link,
    },
    identityFacts: {
      flexDirection: 'row',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },

    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },

    // Rows placed inside a padded card sit flush with its edges.
    flushRow: { paddingHorizontal: 0 },
    selectedRow: { backgroundColor: c.primarySoft },

    rowAside: { alignItems: 'flex-end', gap: 4 },
    rowPrice: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.link,
    },

    stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    stepperButton: {
      width: 34,
      height: 34,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primarySoft,
    },
    stepperButtonOff: { opacity: 0.4 },
    stepperValue: {
      minWidth: 28,
      textAlign: 'center',
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: c.textPrimary,
    },

    summaryLine: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingVertical: 6,
    },
    summaryLabel: {
      flexShrink: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textSecondary,
    },
    summaryValue: {
      flex: 1,
      textAlign: 'right',
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    totalRow: {
      marginTop: spacing.sm,
      paddingTop: spacing.sm + 2,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    total: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xxl,
      lineHeight: typography.lineHeight.xxl,
      color: c.link,
    },
    infoStrip: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      marginTop: spacing.sm + 2,
      padding: spacing.sm + 2,
      borderRadius: radii.sm,
      backgroundColor: c.primarySoft,
    },
    infoText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },

    rxHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 4 },
    rxBody: { flex: 1, minWidth: 0, gap: 4 },
    rxTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    rxButton: { marginTop: spacing.md },
    rxList: { marginTop: spacing.sm },

    outcome: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 2,
      padding: spacing.md - 2,
      borderRadius: radii.md,
    },
    outcomeBody: { flex: 1, minWidth: 0, gap: 2 },
    outcomeTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },

    actions: { gap: spacing.sm + 4 },
    disabledReason: {
      textAlign: 'center',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
    },
    secondaryActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    secondaryAction: { flexGrow: 1, flexBasis: '45%' },
  });
