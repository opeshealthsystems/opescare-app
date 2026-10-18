import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Linking,
  RefreshControl,
  ScrollView,
  Text,
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
  useDialog,
  useTheme,
  type IconName,
} from '@/components/opes-ui';
import { MedButton } from '@/components/meds/shared';
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
import { useMedicineCatalog } from '@/lib/api/pharmacyQueries';
import {
  City,
  CITIES,
  RADIUS_OPTIONS,
  NEARBY_PREVIEW,
  NEARBY_API_LIMIT,
  CATALOG_PAGE_SIZE,
  MAX_OPEN_HOLDS,
  CATEGORY_ICONS,
  FALLBACK_CATEGORY_ICON,
  CATEGORY_TINTS,
  FALLBACK_CATEGORY_TINT,
  SheetKey,
  RxFilter,
} from '@/components/pharmacy/list/helpers';
import {
  SearchField,
  DropPill,
  CategoryTile,
  OptionCard,
  LoadingBlock,
  NoticeStrip,
  MedicineRow,
  PharmacyRow,
  HoldCard,
} from '@/components/pharmacy/list/parts';
import { makeStyles } from '@/components/pharmacy/list/styles';

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
