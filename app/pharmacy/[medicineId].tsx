import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  formatDate,
  formatDateTime,
  spacing,
  useDialog,
  useTheme,
} from '@/components/opes-ui';
import { CardOverline, MedButton } from '@/components/meds/shared';
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
} from '@/lib/api/queries';
import { formatXafBare, reserveErrorCode } from '@/lib/api/pharmacyQueries';
import {
  MAX_QUANTITY,
  MAX_OPEN_HOLDS,
  MAX_NOTE_LENGTH,
  RADIUS_LADDER,
  STOCK_STALE_DAYS,
  RESERVATION_TONES,
  numberParam,
  stockTone,
  money,
  verificationLine,
  hoursLine,
  freshness,
  callablePhone,
  prescriptionStatusLabel,
  prescriptionUnusable,
} from '@/components/pharmacy/medicine/helpers';
import {
  WHY_ICONS,
  HOW_ICONS,
  IdentityCard,
  PharmacyOptionRow,
  AccentButton,
  StockMeter,
  TableCell,
  NoticeStrip,
  StepperButton,
  SummaryLine,
} from '@/components/pharmacy/medicine/parts';
import { makeStyles } from '@/components/pharmacy/medicine/styles';

/**
 * Medicine Availability — the drill-in from the Medicine Finder.
 *
 * Presentation follows three renders in `reference/medicine/`:
 *   MED-02 `a_full_screen_mobile_app_ui_screenshot_clean_heal.png` — medicine
 *     card, green availability strip, location / radius row, "Nearest
 *     pharmacies (N)" with a sort control, pharmacy rows whose actions are a
 *     stacked column, the prescription panel, the privacy panel.
 *   MED-03 `a_clean_modern_mobile_app_ui_screenshot_iphone_l.png` — the
 *     selected-pharmacy card with its actions, the "Availability & Pricing"
 *     three-up, "About This Medicine" with a Form / Strength / Category table
 *     beside an amber "Important" panel, "Choose Pack Size" as a four-up,
 *     "Why prices may vary", and a sticky Total + Reserve footer.
 *   MED-04 `a_full_screen_mobile_app_ui_screenshot_clean_whit.png` — the
 *     four-step "How to get your medicine" strip with chevrons between steps.
 *
 * Green is the medicine accent throughout, as in the renders.
 *
 * ── 375pt COMPROMISES (the renders are drawn at ~430pt) ────────────────────
 *  • MED-04 is drawn as two columns — the pharmacy list on one side, the
 *    selected-pharmacy panel on the other. That split IS this app's
 *    navigation: /pharmacy is the list, this screen is the panel. Everything
 *    on the right-hand side of the render is carried here, single column.
 *  • The medicine card's right-hand column (availability / price range / pack
 *    size) becomes a full-width tier under the name, which otherwise loses to
 *    it — `Rifampicin + Isoniazid + Pyrazinamide + Ethambutol 150/75/400/275mg
 *    Tablet` needs three lines at 375pt on its own.
 *  • A pharmacy row's three stacked actions sit under the row rather than
 *    beside it: mark + name + a 130pt button column does not fit in 343pt.
 *  • MED-03 puts the Form/Strength/Use table BESIDE the amber "Important"
 *    panel. Here they stack: the table alone needs the full width.
 *  • "Why prices may vary" is a 2×2 grid, not a four-up: four columns of
 *    explanatory text at 375pt would be ~75pt per column.
 *  • "How to get your medicine" keeps the render's horizontal strip with
 *    chevrons, but scrolls horizontally — four legible steps do not fit in
 *    343pt, and shrinking them to fit makes the body text unreadable.
 *  • The render's SHARE / SAVE / bookmark / "Add to List" / "Notify Me" /
 *    "Website" controls have nothing behind them in this API — there is no
 *    save-list, no back-in-stock subscription and no website field on
 *    `NearbyPharmacy` — so they are not drawn. A button that does nothing is
 *    worse than an absent one.
 *  • Pharmacy PHOTOS are not in any payload either; each row carries a tinted
 *    storefront mark instead of a fabricated shopfront.
 *  • MED-03 tints the prescription panel purple. This project's brand rule is
 *    "never purple", and MED-02 draws the same panel amber, so amber it is.
 *
 * Data layer is untouched: `useMedicine`, `useNearbyPharmacies`,
 * `useReserveMedicine`, `useCancelMedicineReservation`,
 * `useMedicineReservations`, `usePrescriptionsForReservation`. The reserve
 * flow still runs through the kit `Dialog` confirmation.
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

export default function MedicineDetailScreen() {
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

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={t('pharmacy.detailTitle')}
        subtitle={t('pharmacy.detailSubtitle')}
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
        ref={scrollRef}
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

            {/* MED-02's green information strip, immediately under the card. */}
            <View style={styles.freshStrip} accessibilityRole="summary">
              <Icon name="info" size={18} color={colors.statusNormal} />
              <Text style={styles.freshStripText}>{t('pharmacy.availabilityChanges')}</Text>
            </View>

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

            {/* MED-02's two-up: "Your Location [Change]" | "Search Radius ▾".
                The origin is not editable here — the city picker lives on the
                finder — so "Change" goes back to it rather than opening a
                second picker that would have to be kept in step. The radius IS
                adjustable here: stock is sparse, and "nothing within 10 km"
                must offer a wider search rather than dead-ending. */}
            <View style={styles.searchRow}>
              <View style={styles.searchCell}>
                <View style={styles.searchCellHead}>
                  <Icon name="location" size={15} color={colors.textMuted} />
                  <Text style={styles.searchCellLabel}>{t('pharmacy.yourLocation')}</Text>
                </View>
                <View style={styles.searchCellFoot}>
                  <Text style={styles.searchCellValue} numberOfLines={1}>
                    {originLabel}
                  </Text>
                  <TouchableOpacity
                    onPress={goBack}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={t('pharmacy.changeLocation')}
                    style={styles.searchCellButton}
                  >
                    <Text style={styles.searchCellButtonText}>{t('pharmacy.change')}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setRadiusOpen((open) => !open)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{ expanded: radiusOpen }}
                accessibilityLabel={`${t('pharmacy.radiusPickerTitle')}: ${t('pharmacy.radius', { km: radiusKm })}`}
                style={styles.searchCell}
              >
                <View style={styles.searchCellHead}>
                  <Icon name="target" size={15} color={colors.textMuted} />
                  <Text style={styles.searchCellLabel}>{t('pharmacy.radiusPickerTitle')}</Text>
                </View>
                <View style={styles.searchCellFoot}>
                  <Text style={styles.searchCellValue} numberOfLines={1}>
                    {t('pharmacy.radius', { km: radiusKm })}
                  </Text>
                  <Icon
                    name={radiusOpen ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.textMuted}
                  />
                </View>
              </TouchableOpacity>
            </View>

            {radiusOpen ? (
              <Card variant="flush">
                {RADIUS_LADDER.map((km, index) => (
                  <ListRow
                    key={km}
                    title={t('pharmacy.radius', { km })}
                    trailing={
                      km === radiusKm ? (
                        <Icon name="check" size={18} color={colors.blue} />
                      ) : undefined
                    }
                    chevron={false}
                    divider={index < RADIUS_LADDER.length - 1}
                    onPress={() => changeRadius(km)}
                  />
                ))}
              </Card>
            ) : null}

            {/* -- Nearest pharmacies --------------------------------------- */}
            <View onLayout={(e) => (pharmacyListY.current = e.nativeEvent.layout.y)}>
              {/* MED-02's "Nearest Pharmacies (8)" with a sort control on the
                  right. Static, not a dropdown: /mobile/pharmacy/nearby orders
                  by distance and offers nothing else to switch to. */}
              <View style={styles.listHead}>
                <Text style={styles.listHeadTitle} accessibilityRole="header" numberOfLines={1}>
                  {pharmacies.isSuccess
                    ? t('pharmacy.nearestPharmacies', { count: pharmacyRows.length })
                    : t('pharmacy.pharmaciesStocking')}
                </Text>
                <View style={styles.sortPill}>
                  <Icon name="arrow-down" size={13} color={colors.textMuted} />
                  <Text style={styles.sortPillText}>{t('pharmacy.sortByDistance')}</Text>
                </View>
              </View>
              <Text style={styles.sectionHint}>
                {t('pharmacy.pharmaciesStockingHint')}
                {'\n'}
                {t('pharmacy.stockProvenance', {
                  defaultValue:
                    'Stock levels and prices are reported by each pharmacy, not measured by OpesCare.',
                })}
              </Text>

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
                  {/* Nearby pharmacies are separate places to compare and
                      choose between, so each gets its own card and the gap
                      does the separating. */}
                  <ResultList>
                    {pharmacyRows.map((row) => (
                      <Card key={row.id} variant="flush">
                        <PharmacyOptionRow
                          pharmacy={row}
                          selected={pharmacy?.id === row.id}
                          divider={false}
                          onSelect={() => {
                            setPharmacyId(row.id);
                            setPackSize(null);
                            setConfirmed(null);
                            setErrorCode(null);
                          }}
                          onCall={(number) => callPharmacy(row.name, number)}
                        />
                      </Card>
                    ))}
                  </ResultList>
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

                {/* MED-03/MED-04's action row on the selected pharmacy. The
                    render's third control is a bookmark (MED-03) or "Website"
                    (MED-04); neither exists — there is no saved-pharmacy list
                    and `NearbyPharmacy` carries no URL — so the slot holds the
                    directory link this app really has. "Directions" scrolls to
                    the in-app map below rather than handing off to an external
                    maps app the CSP would block. */}
                <View style={styles.pharmacyActions}>
                  <AccentButton
                    label={t('pharmacy.getDirections')}
                    icon="send"
                    variant="outline"
                    disabled={pharmacy.latitude == null || pharmacy.longitude == null}
                    onPress={jumpToMap}
                    style={styles.pharmacyAction}
                  />
                  <AccentButton
                    label={t('pharmacy.callPharmacy')}
                    icon="phone"
                    variant="outline"
                    disabled={!phone}
                    onPress={() => phone && callPharmacy(pharmacy.name, phone)}
                    style={styles.pharmacyAction}
                  />
                  <AccentButton
                    label={t('pharmacy.viewPharmacy')}
                    icon="store"
                    variant="outline"
                    onPress={() =>
                      router.push({ pathname: '/facility/[id]', params: { id: pharmacy.id } })
                    }
                    style={styles.pharmacyAction}
                  />
                </View>

                <View style={styles.stockFacts}>
                  <SummaryLine
                    label={t('pharmacy.unitPrice')}
                    value={money(stock.unit_price, stock.currency) ?? t('pharmacy.priceUnavailable')}
                  />
                  {stock.pack_size ? (
                    <SummaryLine
                      label={t('pharmacy.packSizeLabel', { defaultValue: 'Pack size' })}
                      value={stock.pack_size}
                    />
                  ) : null}
                  {stock.packs_available !== null ? (
                    <SummaryLine
                      label={t('pharmacy.packsOnShelf', { defaultValue: 'Packs reported' })}
                      value={t('pharmacy.packsAvailable', { count: stock.packs_available })}
                    />
                  ) : null}
                  {/* Always present: a pack count is not a substitute for a date. */}
                  <SummaryLine
                    label={t('pharmacy.lastReported', { defaultValue: 'Last reported' })}
                    value={stockFreshness.date}
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
              <View onLayout={(e) => (mapY.current = e.nativeEvent.layout.y)}>
                <Card variant="flush">
                  <FacilityMap facilities={pharmacy} height={180} directions variant="thumbnail" />
                </Card>
              </View>
            ) : null}

            {/* MED-03's "Availability & Pricing" three-up: what is on the
                shelf HERE, what it costs HERE, and the range to compare it
                against. When no pharmacy has been chosen the first two cells
                fall back to the national figures and say so — they are never
                presented as a quote from a counter nobody picked. */}
            <Card>
              <SectionHeader title={t('pharmacy.pricingTitle')} />
              <View style={styles.pricingRow}>
                <View style={styles.pricingCell}>
                  <Icon
                    name={stockHere ? 'check-circle' : 'info'}
                    size={18}
                    color={stockHere ? colors.statusNormal : colors.textMuted}
                  />
                  <Text style={styles.pricingLabel}>
                    {stock ? t('pharmacy.stockAtPharmacy') : t('pharmacy.pricingStock')}
                  </Text>
                  <Text
                    style={[
                      styles.pricingValue,
                      { color: stockHere ? colors.statusNormal : colors.textMuted },
                    ]}
                  >
                    {stock
                      ? t(`pharmacy.stock.${stock.status}`, { defaultValue: stock.status_label })
                      : medicine.data.availability.is_available
                        ? t('pharmacy.pricingInStock')
                        : t('pharmacy.pricingNotReported')}
                  </Text>
                  {stock ? <StockMeter status={stock.status} /> : null}
                  {/* Never rendered as 0 when the pharmacy reported no count. */}
                  {stock?.packs_available != null ? (
                    <Text style={styles.pricingSub}>
                      {t('pharmacy.packsAvailable', { count: stock.packs_available })}
                    </Text>
                  ) : null}
                </View>

                {/* The render's middle cell is the price at THIS counter. With
                    no pharmacy chosen there is no such price, and the
                    catalogue's own figure is not one — so the cell carries the
                    national reporting count instead of a blank. */}
                {stock ? (
                  <View style={[styles.pricingCell, styles.pricingCellDivided]}>
                    <Icon name="wallet" size={18} color={colors.statusNormal} />
                    <Text style={styles.pricingLabel}>{t('pharmacy.pricingHere')}</Text>
                    <Text style={[styles.pricingValue, { color: colors.statusNormal }]}>
                      {money(stock.unit_price, stock.currency) ?? t('pharmacy.priceUnavailable')}
                    </Text>
                    {stock.pack_size ? (
                      <Text style={styles.pricingSub}>
                        {t('pharmacy.pricePerPack', { size: stock.pack_size })}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <View style={[styles.pricingCell, styles.pricingCellDivided]}>
                    <Icon name="store" size={18} color={colors.blue} />
                    <Text style={styles.pricingLabel}>{t('pharmacy.pricingPharmacies')}</Text>
                    <Text style={[styles.pricingValue, { color: colors.blue }]}>
                      {medicine.data.availability.pharmacy_count}
                    </Text>
                  </View>
                )}

                <View style={[styles.pricingCell, styles.pricingCellDivided]}>
                  <Icon name="bar-chart" size={18} color={colors.blue} />
                  <Text style={styles.pricingLabel}>{t('pharmacy.pricingRange')}</Text>
                  <Text style={[styles.pricingValue, { color: colors.blue }]}>
                    {medicine.data.availability.price_min !== null &&
                    medicine.data.availability.price_max !== null
                      ? `${formatXafBare(medicine.data.availability.price_min)} – ${formatXafBare(
                          medicine.data.availability.price_max,
                        )}`
                      : t('pharmacy.pricingUnknown')}
                  </Text>
                  {pharmacyRows.length > 1 ? (
                    <TouchableOpacity
                      onPress={jumpToPharmacies}
                      activeOpacity={0.7}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={t('pharmacy.viewComparison')}
                      style={styles.pricingLinkRow}
                    >
                      <Text style={styles.pricingLink}>{t('pharmacy.viewComparison')}</Text>
                      <Icon name="chevron-right" size={13} color={colors.link} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
              <Text style={styles.pricingNote}>{t('pharmacy.pricingNote')}</Text>
              <Text style={styles.pricingNote}>
                {t('pharmacy.catalogueScopeHint', {
                  defaultValue:
                    'Availability counts every pharmacy in the national directory that reports stock — not only those near you.',
                })}
              </Text>
            </Card>

            {/* MED-03's "About This Medicine": the description, a Form /
                Strength / Category table, and the amber "Important" panel.
                The render labels its third column "Use"; the payload has no
                such field, so the column carries the medicine's category and
                is labelled as the category. */}
            <Card>
              <CardOverline title={t('pharmacy.aboutMedicine')} />
              <Text style={styles.body}>
                {medicine.data.description ?? t('pharmacy.noDescription')}
              </Text>

              {medicine.data.indications.length > 0 ? (
                <View style={styles.tagRow}>
                  {medicine.data.indications.map((tag) => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText} numberOfLines={1}>
                        {tag}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.aboutTable}>
                <TableCell label={t('pharmacy.form')} value={medicine.data.form ?? '—'} />
                <TableCell
                  label={t('pharmacy.strength')}
                  value={medicine.data.strength ?? '—'}
                  divided
                />
                <TableCell
                  label={t('pharmacy.category')}
                  value={t(`pharmacy.categories.${medicine.data.category}`, {
                    defaultValue: medicine.data.category_label,
                  })}
                  divided
                />
              </View>

              <View style={styles.important}>
                <View style={styles.importantHead}>
                  <Icon name="alert-triangle" size={16} color={colors.statusWarning} />
                  <Text style={styles.importantTitle}>{t('pharmacy.importantTitle')}</Text>
                </View>
                <Text style={styles.importantBody}>{t('pharmacy.importantBody')}</Text>
                {medicine.data.is_controlled ? (
                  <Text style={styles.importantBody}>{t('pharmacy.controlled')}</Text>
                ) : null}
              </View>
            </Card>

            {/* MED-03's "Choose Pack Size" four-up. Each tile shows the size
                over its price — but ONLY the pack the chosen pharmacy actually
                quoted has a price. Multiplying that figure up to a bigger box
                would be inventing a quote nobody gave, so the other tiles show
                an em dash and say why to a screen reader. */}
            {medicine.data.pack_size_options.length > 0 ? (
              <Card>
                <CardOverline title={t('pharmacy.choosePackSize')} />
                <View style={styles.packGrid}>
                  {medicine.data.pack_size_options.map((option) => {
                    const quoted =
                      stock?.pack_size === option ? money(stock.unit_price, stock.currency) : null;
                    const on = option === packSize;
                    return (
                      <TouchableOpacity
                        key={option}
                        onPress={() => setPackSize(option)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={[option, quoted ?? t('pharmacy.priceNotQuoted')].join(', ')}
                        style={[
                          styles.packTile,
                          on && {
                            borderColor: colors.statusNormal,
                            backgroundColor: colors.statusNormalBg,
                          },
                        ]}
                      >
                        <Text
                          style={[styles.packSizeText, on && { color: colors.statusNormal }]}
                          numberOfLines={2}
                        >
                          {option}
                        </Text>
                        <Text style={styles.packPriceText} numberOfLines={1}>
                          {quoted ?? '—'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
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

            {/* -- Prescription — business logic, not an error ----------------
                MED-02 draws this as an amber panel with an Rx mark; MED-03
                draws the same panel purple, which this project's brand rule
                forbids, so amber wins. There is exactly ONE of these on the
                screen — the render's "Upload Prescription" is this app's
                "Attach a prescription", since prescriptions already live in
                the record and nothing here uploads a file. */}
            {needsPrescription ? (
              <Card style={styles.rxCard}>
                <View style={styles.rxHead}>
                  <View style={styles.rxMark}>
                    <Icon name="document-text" size={22} color={colors.statusWarning} />
                  </View>
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
              {/* Never leave the sticky footer's dead CTA unexplained. */}
              {disabledReason ? (
                <Text style={styles.disabledReason}>{disabledReason}</Text>
              ) : null}
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

            {/* MED-03's "Why prices may vary" four-up, as a 2×2 at 375pt:
                explanation, not data. The same medicine legitimately costs
                different amounts at different counters, and a patient
                comparing two prices deserves to know why before assuming one
                of them is wrong. */}
            <Card>
              <SectionHeader title={t('pharmacy.whyPricesTitle')} />
              <View style={styles.whyGrid}>
                {(['brand', 'pack', 'costs', 'demand'] as const).map((key) => (
                  <View key={key} style={styles.whyCell}>
                    <View style={styles.whyMark}>
                      <Icon name={WHY_ICONS[key]} size={18} color={colors.statusNormal} />
                    </View>
                    <Text style={styles.whyLabel}>{t(`pharmacy.whyPricesShort.${key}`)}</Text>
                    <Text style={styles.whyText}>{t(`pharmacy.whyPrices.${key}`)}</Text>
                  </View>
                ))}
              </View>
            </Card>

            {/* MED-04's four-step strip with chevrons between the steps. It
                scrolls sideways: four legible steps do not fit in 343pt, and
                the alternative is body text nobody can read. Numbered because
                it genuinely is a sequence, and it ends on the step the app
                cannot do for you. */}
            <Card>
              <SectionHeader title={t('pharmacy.howToTitle')} />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.howRail}
                contentContainerStyle={styles.howStrip}
              >
                {(['search', 'compare', 'reserve', 'collect'] as const).map((key, index) => (
                  <Fragment key={key}>
                    {index > 0 ? (
                      <Icon name="chevron-right" size={16} color={colors.textMuted} />
                    ) : null}
                    <View style={styles.howStep}>
                      <View style={styles.howMark}>
                        <Icon name={HOW_ICONS[key]} size={20} color={colors.statusNormal} />
                      </View>
                      <Text style={styles.howTitle} numberOfLines={2}>
                        {`${index + 1}. ${t(`pharmacy.howTo.${key}.title`)}`}
                      </Text>
                      <Text style={styles.howText}>{t(`pharmacy.howTo.${key}.body`)}</Text>
                    </View>
                  </Fragment>
                ))}
              </ScrollView>
            </Card>

            {loadedAt > 0 ? <LastUpdatedLine loadedAt={new Date(loadedAt)} /> : null}

            {/* MED-02's blue privacy panel. "Learn more" has a real
                destination here — the patient's own privacy screen. */}
            <View style={styles.notice} accessibilityRole="summary">
              <View style={styles.noticeMark}>
                <Icon name="lock" size={20} color={colors.blue} />
              </View>
              <View style={styles.noticeBody}>
                <Text style={styles.noticeTitle}>{t('pharmacy.privacyTitle')}</Text>
                <Text style={styles.noticeText}>{t('pharmacy.privacyBody')}</Text>
                <Text style={styles.noticeText}>{t('pharmacy.safetyBody')}</Text>
                <TouchableOpacity
                  onPress={() => router.push('/privacy')}
                  activeOpacity={0.7}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={t('pharmacy.learnMore')}
                  style={styles.noticeLinkRow}
                >
                  <Text style={styles.noticeLink}>{t('pharmacy.learnMore')}</Text>
                  <Icon name="chevron-right" size={14} color={colors.link} />
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* MED-03's sticky footer: the total on the left, the solid green
          "Reserve This Medicine" on the right. The render's "Add to List"
          third control has no list behind it in this API, so it is not drawn.
          The button still opens the same confirmation dialog it always did. */}
      {medicine.data ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.sm + 2) }]}>
          <View style={styles.footerTotal}>
            <Text style={styles.footerLabel} numberOfLines={1}>
              {[t('pharmacy.totalShort'), packSize].filter(Boolean).join(' · ')}
            </Text>
            <Text style={styles.footerValue} numberOfLines={1}>
              {money(totalPrice, currency) ?? t('pharmacy.priceUnavailable')}
            </Text>
          </View>
          <AccentButton
            label={t('pharmacy.reserve')}
            icon="cart"
            onPress={confirmReserve}
            loading={reserve.isPending}
            disabled={!canReserve}
            accessibilityHint={t('pharmacy.paymentNote')}
            style={styles.footerButton}
          />
        </View>
      ) : null}

      {dialog.element}
    </SafeAreaView>
  );
}
