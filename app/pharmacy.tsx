import {
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, LastUpdatedLine, ScreenHeader } from '@/components/opes-ui';
import {
  CATEGORY_ICONS,
  FALLBACK_CATEGORY_ICON,
  CATEGORY_TINTS,
  FALLBACK_CATEGORY_TINT,
} from '@/components/pharmacy/list/helpers';
import { SearchField, DropPill, CategoryTile } from '@/components/pharmacy/list/parts';
import { usePharmacyList } from '@/components/pharmacy/list/usePharmacyList';
import { FilterSheets, HoldsSection, CatalogueSection, NearbySection } from '@/components/pharmacy/list/sections';

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
  const vm = usePharmacyList();
  const {
    t,
    colors,
    styles,
    dialog,
    term,
    setTerm,
    category,
    setCategory,
    city,
    radiusKm,
    openNowOnly,
    sheet,
    setSheet,
    refreshing,
    categories,
    activeFilterCount,
    loadedAt,
    goBack,
    onRefresh,
    headerActions,
  } = vm;

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

        <FilterSheets vm={vm} />

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

        <HoldsSection vm={vm} />

        <CatalogueSection vm={vm} />

        <NearbySection vm={vm} />

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
