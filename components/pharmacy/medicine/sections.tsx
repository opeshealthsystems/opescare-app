/**
 * Large JSX sections of the medicine detail screen (app/pharmacy/[medicineId].tsx).
 * Each renders only once the medicine has loaded, as it did inline.
 */
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  Card,
  CardStack,
  EmptyState,
  Icon,
  LastUpdatedLine,
  ListRow,
  ResultList,
  SectionHeader,
  StaleNotice,
  StatusBadge,
  formatDate,
  formatDateTime,
} from '@/components/opes-ui';
import { CardOverline, MedButton } from '@/components/meds/shared';
import { FacilityMap } from '@/components/map/FacilityMap';
import { formatXafBare } from '@/lib/api/pharmacyQueries';
import {
  MAX_QUANTITY,
  MAX_NOTE_LENGTH,
  RADIUS_LADDER,
  STOCK_STALE_DAYS,
  RESERVATION_TONES,
  stockTone,
  money,
  verificationLine,
  hoursLine,
  prescriptionStatusLabel,
  prescriptionUnusable,
} from '@/components/pharmacy/medicine/helpers';
import {
  WHY_ICONS,
  HOW_ICONS,
  PharmacyOptionRow,
  AccentButton,
  StockMeter,
  TableCell,
  NoticeStrip,
  StepperButton,
  SummaryLine,
} from '@/components/pharmacy/medicine/parts';
import type { MedicineDetailModel } from './useMedicineDetail';

export function HoldsAndSearchSection({ vm }: { vm: MedicineDetailModel }) {
  const {
    t,
    colors,
    styles,
    radiusKm,
    radiusOpen,
    setRadiusOpen,
    medicine,
    cancelReservation,
    existingHolds,
    goBack,
    changeRadius,
    confirmCancel,
    originLabel,
  } = vm;
  if (!medicine.data) return null;
  return (
    <>
      {/* -- Existing holds on this medicine -------------------------- */}
      {existingHolds.length > 0 ? (
        <CardStack spacing="sm">
          <CardOverline title={t('pharmacy.reservationsTitle')} />
          {existingHolds.map((hold) => {
            const expiresAt = hold.expires_at ? new Date(hold.expires_at) : null;
            const expired =
              hold.status === 'expired' ||
              (!!expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now());
            const busy = cancelReservation.isPending && cancelReservation.variables?.id === hold.id;
            return (
              <Card key={hold.id}>
                <ListRow
                  icon="receipt"
                  tint={expired ? 'red' : 'amber'}
                  title={hold.pharmacy?.name ?? t('pharmacy.selectedMedicine')}
                  meta={[
                    t('pharmacy.reservationRef', { reference: hold.reference }),
                    [
                      t('pharmacy.reservationQuantity', {
                        count: hold.quantity,
                      }),
                      hold.pack_size,
                    ]
                      .filter(Boolean)
                      .join(' · '),
                    money(hold.total_price, hold.currency),
                    expired
                      ? t('pharmacy.reservationExpired')
                      : expiresAt
                        ? t('pharmacy.reservationExpires', {
                            when: formatDateTime(expiresAt),
                          })
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
                  style={styles.flushRow}
                />
              </Card>
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
        </CardStack>
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
            <Icon name={radiusOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
          </View>
        </TouchableOpacity>
      </View>

      {radiusOpen ? (
        <CardStack spacing="sm">
          {RADIUS_LADDER.map((km) => (
            <Card key={km} variant="flush">
              <ListRow
                title={t('pharmacy.radius', { km })}
                trailing={km === radiusKm ? <Icon name="check" size={18} color={colors.blue} /> : undefined}
                chevron={false}
                onPress={() => changeRadius(km)}
              />
            </Card>
          ))}
        </CardStack>
      ) : null}
    </>
  );
}

export function PharmacyListSection({ vm }: { vm: MedicineDetailModel }) {
  const {
    t,
    colors,
    styles,
    radiusKm,
    nextRadiusKm,
    setPharmacyId,
    setPackSize,
    setConfirmed,
    setErrorCode,
    medicine,
    pharmacies,
    pharmacyRows,
    withoutStockRow,
    pharmacy,
    changeRadius,
    callPharmacy,
    onPharmacyListLayout,
  } = vm;
  if (!medicine.data) return null;
  return (
    <>
      {/* -- Nearest pharmacies --------------------------------------- */}
      <View onLayout={onPharmacyListLayout}>
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
            defaultValue: 'Stock levels and prices are reported by each pharmacy, not measured by OpesCare.',
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
                      defaultValue: 'Pharmacies here that have never reported this medicine are not listed.',
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
                  defaultValue: 'Pharmacies here that have never reported this medicine are not listed.',
                })}
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </>
  );
}

export function ChosenPharmacySection({ vm }: { vm: MedicineDetailModel }) {
  const { t, router, styles, jumpToMap, medicine, pharmacy, stock, stockFreshness, callPharmacy, phone, onMapLayout } =
    vm;
  if (!medicine.data) return null;
  return (
    <>
      {/* -- The chosen pharmacy, in full ----------------------------- */}
      {pharmacy && stock ? (
        <Card>
          <CardOverline
            title={t('pharmacy.selectedPharmacyTitle', {
              defaultValue: 'Selected pharmacy',
            })}
            right={
              <StatusBadge
                status={stock.status}
                tone={stockTone(stock.status)}
                label={t(`pharmacy.stock.${stock.status}`, {
                  defaultValue: stock.status_label,
                })}
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
                router.push({
                  pathname: '/facility/[id]',
                  params: { id: pharmacy.id },
                })
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
                label={t('pharmacy.packSizeLabel', {
                  defaultValue: 'Pack size',
                })}
                value={stock.pack_size}
              />
            ) : null}
            {stock.packs_available !== null ? (
              <SummaryLine
                label={t('pharmacy.packsOnShelf', {
                  defaultValue: 'Packs reported',
                })}
                value={t('pharmacy.packsAvailable', {
                  count: stock.packs_available,
                })}
              />
            ) : null}
            {/* Always present: a pack count is not a substitute for a date. */}
            <SummaryLine
              label={t('pharmacy.lastReported', {
                defaultValue: 'Last reported',
              })}
              value={stockFreshness.date}
            />
          </View>

          {stockFreshness.stale ? (
            <NoticeStrip
              icon="alert-triangle"
              tone="warning"
              text={t('pharmacy.stockStale', {
                days: STOCK_STALE_DAYS,
                defaultValue: 'This stock report is more than {{days}} days old. Call the pharmacy before you travel.',
              })}
            />
          ) : null}
          {!stock.reservation_enabled ? (
            <NoticeStrip
              icon="info"
              tone="info"
              text={stock.status === 'out_of_stock' ? t('pharmacy.outOfStockNote') : t('pharmacy.noReservationEnabled')}
            />
          ) : null}
        </Card>
      ) : null}

      {/* -- Where it is: embedded, in-app map (no external maps app) -- */}
      {pharmacy && pharmacy.latitude != null && pharmacy.longitude != null ? (
        <View onLayout={onMapLayout}>
          <Card variant="flush">
            <FacilityMap facilities={pharmacy} height={180} directions variant="thumbnail" />
          </Card>
        </View>
      ) : null}
    </>
  );
}

export function PricingAndAboutSection({ vm }: { vm: MedicineDetailModel }) {
  const {
    t,
    colors,
    styles,
    packSize,
    setPackSize,
    jumpToPharmacies,
    medicine,
    pharmacyRows,
    pharmacy,
    stock,
    packMismatch,
    stockHere,
  } = vm;
  if (!medicine.data) return null;
  return (
    <>
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
            <Text style={[styles.pricingValue, { color: stockHere ? colors.statusNormal : colors.textMuted }]}>
              {stock
                ? t(`pharmacy.stock.${stock.status}`, {
                    defaultValue: stock.status_label,
                  })
                : medicine.data.availability.is_available
                  ? t('pharmacy.pricingInStock')
                  : t('pharmacy.pricingNotReported')}
            </Text>
            {stock ? <StockMeter status={stock.status} /> : null}
            {/* Never rendered as 0 when the pharmacy reported no count. */}
            {stock?.packs_available != null ? (
              <Text style={styles.pricingSub}>{t('pharmacy.packsAvailable', { count: stock.packs_available })}</Text>
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
                <Text style={styles.pricingSub}>{t('pharmacy.pricePerPack', { size: stock.pack_size })}</Text>
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
              {medicine.data.availability.price_min !== null && medicine.data.availability.price_max !== null
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
        <Text style={styles.body}>{medicine.data.description ?? t('pharmacy.noDescription')}</Text>

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
          <TableCell label={t('pharmacy.strength')} value={medicine.data.strength ?? '—'} divided />
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
          {medicine.data.is_controlled ? <Text style={styles.importantBody}>{t('pharmacy.controlled')}</Text> : null}
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
              const quoted = stock?.pack_size === option ? money(stock.unit_price, stock.currency) : null;
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
                  <Text style={[styles.packSizeText, on && { color: colors.statusNormal }]} numberOfLines={2}>
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
                defaultValue: '{{pharmacy}} quoted this price for {{size}}. Confirm the total at the counter.',
              })}
            />
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

export function QuantityAndPrescriptionSection({ vm }: { vm: MedicineDetailModel }) {
  const {
    t,
    router,
    colors,
    styles,
    quantity,
    setQuantity,
    note,
    setNote,
    prescriptionId,
    setPrescriptionId,
    prescriptionListOpen,
    setPrescriptionListOpen,
    setErrorCode,
    medicine,
    needsPrescription,
    prescriptions,
    chosenPrescription,
  } = vm;
  if (!medicine.data) return null;
  return (
    <>
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
          {t('pharmacy.noteLabel', {
            defaultValue: 'Note for the pharmacy (optional)',
          })}
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
            defaultValue: 'Up to {{max}} characters. Do not include payment card or ID numbers.',
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
              <Icon name="document-text" size={24} color={colors.statusWarning} />
            </View>
            <View style={styles.rxBody}>
              <Text style={styles.rxTitle}>{t('pharmacy.prescriptionExplainerTitle')}</Text>
              <Text style={styles.body}>{t('pharmacy.prescriptionExplainerBody')}</Text>
              {medicine.data.is_controlled ? <Text style={styles.body}>{t('pharmacy.controlled')}</Text> : null}
            </View>
          </View>

          <MedButton
            label={chosenPrescription ? t('pharmacy.prescriptionAttached') : t('pharmacy.attachPrescription')}
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
                t('pharmacy.prescriptionItems', {
                  count: chosenPrescription.item_count,
                }),
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
              <CardStack spacing="sm" style={styles.rxList}>
                {(prescriptions.data ?? []).map((rx) => {
                  const active = rx.id === prescriptionId;
                  const unusable = prescriptionUnusable(rx);
                  // facility_name is nullable on the prescriptions payload;
                  // when it is absent the row says so rather than guessing.
                  return (
                    <Card key={rx.id} variant="flush">
                      <ListRow
                        icon="document-text"
                        tint={active ? 'green' : unusable ? 'red' : 'blue'}
                        title={rx.facility_name ?? t('prescriptions.unknownFacility')}
                        meta={[
                          t('pharmacy.prescriptionItems', {
                            count: rx.item_count,
                          }),
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
                        onPress={() => {
                          setPrescriptionId(active ? null : rx.id);
                          setPrescriptionListOpen(false);
                          setErrorCode(null);
                        }}
                      />
                    </Card>
                  );
                })}
              </CardStack>
            )
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

export function SummaryAndOutcomeSection({ vm }: { vm: MedicineDetailModel }) {
  const {
    t,
    router,
    colors,
    styles,
    packSize,
    quantity,
    confirmed,
    errorCode,
    medicine,
    cancelReservation,
    pharmacy,
    unitPrice,
    totalPrice,
    currency,
    confirmCancel,
    disabledReason,
  } = vm;
  if (!medicine.data) return null;
  return (
    <>
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
          value={[t('pharmacy.reservationQuantity', { count: quantity }), packSize].filter(Boolean).join(' · ')}
        />
        <View style={styles.totalRow}>
          <Text style={styles.total}>{money(totalPrice, currency) ?? t('pharmacy.priceUnavailable')}</Text>
        </View>
        <View style={styles.infoStrip}>
          <Icon name="info" size={18} color={colors.blue} />
          <Text style={styles.infoText}>{t('pharmacy.paymentNote')}</Text>
        </View>
        {/* Never leave the sticky footer's dead CTA unexplained. */}
        {disabledReason ? <Text style={styles.disabledReason}>{disabledReason}</Text> : null}
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
                  t('pharmacy.reservationQuantity', {
                    count: confirmed.quantity,
                  }),
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
              backgroundColor: errorCode === 'PRESCRIPTION_REQUIRED' ? colors.statusPendingBg : colors.statusCriticalBg,
            },
          ]}
        >
          <Icon
            name={errorCode === 'PRESCRIPTION_REQUIRED' ? 'document-text' : 'alert-circle'}
            size={20}
            color={errorCode === 'PRESCRIPTION_REQUIRED' ? colors.statusPending : colors.statusCritical}
          />
          <View style={styles.outcomeBody}>
            <Text
              style={[
                styles.outcomeTitle,
                {
                  color: errorCode === 'PRESCRIPTION_REQUIRED' ? colors.statusPending : colors.statusCritical,
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
    </>
  );
}

export function InfoPanelsSection({ vm }: { vm: MedicineDetailModel }) {
  const { t, router, colors, styles, medicine, loadedAt } = vm;
  if (!medicine.data) return null;
  return (
    <>
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
                <Icon name={WHY_ICONS[key]} size={24} color={colors.statusNormal} />
              </View>
              <Text style={styles.whyLabel}>{t(`pharmacy.whyPricesShort.${key}`)}</Text>
              <Text style={styles.whyText}>{t(`pharmacy.whyPrices.${key}`)}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* MED-04: the four steps as a 2x2 grid — every step readable at
          once, no sideways scrolling. Numbered because it is a sequence,
          read left-to-right then down, ending on the step the app cannot
          do for you. */}
      <Card>
        <SectionHeader title={t('pharmacy.howToTitle')} />
        <View style={styles.howGrid}>
          {(['search', 'compare', 'reserve', 'collect'] as const).map((key, index) => (
            <View key={key} style={styles.howStep}>
              <View style={styles.howMark}>
                <Icon name={HOW_ICONS[key]} size={24} color={colors.statusNormal} />
              </View>
              <Text style={styles.howTitle} numberOfLines={2}>
                {`${index + 1}. ${t(`pharmacy.howTo.${key}.title`)}`}
              </Text>
              <Text style={styles.howText}>{t(`pharmacy.howTo.${key}.body`)}</Text>
            </View>
          ))}
        </View>
      </Card>

      {loadedAt > 0 ? <LastUpdatedLine loadedAt={new Date(loadedAt)} /> : null}

      {/* MED-02's blue privacy panel. "Learn more" has a real
          destination here — the patient's own privacy screen. */}
      <View style={styles.notice} accessibilityRole="summary">
        <View style={styles.noticeMark}>
          <Icon name="lock" size={24} color={colors.blue} />
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
  );
}
