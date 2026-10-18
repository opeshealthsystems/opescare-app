/** Large JSX sections of the Medicine Finder screen (app/pharmacy.tsx). */
import { Text, View } from 'react-native';
import {
  Card,
  EmptyState,
  Icon,
  ListRow,
  ResultList,
  SectionHeader,
  StaleNotice,
} from '@/components/opes-ui';
import { MedButton } from '@/components/meds/shared';
import { FacilityMap } from '@/components/map/FacilityMap';
import {
  CITIES,
  RADIUS_OPTIONS,
  NEARBY_PREVIEW,
  NEARBY_API_LIMIT,
  MAX_OPEN_HOLDS,
} from '@/components/pharmacy/list/helpers';
import {
  OptionCard,
  LoadingBlock,
  NoticeStrip,
  MedicineRow,
  PharmacyRow,
  HoldCard,
} from '@/components/pharmacy/list/parts';
import type { PharmacyListModel } from './usePharmacyList';

export function FilterSheets({ vm }: { vm: PharmacyListModel }) {
  const { t, colors, rxFilter, setRxFilter, reportedOnly, setReportedOnly, city, setCity, radiusKm, setRadiusKm, openNowOnly, setOpenNowOnly, sheet, setSheet, setShowAllPharmacies, filtersActive, clearFilters } = vm;
  return (
    <>
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
    </>
  );
}

export function HoldsSection({ vm }: { vm: PharmacyListModel }) {
  const { t, styles, reservationsOpen, setReservationsOpen, reservations, cancelReservation, openHolds, atHoldCap, openMedicine, confirmCancel, callPharmacy } = vm;
  return (
    <>
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
    </>
  );
}

export function CatalogueSection({ vm }: { vm: PharmacyListModel }) {
  const { t, styles, reportedOnly, setReportedOnly, catalog, results, total, shownResults, resultsTruncated, filtersActive, openMedicine, clearFilters } = vm;
  return (
    <>
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
    </>
  );
}

export function NearbySection({ vm }: { vm: PharmacyListModel }) {
  const { t, router, colors, styles, radiusKm, openNowOnly, setOpenNowOnly, setSheet, showAllPharmacies, setShowAllPharmacies, pharmacies, allPharmacyRows, pharmacyRows, pharmaciesTruncated, hasMappable } = vm;
  return (
    <>
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
    </>
  );
}
