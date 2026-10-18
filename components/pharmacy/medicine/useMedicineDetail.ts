import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Linking, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatDateTime, useDialog, useTheme } from '@/components/opes-ui';
import {
  useCancelMedicineReservation,
  useMedicine,
  useMedicineReservations,
  useNearbyPharmacies,
  usePrescriptionsForReservation,
  useReserveMedicine,
  type MedicineReservation,
} from '@/lib/api/queries';
import { reserveErrorCode } from '@/lib/api/pharmacyQueries';
import {
  MAX_OPEN_HOLDS,
  MAX_NOTE_LENGTH,
  RADIUS_LADDER,
  STOCK_STALE_DAYS,
  numberParam,
  money,
  freshness,
  callablePhone,
  prescriptionUnusable,
} from '@/components/pharmacy/medicine/helpers';
import { makeStyles } from '@/components/pharmacy/medicine/styles';

/**
 * State, queries, effects and derived data for the medicine detail screen
 * (app/pharmacy/[medicineId].tsx). Extracted verbatim from the screen
 * component; the values that followed its early return are pure, so computing
 * them here on every render changes nothing.
 */
export function useMedicineDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    medicineId?: string;
    pharmacyId?: string;
    lat?: string;
    lng?: string;
    radiusKm?: string;
    /** Name of the origin the finder searched from, for MED-02's location cell. */
    city?: string;
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
  /** MED-02 draws the radius as a dropdown, so its panel opens and closes. */
  const [radiusOpen, setRadiusOpen] = useState(false);

  // MED-03's "View comparison" link jumps to the pharmacy list rather than
  // opening a screen there is no route for. The list's Y comes from its own
  // onLayout, which is already relative to the scroll content container.
  const scrollRef = useRef<ScrollView>(null);
  const pharmacyListY = useRef(0);
  const mapY = useRef(0);
  const jumpToPharmacies = () =>
    scrollRef.current?.scrollTo({ y: Math.max(0, pharmacyListY.current - 8), animated: true });
  /** "Directions" shows the in-app map — this app never hands off to a maps app. */
  const jumpToMap = () =>
    scrollRef.current?.scrollTo({ y: Math.max(0, mapY.current - 8), animated: true });

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
    setRadiusOpen(false);
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
      ]
        .filter(Boolean)
        .join('\n')
        // Blank line before the money statement — `filter(Boolean)` above would
        // have swallowed an empty entry, so the spacer is appended here.
        .concat('\n\n', t('pharmacy.paymentNote')),
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

  /**
   * What MED-02's "Your Location" cell says. The finder passes the name of the
   * city it searched from; a deep link that skips it leaves only coordinates,
   * and coordinates are what this screen actually searched — so they are shown
   * rather than a city guessed from them.
   */
  const originLabel = params.city?.trim() || `${lat.toFixed(3)}, ${lng.toFixed(3)}`;

  /** "Is it on a shelf?" — this counter's answer when there is one, else the
   *  national one. Never the two mixed together. */
  const stockHere = stock ? stock.is_available : medicine.data?.availability.is_available === true;

  // Layout handlers for the scroll anchors. They live beside the refs they
  // write, because a section component may not mutate a ref it receives.
  const onPharmacyListLayout = (e: { nativeEvent: { layout: { y: number } } }) =>
    (pharmacyListY.current = e.nativeEvent.layout.y);
  const onMapLayout = (e: { nativeEvent: { layout: { y: number } } }) =>
    (mapY.current = e.nativeEvent.layout.y);

  return {
    t,
    router,
    colors,
    styles,
    dialog,
    insets,
    params,
    medicineId,
    lat,
    lng,
    radiusKm,
    setRadiusKm,
    nextRadiusKm,
    pharmacyId,
    setPharmacyId,
    packSize,
    setPackSize,
    quantity,
    setQuantity,
    note,
    setNote,
    prescriptionId,
    setPrescriptionId,
    prescriptionListOpen,
    setPrescriptionListOpen,
    confirmed,
    setConfirmed,
    errorCode,
    setErrorCode,
    refreshing,
    setRefreshing,
    radiusOpen,
    setRadiusOpen,
    scrollRef,
    pharmacyListY,
    mapY,
    jumpToPharmacies,
    jumpToMap,
    medicine,
    pharmacies,
    reserve,
    cancelReservation,
    needsPrescription,
    prescriptions,
    reservations,
    allOpenHolds,
    existingHolds,
    atHoldCap,
    pharmacyRows,
    withoutStockRow,
    pharmacy,
    stock,
    unitPrice,
    totalPrice,
    currency,
    reservationEnabled,
    heldHere,
    stockFreshness,
    packMismatch,
    chosenPrescription,
    canReserve,
    goBack,
    changeRadius,
    onRefresh,
    placeReservation,
    confirmReserve,
    confirmCancel,
    callPharmacy,
    disabledReason,
    phone,
    loadedAt,
    originLabel,
    stockHere,
    onPharmacyListLayout,
    onMapLayout,
  };
}

export type MedicineDetailModel = ReturnType<typeof useMedicineDetail>;
