import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Card,
  EmptyState,
  Icon,
  ScreenHeader,
  StaleNotice,
  spacing,
} from '@/components/opes-ui';
import { money } from '@/components/pharmacy/medicine/helpers';
import { IdentityCard, AccentButton } from '@/components/pharmacy/medicine/parts';
import { useMedicineDetail } from '@/components/pharmacy/medicine/useMedicineDetail';
import { HoldsAndSearchSection, PharmacyListSection, ChosenPharmacySection, PricingAndAboutSection, QuantityAndPrescriptionSection, SummaryAndOutcomeSection, InfoPanelsSection } from '@/components/pharmacy/medicine/sections';

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
  const vm = useMedicineDetail();
  const {
    t,
    router,
    colors,
    styles,
    dialog,
    insets,
    medicineId,
    packSize,
    refreshing,
    scrollRef,
    medicine,
    reserve,
    allOpenHolds,
    totalPrice,
    currency,
    canReserve,
    goBack,
    onRefresh,
    confirmReserve,
  } = vm;

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

            <HoldsAndSearchSection vm={vm} />

            <PharmacyListSection vm={vm} />

            <ChosenPharmacySection vm={vm} />

            <PricingAndAboutSection vm={vm} />

            <QuantityAndPrescriptionSection vm={vm} />

            <SummaryAndOutcomeSection vm={vm} />

            <InfoPanelsSection vm={vm} />
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
