import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useDialog, useTheme, type IconName } from '@/components/opes-ui';
import {
  useCancelMedicineReservation,
  useMedicineCategories,
  useMedicineReservations,
  useNearbyPharmacies,
  type MedicineCategoryValue,
  type MedicineReservation,
} from '@/lib/api/queries';
import { useMedicineCatalog } from '@/lib/api/pharmacyQueries';
import {
  City,
  CITIES,
  NEARBY_API_LIMIT,
  CATALOG_PAGE_SIZE,
  MAX_OPEN_HOLDS,
  SheetKey,
  RxFilter,
} from '@/components/pharmacy/list/helpers';
import { makeStyles } from '@/components/pharmacy/list/styles';

/**
 * State, queries and derived data for the Medicine Finder screen
 * (app/pharmacy.tsx). Extracted verbatim from the screen component.
 */
export function usePharmacyList() {
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

  return {
    t,
    router,
    colors,
    styles,
    dialog,
    term,
    setTerm,
    debouncedTerm,
    setDebouncedTerm,
    category,
    setCategory,
    rxFilter,
    setRxFilter,
    reportedOnly,
    setReportedOnly,
    city,
    setCity,
    radiusKm,
    setRadiusKm,
    openNowOnly,
    setOpenNowOnly,
    sheet,
    setSheet,
    reservationsOpen,
    setReservationsOpen,
    showAllPharmacies,
    setShowAllPharmacies,
    refreshing,
    setRefreshing,
    categories,
    catalog,
    reservations,
    cancelReservation,
    openHolds,
    pharmacies,
    results,
    total,
    shownResults,
    resultsTruncated,
    allPharmacyRows,
    pharmacyRows,
    pharmaciesTruncated,
    filtersActive,
    activeFilterCount,
    hasMappable,
    atHoldCap,
    loadedAt,
    openMedicine,
    clearFilters,
    goBack,
    onRefresh,
    confirmCancel,
    callPharmacy,
    headerActions,
  };
}

export type PharmacyListModel = ReturnType<typeof usePharmacyList>;
