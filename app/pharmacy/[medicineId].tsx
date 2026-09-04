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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Chip,
  EmptyState,
  GradientButton,
  Icon,
  LastUpdatedLine,
  ListRow,
  ScreenHeader,
  SectionHeader,
  StaleNotice,
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
  type PharmacyPrescriptionOption,
  type PharmacyStock,
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
 * ── Availability provenance, which is the whole point of this screen ───────
 * A patient reads this before spending a fare to cross a city, so every claim
 * has to be traceable to something a pharmacy actually said:
 *
 *   • a pharmacy appears in the stocking list ONLY if it has a stock row, and
 *     `MedicineFinderService` builds those through `reportedByRealSource()` —
 *     an allow-list on `source_system` that withholds rows nobody has claimed.
 *     Rows with no stock record are not listed here at all, because "Stock
 *     Unknown" under a heading that says "Pharmacies stocking this" is a lie
 *     dressed as a status. (Verified against the live API: 25 rows inside a
 *     25 km radius around Douala, 3 of them with any stock record.)
 *   • `last_reported_at` is shown on every stocking row, always — never
 *     replaced by a livelier-looking figure such as the pack count — and a
 *     report older than STOCK_STALE_DAYS is called out rather than presented
 *     as current.
 *   • `availability.price_min/max` on the medicine falls back to the
 *     catalogue's own reference price when no pharmacy has reported a price
 *     (`medicinePayload()` does `$availability['price_min'] ?? $medicine->
 *     price_min`), so a range with `pharmacy_count === 0` behind it is
 *     labelled as indicative, not quoted as if somebody were charging it.
 *   • the medicine's `pharmacy_count` is a NATIONAL figure — the catalogue
 *     endpoint takes no coordinates at all — so it is never worded as "near
 *     you"; the list below is the local answer.
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

/** MedicineReservationService::MAX_OPEN_RESERVATIONS. */
const MAX_OPEN_HOLDS = 10;

/** MobilePharmacyController caps the reservation note at 500 characters. */
const MAX_NOTE_LENGTH = 500;

/** Radius steps offered here, capped at MedicineFinderService::MAX_RADIUS_KM (50). */
const RADIUS_LADDER = [5, 10, 25, 50];

/**
 * A stock report older than this is treated as history, not as the shelf.
 * Nothing on the server expires a stock row, so the honesty has to happen here.
 */
const STOCK_STALE_DAYS = 30;

/** `care_facilities.verification_status` values this app is willing to interpret. */
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

/**
 * XAF quoted the way the counter says it, and never relabelled. Every price in
 * these payloads travels with its own `currency`, so a row that is not XAF is
 * printed with its ISO code rather than silently renamed to francs.
 */
function money(value: number | null | undefined, currency?: string | null): string | null {
  const code = (currency ?? 'XAF').toUpperCase();
  if (code === 'XAF' || code === 'FCFA' || code === '') return formatXaf(value);
  const bare = formatXafBare(value);
  return bare === null ? null : `${bare} ${code}`;
}

/** Whole days since an ISO timestamp, or null when it is absent or unparseable. */
function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  return Math.floor((Date.now() - at) / 86_400_000);
}

/**
 * "Verified pharmacy" / "Not verified", or nothing at all — never a guess for
 * a status value this app does not recognise.
 */
function verificationLine(
  status: string | null | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
): string | null {
  const value = (status ?? '').trim().toLowerCase();
  if (VERIFIED_STATUSES.has(value)) return t('pharmacy.verified', { defaultValue: 'Verified pharmacy' });
  if (UNVERIFIED_STATUSES.has(value)) return t('pharmacy.notVerified', { defaultValue: 'Not verified' });
  return null;
}

/** Open / closed / 24h / hours-not-published, from the opening state the API sends. */
function hoursLine(
  pharmacy: NearbyPharmacy,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (pharmacy.is_24_hours) return t('pharmacy.open24');
  if (pharmacy.is_open === null) return t('pharmacy.hoursUnknown');
  if (pharmacy.is_open) {
    return pharmacy.closes_at ? t('pharmacy.closesAt', { time: pharmacy.closes_at }) : t('pharmacy.open');
  }
  return pharmacy.opens_at ? t('pharmacy.opensAt', { time: pharmacy.opens_at }) : t('pharmacy.closed');
}

/**
 * When the pharmacy last said anything about this medicine, and whether that
 * is old enough to stop trusting. Shown on every stocking row without
 * exception — a pack count is not a substitute for a date.
 */
function freshness(
  stock: PharmacyStock | null | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
): { line: string; stale: boolean } {
  if (!stock?.last_reported_at) {
    return {
      line: t('pharmacy.stockNotDated', { defaultValue: 'Stock report not dated' }),
      // An undated report cannot be shown as current either.
      stale: true,
    };
  }
  const age = daysSince(stock.last_reported_at);
  return {
    line: t('pharmacy.stockUpdated', { when: formatDate(stock.last_reported_at) }),
    stale: age !== null && age > STOCK_STALE_DAYS,
  };
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

/** Localised label for a prescription's status, falling back to readable text. */
function prescriptionStatusLabel(
  status: string,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  switch (status) {
    case 'active':
      return t('prescriptions.statusActive');
    case 'dispensed':
      return t('prescriptions.statusDispensed');
    case 'partially_dispensed':
      return t('prescriptions.statusPartiallyDispensed');
    case 'expired':
      return t('prescriptions.statusExpired');
    case 'cancelled':
      return t('prescriptions.statusCancelled');
    default:
      return status.replace(/_/g, ' ');
  }
}

/** A prescription the pharmacy is likely to refuse: past its expiry, or void. */
function prescriptionUnusable(rx: PharmacyPrescriptionOption): boolean {
  if (rx.status === 'expired' || rx.status === 'cancelled') return true;
  const age = daysSince(rx.expires_at);
  return age !== null && age > 0;
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
  const [note, setNote] = useState('');
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
  const allOpenHolds = useMemo(() => reservations.data ?? [], [reservations.data]);
  const existingHolds = useMemo(
    () => allOpenHolds.filter((r) => r.medicine?.id === medicineId),
    [allOpenHolds, medicineId],
  );
  const atHoldCap = allOpenHolds.length >= MAX_OPEN_HOLDS;

  // GET /mobile/pharmacy/nearby returns every pharmacy in the radius, and most
  // carry no stock row for this medicine at all. Listing the others as "Stock
  // Unknown" under a heading that says "Pharmacies stocking this" would be
  // noise and a small lie, so only rows the pharmacy has actually reported on
  // are shown — including out-of-stock ones, which are real information. The
  // directory of everything nearby lives on /pharmacy.
  const pharmacyRows = useMemo(
    () => (pharmacies.data ?? []).filter((p) => p.stock !== null),
    [pharmacies.data],
  );
  const withoutStockRow = (pharmacies.data ?? []).length - pharmacyRows.length;

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

  const stock = pharmacy?.stock ?? null;
  const unitPrice = stock?.unit_price ?? null;
  const totalPrice = unitPrice === null ? null : unitPrice * quantity;
  const currency = stock?.currency ?? medicine.data?.currency ?? null;
  const reservationEnabled = !!stock?.reservation_enabled;
  const heldHere = !!pharmacy && existingHolds.some((r) => r.pharmacy?.id === pharmacy.id);
  const stockFreshness = freshness(stock, t);

  // A price quoted for one pack size does not describe another; say so rather
  // than multiplying a number that no longer means what the label says.
  const packMismatch =
    !!stock?.pack_size && !!packSize && stock.pack_size !== packSize ? stock.pack_size : null;

  const chosenPrescription = useMemo(
    () => (prescriptions.data ?? []).find((rx) => rx.id === prescriptionId) ?? null,
    [prescriptions.data, prescriptionId],
  );

  const canReserve =
    reservationEnabled &&
    !heldHere &&
    !atHoldCap &&
    (!needsPrescription || !!prescriptionId) &&
    !confirmed;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/pharmacy'));

  const changeRadius = (km: number) => {
    if (km === radiusKm) return;
    setRadiusKm(km);
    setPharmacyId(null);
    setConfirmed(null);
    setErrorCode(null);
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
        note: note.trim() ? note.trim().slice(0, MAX_NOTE_LENGTH) : null,
      });
      setConfirmed(reservation);
      dialog.alert(
        t('pharmacy.reserveSuccessTitle'),
        [
          t('pharmacy.reserveSuccessBody', {
            reference: reservation.reference,
            pharmacy: reservation.pharmacy?.name ?? pharmacy.name,
          }),
          reservation.expires_at
            ? t('pharmacy.reservationExpires', { when: formatDateTime(reservation.expires_at) })
            : null,
        ]
          .filter(Boolean)
          .join('\n'),
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

  /** Everything the hold will commit the patient to, in one readable block. */
  const confirmReserve = () => {
    if (!pharmacy || !medicine.data) return;
    dialog.confirm({
      title: t('pharmacy.reserve'),
      message: [
        [medicine.data.name, medicine.data.strength, medicine.data.form].filter(Boolean).join(' · '),
        pharmacy.name,
        [t('pharmacy.reservationQuantity', { count: quantity }), packSize].filter(Boolean).join(' · '),
        unitPrice !== null
          ? `${t('pharmacy.unitPrice')}: ${money(unitPrice, currency)}`
          : t('pharmacy.priceUnavailable'),
        `${t('pharmacy.totalPrice')}: ${money(totalPrice, currency) ?? t('pharmacy.priceUnavailable')}`,
        packMismatch
          ? t('pharmacy.packMismatch', {
              pharmacy: pharmacy.name,
              size: packMismatch,
              defaultValue:
                '{{pharmacy}} quoted this price for {{size}}. Confirm the total at the counter.',
            })
          : null,
        chosenPrescription
          ? t('pharmacy.reservationPrescriptionAttached', { defaultValue: 'Prescription attached' })
          : null,
        chosenPrescription && prescriptionUnusable(chosenPrescription)
          ? t('pharmacy.prescriptionExpiredWarning', {
              defaultValue: 'This prescription has expired — the pharmacy may refuse it.',
            })
          : null,
        // The stock figure behind this hold, restated at the moment of commitment.
        stockFreshness.stale
          ? t('pharmacy.stockStale', {
              days: STOCK_STALE_DAYS,
              defaultValue:
                'This stock report is more than {{days}} days old. Call the pharmacy before you travel.',
            })
          : stockFreshness.line,
        '',
        t('pharmacy.paymentNote'),
      ]
        .filter(Boolean)
        .join('\n'),
      confirmLabel: t('pharmacy.reserve'),
      tone: 'info',
      onConfirm: placeReservation,
    });
  };

  /** Cancelling a hold is destructive and unrecoverable — confirm first. */
  const confirmCancel = (hold: MedicineReservation) =>
    dialog.confirm({
      title: t('pharmacy.reservationCancel'),
      message: [
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
          // The success strip names a hold that no longer exists once it is
          // cancelled, so it goes with it.
          if (confirmed?.id === hold.id) setConfirmed(null);
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

  /** Why the CTA is dead — never leave a disabled button unexplained. */
  const disabledReason =
    canReserve || confirmed
      ? null
      : !pharmacy
        ? t('pharmacy.noPharmacySelected')
        : heldHere
          ? t('pharmacy.reservationHeldHere')
          : atHoldCap
            ? t('pharmacy.reservationsAtCap', {
                max: MAX_OPEN_HOLDS,
                defaultValue:
                  'You have the maximum of {{max}} holds open. Cancel one before reserving another.',
              })
            : !reservationEnabled
              ? stock?.status === 'out_of_stock'
                ? t('pharmacy.outOfStockNote')
                : t('pharmacy.noReservationEnabled')
              : t('pharmacy.reserveError.PRESCRIPTION_REQUIRED');

  const phone = callablePhone(pharmacy?.phone);
  const loadedAt = Math.max(medicine.dataUpdatedAt ?? 0, pharmacies.dataUpdatedAt ?? 0);

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={t('pharmacy.selectedMedicine')}
        subtitle={t('opesMeds.detail.subtitle')}
        onBack={goBack}
        actions={[
          {
            icon: 'receipt',
            badge: allOpenHolds.length > 0 ? allOpenHolds.length : undefined,
            onPress: () => router.push('/pharmacy'),
            accessibilityLabel: t('pharmacy.reservationsTitle'),
          },
        ]}
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
        ) : medicine.isError && !medicine.data ? (
          <Card variant="flush">
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('pharmacy.loadFailed')}
              actionLabel={t('pharmacy.retry')}
              onAction={() => medicine.refetch()}
            />
          </Card>
        ) : !medicine.data ? (
          <Card variant="flush">
            <EmptyState
              icon="search"
              tint="blue"
              title={t('pharmacy.reserveError.MEDICINE_NOT_FOUND')}
              actionLabel={t('pharmacy.back')}
              onAction={() => router.replace('/pharmacy')}
            />
          </Card>
        ) : (
          <>
            {/* A failed refresh over data already on screen is not an empty
                screen — say the figures are old rather than showing them new. */}
            {medicine.isError ? (
              <StaleNotice
                message={t('pharmacy.loadFailed')}
                loadedAt={medicine.dataUpdatedAt ? new Date(medicine.dataUpdatedAt) : null}
                onRetry={() => medicine.refetch()}
                retrying={medicine.isFetching}
              />
            ) : null}

            {/* -- Identity ------------------------------------------------- */}
            <IdentityCard medicine={medicine.data} />

            {/* -- Existing holds on this medicine -------------------------- */}
            {existingHolds.length > 0 ? (
              <Card>
                <CardOverline title={t('pharmacy.reservationsTitle')} />
                {existingHolds.map((hold, index) => {
                  const expiresAt = hold.expires_at ? new Date(hold.expires_at) : null;
                  const expired =
                    hold.status === 'expired' ||
                    (!!expiresAt &&
                      !Number.isNaN(expiresAt.getTime()) &&
                      expiresAt.getTime() <= Date.now());
                  const busy =
                    cancelReservation.isPending && cancelReservation.variables?.id === hold.id;
                  return (
                    <ListRow
                      key={hold.id}
                      icon="receipt"
                      tint={expired ? 'red' : 'amber'}
                      title={hold.pharmacy?.name ?? t('pharmacy.selectedMedicine')}
                      meta={[
                        t('pharmacy.reservationRef', { reference: hold.reference }),
                        [t('pharmacy.reservationQuantity', { count: hold.quantity }), hold.pack_size]
                          .filter(Boolean)
                          .join(' · '),
                        money(hold.total_price, hold.currency),
                        expired
                          ? t('pharmacy.reservationExpired')
                          : expiresAt
                            ? t('pharmacy.reservationExpires', { when: formatDateTime(expiresAt) })
                            : t(`pharmacy.reservationStatus.${hold.status}`, {
                                defaultValue: hold.status_label,
                              }),
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
                        ) : (
                          <StatusBadge
                            status={hold.status}
                            tone={expired ? 'critical' : (RESERVATION_TONES[hold.status] ?? 'pending')}
                            label={t(`pharmacy.reservationStatus.${hold.status}`, {
                              defaultValue: hold.status_label,
                            })}
                            size="sm"
                          />
                        )
                      }
                      chevron={false}
                      divider={index < existingHolds.length - 1}
                      style={styles.flushRow}
                    />
                  );
                })}
                {existingHolds.some((h) => h.pharmacy_note) ? (
                  <NoticeStrip
                    icon="chat"
                    tone="info"
                    text={existingHolds
                      .filter((h) => h.pharmacy_note)
                      .map(
                        (h) =>
                          `${t('pharmacy.reservationPharmacyNote', { defaultValue: 'Note from the pharmacy' })}: ${h.pharmacy_note}`,
                      )
                      .join('\n')}
                  />
                ) : null}
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

            {/* -- Stocking pharmacies -------------------------------------- */}
            <View>
              <SectionHeader title={t('pharmacy.pharmaciesStocking')} />
              <Text style={styles.sectionHint}>
                {t('pharmacy.pharmaciesStockingHint')}
                {'\n'}
                {t('pharmacy.stockProvenance', {
                  defaultValue:
                    'Stock levels and prices are reported by each pharmacy, not measured by OpesCare.',
                })}
              </Text>

              {/* The searched radius is a control, not a footnote: "nothing
                  here" is only meaningful next to how far we looked. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipRail}
                contentContainerStyle={styles.chipRailContent}
              >
                {RADIUS_LADDER.map((km) => (
                  <Chip
                    key={km}
                    icon="target"
                    label={t('pharmacy.radius', { km })}
                    selected={km === radiusKm}
                    onPress={() => changeRadius(km)}
                    accessibilityLabel={t('pharmacy.radiusPickerTitle')}
                  />
                ))}
              </ScrollView>

              {pharmacies.isError && pharmacyRows.length > 0 ? (
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
                <View style={styles.loading} accessibilityLiveRegion="polite">
                  <ActivityIndicator color={colors.blue} />
                  <Text style={styles.loadingText}>{t('pharmacy.loadingPharmacies')}</Text>
                </View>
              ) : pharmacies.isError && pharmacyRows.length === 0 ? (
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
                    title={t('pharmacy.notReportedAnywhere', {
                      defaultValue: 'No pharmacy has reported stock for this medicine.',
                    })}
                    message={[
                      t('pharmacy.radiusSearched', {
                        km: radiusKm,
                        defaultValue: 'Searched within {{km}} km',
                      }),
                      withoutStockRow > 0
                        ? t('pharmacy.nearbyNoStockRow', {
                            defaultValue:
                              'Pharmacies here that have never reported this medicine are not listed.',
                          })
                        : t('pharmacy.noPharmacies', { km: radiusKm }),
                    ].join('  ·  ')}
                    actionLabel={
                      nextRadiusKm
                        ? `${t('pharmacy.radiusPickerTitle')}: ${t('pharmacy.radius', { km: nextRadiusKm })}`
                        : undefined
                    }
                    onAction={nextRadiusKm ? () => changeRadius(nextRadiusKm) : undefined}
                  />
                </Card>
              ) : (
                <View style={styles.stack}>
                  <Card variant="flush">
                    {pharmacyRows.map((row, index) => (
                      <PharmacyOptionRow
                        key={row.id}
                        pharmacy={row}
                        selected={pharmacy?.id === row.id}
                        divider={index < pharmacyRows.length - 1}
                        onPress={() => {
                          setPharmacyId(row.id);
                          setPackSize(null);
                          setConfirmed(null);
                          setErrorCode(null);
                        }}
                      />
                    ))}
                  </Card>
                  {withoutStockRow > 0 ? (
                    <Text style={styles.footNote}>
                      {t('pharmacy.nearbyNoStockRow', {
                        defaultValue:
                          'Pharmacies here that have never reported this medicine are not listed.',
                      })}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>

            {/* -- The chosen pharmacy, in full ----------------------------- */}
            {pharmacy && stock ? (
              <Card>
                <CardOverline
                  title={t('pharmacy.selectedPharmacyTitle', { defaultValue: 'Selected pharmacy' })}
                  right={
                    <StatusBadge
                      status={stock.status}
                      tone={stockTone(stock.status)}
                      label={t(`pharmacy.stock.${stock.status}`, { defaultValue: stock.status_label })}
                      size="sm"
                    />
                  }
                />
                <Text style={styles.pharmacyName}>{pharmacy.name}</Text>
                <Text style={styles.body}>
                  {[
                    t('pharmacy.distanceKm', { km: pharmacy.distance_km }),
                    hoursLine(pharmacy, t),
                    verificationLine(pharmacy.verification_status, t),
                  ]
                    .filter(Boolean)
                    .join('  ·  ')}
                </Text>
                {pharmacy.address || pharmacy.city ? (
                  <Text style={styles.hint}>
                    {[pharmacy.address, pharmacy.city, pharmacy.region].filter(Boolean).join(', ')}
                  </Text>
                ) : null}

                <View style={styles.stockFacts}>
                  <SummaryLine
                    label={t('pharmacy.unitPrice')}
                    value={money(stock.unit_price, stock.currency) ?? t('pharmacy.priceUnavailable')}
                  />
                  {stock.pack_size ? (
                    <SummaryLine
                      label={t('pharmacy.packSizeOptions')}
                      value={stock.pack_size}
                    />
                  ) : null}
                  {stock.packs_available !== null ? (
                    <SummaryLine
                      label={t('pharmacy.stock.in_stock')}
                      value={t('pharmacy.packsAvailable', { count: stock.packs_available })}
                    />
                  ) : null}
                  {/* Always present: a pack count is not a substitute for a date. */}
                  <SummaryLine
                    label={t('pharmacy.stockDetails', { defaultValue: 'Last reported' })}
                    value={stockFreshness.line}
                  />
                </View>

                {stockFreshness.stale ? (
                  <NoticeStrip
                    icon="alert-triangle"
                    tone="warning"
                    text={t('pharmacy.stockStale', {
                      days: STOCK_STALE_DAYS,
                      defaultValue:
                        'This stock report is more than {{days}} days old. Call the pharmacy before you travel.',
                    })}
                  />
                ) : null}
                {!stock.reservation_enabled ? (
                  <NoticeStrip
                    icon="info"
                    tone="info"
                    text={
                      stock.status === 'out_of_stock'
                        ? t('pharmacy.outOfStockNote')
                        : t('pharmacy.noReservationEnabled')
                    }
                  />
                ) : null}
              </Card>
            ) : null}

            {/* -- Where it is: embedded, in-app map (no external maps app) -- */}
            {pharmacy && pharmacy.latitude != null && pharmacy.longitude != null ? (
              <Card variant="flush">
                <FacilityMap facilities={pharmacy} height={180} directions />
              </Card>
            ) : null}

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
                {packMismatch ? (
                  <NoticeStrip
                    icon="alert-triangle"
                    tone="warning"
                    text={t('pharmacy.packMismatch', {
                      pharmacy: pharmacy?.name ?? '',
                      size: packMismatch,
                      defaultValue:
                        '{{pharmacy}} quoted this price for {{size}}. Confirm the total at the counter.',
                    })}
                  />
                ) : null}
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

              {/* Optional message the pharmacist sees on the hold. */}
              <Text style={styles.fieldLabel}>
                {t('pharmacy.noteLabel', { defaultValue: 'Note for the pharmacy (optional)' })}
              </Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                multiline
                maxLength={MAX_NOTE_LENGTH}
                placeholder={t('pharmacy.notePlaceholder', {
                  defaultValue: 'Anything the pharmacist should know',
                })}
                placeholderTextColor={colors.textMuted}
                style={styles.noteInput}
                accessibilityLabel={t('pharmacy.noteLabel', {
                  defaultValue: 'Note for the pharmacy (optional)',
                })}
              />
              <Text style={styles.hint}>
                {t('pharmacy.noteHint', {
                  max: MAX_NOTE_LENGTH,
                  defaultValue:
                    'Up to {{max}} characters. Do not include payment card or ID numbers.',
                })}
              </Text>
            </Card>

            {/* -- Prescription — business logic, not an error ---------------- */}
            {needsPrescription ? (
              <Card>
                <View style={styles.rxHead}>
                  <TintCircle icon="document-text" tint="blue" />
                  <View style={styles.rxBody}>
                    <Text style={styles.rxTitle}>{t('pharmacy.prescriptionExplainerTitle')}</Text>
                    <Text style={styles.body}>{t('pharmacy.prescriptionExplainerBody')}</Text>
                    {medicine.data.is_controlled ? (
                      <Text style={styles.body}>{t('pharmacy.controlled')}</Text>
                    ) : null}
                  </View>
                </View>

                <MedButton
                  label={
                    chosenPrescription
                      ? t('pharmacy.prescriptionAttached')
                      : t('pharmacy.attachPrescription')
                  }
                  icon={chosenPrescription ? 'check' : 'paperclip'}
                  iconRight={prescriptionListOpen ? 'chevron-up' : 'chevron-down'}
                  variant={chosenPrescription ? 'ghost' : 'secondary'}
                  onPress={() => setPrescriptionListOpen((open) => !open)}
                  style={styles.rxButton}
                />

                {chosenPrescription ? (
                  <Text style={styles.hint}>
                    {[
                      chosenPrescription.facility_name ?? t('prescriptions.unknownFacility'),
                      t('pharmacy.prescriptionItems', { count: chosenPrescription.item_count }),
                      chosenPrescription.prescribed_at
                        ? formatDate(chosenPrescription.prescribed_at)
                        : t('prescriptions.dateUnknown'),
                    ]
                      .filter(Boolean)
                      .join('  ·  ')}
                  </Text>
                ) : null}

                {chosenPrescription && prescriptionUnusable(chosenPrescription) ? (
                  <NoticeStrip
                    icon="alert-triangle"
                    tone="warning"
                    text={t('pharmacy.prescriptionExpiredWarning', {
                      defaultValue: 'This prescription has expired — the pharmacy may refuse it.',
                    })}
                  />
                ) : null}

                {prescriptionListOpen ? (
                  prescriptions.isPending ? (
                    <View style={styles.loading}>
                      <ActivityIndicator color={colors.blue} />
                    </View>
                  ) : prescriptions.isError ? (
                    <EmptyState
                      icon="alert-circle"
                      tint="red"
                      title={t('prescriptions.loadError')}
                      actionLabel={t('pharmacy.retry')}
                      onAction={() => prescriptions.refetch()}
                    />
                  ) : (prescriptions.data ?? []).length === 0 ? (
                    // Not an error: a patient who has never been prescribed
                    // anything simply cannot reserve this medicine here, and
                    // needs to be told what to do instead.
                    <EmptyState
                      icon="document"
                      tint="blue"
                      title={t('pharmacy.noPrescriptions')}
                      message={t('pharmacy.prescriptionExplainerBody')}
                      actionLabel={t('pharmacy.openPrescriptions')}
                      onAction={() => router.push('/prescriptions')}
                    />
                  ) : (
                    <Card variant="flush" style={styles.rxList}>
                      {(prescriptions.data ?? []).map((rx, index, all) => {
                        const active = rx.id === prescriptionId;
                        const unusable = prescriptionUnusable(rx);
                        // facility_name is nullable on the prescriptions payload;
                        // when it is absent the row says so rather than guessing.
                        return (
                          <ListRow
                            key={rx.id}
                            icon="document-text"
                            tint={active ? 'green' : unusable ? 'red' : 'blue'}
                            title={rx.facility_name ?? t('prescriptions.unknownFacility')}
                            meta={[
                              t('pharmacy.prescriptionItems', { count: rx.item_count }),
                              prescriptionStatusLabel(rx.status, t),
                              rx.prescribed_at ? formatDate(rx.prescribed_at) : null,
                              rx.expires_at
                                ? `${t('prescriptions.expiresAt')} ${formatDate(rx.expires_at)}`
                                : t('prescriptions.noExpiry'),
                            ]}
                            trailing={
                              active ? (
                                <Icon name="check" size={18} color={colors.blue} />
                              ) : unusable ? (
                                <StatusBadge
                                  status={rx.status}
                                  tone="critical"
                                  label={t('prescriptions.statusExpired')}
                                  size="sm"
                                />
                              ) : undefined
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

            {/* -- Price summary -------------------------------------------- */}
            <Card>
              <CardOverline title={t('pharmacy.totalPrice')} />
              <SummaryLine
                label={t('pharmacy.selectedPharmacy')}
                value={pharmacy?.name ?? t('pharmacy.noPharmacySelected')}
              />
              <SummaryLine
                label={t('pharmacy.unitPrice')}
                value={money(unitPrice, currency) ?? t('pharmacy.priceUnavailable')}
              />
              <SummaryLine
                label={t('pharmacy.quantity')}
                value={[t('pharmacy.reservationQuantity', { count: quantity }), packSize]
                  .filter(Boolean)
                  .join(' · ')}
              />
              <View style={styles.totalRow}>
                <Text style={styles.total}>
                  {money(totalPrice, currency) ?? t('pharmacy.priceUnavailable')}
                </Text>
              </View>
              <View style={styles.infoStrip}>
                <Icon name="info" size={18} color={colors.blue} />
                <Text style={styles.infoText}>{t('pharmacy.paymentNote')}</Text>
              </View>
            </Card>

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
                  <Text style={styles.body}>
                    {[
                      [
                        t('pharmacy.reservationQuantity', { count: confirmed.quantity }),
                        confirmed.pack_size,
                      ]
                        .filter(Boolean)
                        .join(' · '),
                      money(confirmed.total_price, confirmed.currency),
                      confirmed.expires_at
                        ? t('pharmacy.reservationExpires', {
                            when: formatDateTime(confirmed.expires_at),
                          })
                        : null,
                    ]
                      .filter(Boolean)
                      .join('  ·  ')}
                  </Text>
                  <View style={styles.outcomeActions}>
                    <MedButton
                      label={t('pharmacy.reservationsTitle')}
                      icon="receipt"
                      variant="secondary"
                      size="sm"
                      onPress={() => router.push('/pharmacy')}
                      style={styles.outcomeAction}
                    />
                    {confirmed.is_cancellable ? (
                      <MedButton
                        label={t('pharmacy.reservationCancel')}
                        icon="close"
                        variant="ghost"
                        size="sm"
                        disabled={cancelReservation.isPending}
                        onPress={() => confirmCancel(confirmed)}
                        style={styles.outcomeAction}
                      />
                    ) : null}
                  </View>
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

              {disabledReason ? <Text style={styles.disabledReason}>{disabledReason}</Text> : null}

              <View style={styles.secondaryActions}>
                {phone ? (
                  <MedButton
                    label={t('pharmacy.callPharmacy')}
                    icon="phone"
                    variant="secondary"
                    onPress={() => callPharmacy(pharmacy?.name, phone)}
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

            {loadedAt > 0 ? <LastUpdatedLine loadedAt={new Date(loadedAt)} /> : null}

            <View style={styles.notice} accessibilityRole="summary">
              <Icon name="shield-check" size={20} color={colors.blue} />
              <View style={styles.noticeBody}>
                <Text style={styles.noticeTitle}>{t('pharmacy.safetyTitle')}</Text>
                <Text style={styles.noticeText}>{t('pharmacy.safetyBody')}</Text>
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

/** Name, brand, generic, strength/form, Rx/controlled badges, price, fact cells. */
function IdentityCard({ medicine }: { medicine: Medicine }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { price_min: min, price_max: max, currency, pharmacy_count: count, is_available } =
    medicine.availability;

  // See the header note: with no reporting pharmacy behind it, this range is
  // the catalogue's own reference price, not a quote — so it is labelled as
  // such rather than presented as what somebody charges.
  const reportedPrice = count > 0;
  const priceLabel =
    min === null && max === null
      ? null
      : min !== null && max !== null && min !== max
        ? t('pharmacy.priceRangeValue', { min: formatXafBare(min), max: money(max, currency) })
        : money(min ?? max, currency);

  const strengthForm =
    medicine.strength && medicine.form
      ? t('pharmacy.strengthForm', { strength: medicine.strength, form: medicine.form })
      : (medicine.strength ?? medicine.form ?? null);

  const categoryLabel = t(`pharmacy.categories.${medicine.category}`, {
    defaultValue: medicine.category_label,
  });

  const sameAsName = (value: string | null) =>
    !!value && value.trim().toLowerCase() === medicine.name.trim().toLowerCase();

  return (
    <Card>
      <View style={styles.identity}>
        <TintCircle
          icon={CATEGORY_ICONS[medicine.category_icon] ?? 'pill'}
          tint={medicine.is_controlled ? 'amber' : 'blue'}
          size={72}
          square
        />
        <View style={styles.identityBody}>
          <Text style={styles.drugName} numberOfLines={3}>
            {medicine.name}
          </Text>
          {medicine.generic_name && !sameAsName(medicine.generic_name) ? (
            <Text style={styles.drugForm}>
              {t('pharmacy.generic', { name: medicine.generic_name })}
            </Text>
          ) : null}
          {medicine.brand_name && !sameAsName(medicine.brand_name) ? (
            <Text style={styles.drugForm}>
              {t('pharmacy.brand', { name: medicine.brand_name, defaultValue: 'Brand: {{name}}' })}
            </Text>
          ) : null}
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
          {/* Omitted entirely when the catalogue carries no price at all —
              a labelled blank teaches nothing. */}
          {priceLabel ? (
            <>
              <Text style={styles.asideLabel}>
                {reportedPrice
                  ? t('pharmacy.priceRange')
                  : t('pharmacy.priceIndicative', { defaultValue: 'Catalogue price' })}
              </Text>
              <Text style={styles.asideValue}>{priceLabel}</Text>
            </>
          ) : null}
          <Text style={[styles.asideLabel, priceLabel ? styles.asideLabelSpaced : null]}>
            {t('pharmacy.pharmaciesStocking')}
          </Text>
          <Text
            style={[
              styles.asideValue,
              { color: is_available ? colors.statusNormal : colors.textSecondary },
            ]}
            numberOfLines={3}
          >
            {is_available
              ? t('pharmacy.pharmacyCount', { count })
              : t('pharmacy.notReported', { defaultValue: 'Not reported' })}
          </Text>
        </View>
      </View>

      {/* The national figure needs its scope said out loud, once. */}
      <Text style={styles.identityFootnote}>
        {t('pharmacy.catalogueScopeHint', {
          defaultValue:
            'Availability counts every pharmacy in the national directory that reports stock — not only those near you.',
        })}
      </Text>

      <View style={styles.identityFacts}>
        <FactCell
          icon="capsule"
          label={t('opesMeds.detail.dose')}
          value={medicine.strength ?? '—'}
          align="center"
        />
        <FactCell
          icon="pill"
          label={t('pharmacy.form')}
          value={medicine.form ?? '—'}
          align="center"
          divided
        />
        <FactCell
          icon="grid"
          label={t('pharmacy.category')}
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

/**
 * One stocking pharmacy in the picker: stock badge, price, distance, hours,
 * verification, pack count AND — always, never traded away for the pack count
 * — when the pharmacy last reported this medicine.
 */
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

  const stock = pharmacy.stock;
  const price = money(stock?.unit_price, stock?.currency);
  const stockLabel = stock
    ? t(`pharmacy.stock.${stock.status}`, { defaultValue: stock.status_label })
    : t('pharmacy.stock.unknown');
  const fresh = freshness(stock, t);

  const packs =
    stock?.packs_available !== null && stock?.packs_available !== undefined
      ? t('pharmacy.packsLeft', { count: stock.packs_available })
      : null;

  return (
    <ListRow
      leading={<TintCircle icon={selected ? 'check' : 'store'} tint={selected ? 'green' : 'blue'} />}
      title={pharmacy.name}
      meta={[
        t('pharmacy.distanceKm', { km: pharmacy.distance_km }),
        hoursLine(pharmacy, t),
        verificationLine(pharmacy.verification_status, t),
        [packs, stock?.pack_size].filter(Boolean).join(' · ') || null,
        fresh.line,
      ]}
      trailing={
        <View style={styles.rowAside}>
          {price ? (
            <Text style={styles.rowPrice} numberOfLines={1}>
              {price}
            </Text>
          ) : null}
          <StatusBadge
            status={stock?.status ?? 'unknown'}
            tone={stockTone(stock?.status)}
            label={stockLabel}
            size="sm"
          />
          {fresh.stale ? (
            <Text style={styles.rowStale} numberOfLines={1}>
              {t('pharmacy.stockOld', { defaultValue: 'Old report' })}
            </Text>
          ) : null}
        </View>
      }
      chevron={false}
      divider={divider}
      onPress={onPress}
      style={selected ? styles.selectedRow : undefined}
      accessibilityLabel={[
        pharmacy.name,
        stockLabel,
        price,
        t('pharmacy.distanceKm', { km: pharmacy.distance_km }),
        fresh.line,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={selected ? t('pharmacy.selectedPharmacy') : t('pharmacy.reserveHere')}
    />
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

/* ── Styles ───────────────────────────────────────────────────────────────── */

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.page },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
    stack: { gap: spacing.md },

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
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
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

    chipRail: { marginHorizontal: -spacing.md, marginBottom: spacing.sm + 2 },
    chipRailContent: { paddingHorizontal: spacing.md, gap: spacing.sm, alignItems: 'center' },

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
    identityFootnote: {
      marginTop: spacing.sm + 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
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

    rowAside: { alignItems: 'flex-end', gap: 4, maxWidth: 128 },
    rowPrice: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.link,
    },
    rowStale: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.statusWarning,
    },

    pharmacyName: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: c.textPrimary,
      marginBottom: 2,
    },
    stockFacts: {
      marginTop: spacing.sm + 2,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: c.divider,
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

    fieldLabel: {
      marginTop: spacing.md,
      marginBottom: 6,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: c.textPrimary,
    },
    noteInput: {
      minHeight: 76,
      textAlignVertical: 'top',
      padding: spacing.sm + 2,
      borderRadius: radii.md,
      borderWidth: 1.4,
      borderColor: c.border,
      backgroundColor: c.surface,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textPrimary,
      marginBottom: 6,
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
    outcomeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
    outcomeAction: { flexGrow: 1 },

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
