import { useMemo } from 'react';

import { Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';


import { useTranslation } from 'react-i18next';


import {
  Card,
  Chip,
  EmptyState,
  Icon,
  ListRow,
  SectionHeader,
  StatusBadge,
  formatDateTime,
  formatLabel,
  useTheme,
  type IconName,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import {
  CareButton,
  LoadingBlock,
  NoticeBanner,
  SummaryLine,
} from '@/components/care/shared';


import { useBloodComponentMatrix } from '@/lib/api/bloodBankQueries';
import {
  type BloodBankResult,
  type BloodComponentValue,
  type BloodGroupOption,
  type BloodGroupValue,
  type BloodRequest,
  type BloodStockSnapshot,
} from '@/lib/api/queries';
import {
  NATIONWIDE_PREVIEW,
  BLOOD_TINT,
  VERIFICATION_FALLBACK,
  isVerified,
  dial,
} from './helpers';
import { makeStyles } from './styles';
/** Split verbatim out of app/blood-finder.tsx. */


/** The numbered label above each field of the finder card (PM-BLOOD-01). */
export function FieldLabel({ index, label }: { index: number; label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.fieldLabelRow}>
      <Text style={styles.fieldNumber}>{index}.</Text>
      <Text style={styles.fieldLabelText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * A dropdown field — the control the reference uses for Component and Range.
 *
 * A bordered box showing the current value with a chevron, not a chip: the
 * point of the reference's card is that each field looks like the kind of
 * choice it is, and these two are "one of a list", not "toggle some tags".
 * Tapping opens the same OptionCard sheet the location picker uses, so there
 * is one selection pattern on the screen rather than two.
 */
export function FieldSelect({
  icon,
  value,
  open,
  onPress,
  accessibilityLabel,
}: {
  icon?: IconName;
  value: string;
  open: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${accessibilityLabel}: ${value}`}
      style={[
        styles.selectField,
        { borderColor: open ? colors.blue : colors.border },
      ]}
    >
      {icon ? <Icon name={icon} size={17} color={colors.blue} /> : null}
      <Text style={styles.selectValue} numberOfLines={2}>
        {value}
      </Text>
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

/**
 * One numbered row of the finder card (PM-BLOOD-01).
 *
 * The number is carried in its own tinted square exactly as the reference
 * draws it, and it means something: these are ordered steps, and the results
 * below stay closed until step 1 is answered. A numbered marker on content
 * that is not a sequence would be decoration; here it is the sequence.
 */
export function FinderField({
  index,
  label,
  children,
}: {
  index: number;
  label: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.finderField}>
      <View style={styles.finderFieldHead}>
        <View style={[styles.finderIndex, { backgroundColor: colors.tintBlueBg }]}>
          <Text style={[styles.finderIndexText, { color: colors.blue }]}>{index}</Text>
        </View>
        <Text style={styles.finderLabel}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

/** One tile of the reference's four-up entry grid. */
export function QuickAction({
  icon,
  tint,
  label,
  onPress,
}: {
  icon: IconName;
  tint: Tint;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Four-up leaves ~50pt of label width below 380dp and "Emergency" broke
  // mid-word; go two-by-two there.
  const twoUp = useWindowDimensions().width < 380;
  const tone = tint === 'red' ? colors.statusCritical : colors.blue;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.quickTile, twoUp && styles.quickTileTwoUp]}
    >
      <View style={styles.quickMark}>
        <Icon name={icon} size={24} color={tone} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={3}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** Bordered picker used by the city / radius sheets. */
export function OptionCard({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.afterRail}>
      <Card variant="flush">
        <Text style={styles.optionTitle}>{title}</Text>
        {children}
      </Card>
    </View>
  );
}

/**
 * The stock figure, told honestly: how many units were reported, and exactly
 * when. `last_updated_at` is printed in full rather than summarised, because
 * "Updated recently" can mean anything up to six hours on a shelf that empties
 * in minutes. When the timestamp is missing the row is omitted entirely — the
 * freshness badge is then the only claim made about age, and it says "not
 * updated recently", which is what the projector writes for a null.
 */
export function StockFacts({
  availability,
  address,
  verification,
}: {
  availability: BloodStockSnapshot | null;
  address: string | null;
  verification: string | null;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const verificationKey = (verification ?? '').toLowerCase();
  const updated = availability?.last_updated_at
    ? formatDateTime(availability.last_updated_at)
    : null;

  return (
    <View style={styles.facts}>
      <SummaryLine
        label={t('bloodFinder.unitsLabel', { defaultValue: 'Units reported' })}
        value={availability?.units_range ?? t('bloodFinder.unitsUnknown')}
        valueColor={availability?.units_range ? undefined : colors.textMuted}
        strong={!!availability?.units_range}
      />
      {updated ? (
        <SummaryLine
          label={t('bloodFinder.stockUpdated', { defaultValue: 'Stock updated' })}
          value={updated}
        />
      ) : null}
      {address ? (
        <SummaryLine
          label={t('bloodFinder.addressLabel', { defaultValue: 'Address' })}
          value={address}
        />
      ) : null}
      {verificationKey ? (
        <SummaryLine
          label={t('bloodFinder.verificationLabel', { defaultValue: 'Listing' })}
          value={t(`bloodFinder.verification.${verificationKey}`, {
            defaultValue: VERIFICATION_FALLBACK[verificationKey] ?? formatLabel(verification),
          })}
          valueColor={isVerified(verification) ? colors.statusNormal : colors.textMuted}
        />
      ) : null}
    </View>
  );
}

/**
 * A facility that reports the requested units.
 *
 * One `Card variant="flush"`: the kit `ListRow` (red tint circle, distance and
 * the freshness `StatusBadge` on the right) over the reported figures and the
 * two actions the patient came for. Tapping the row and pressing "Request
 * units" do the same thing.
 */
export function BloodBankCard({
  facility,
  components,
  onOpen,
  onCall,
}: {
  facility: BloodBankResult;
  /** One entry per component; `units` is null when the facility said nothing. */
  components: { component: BloodComponentValue; units: string | null }[];
  onOpen: () => void;
  onCall: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const availability = facility.availability;
  const phone = facility.phone ?? facility.emergency_contact ?? null;

  const freshnessKey = (availability?.freshness ?? '').toLowerCase() || 'stale';
  const freshnessLabel = t(`bloodFinder.freshness.${freshnessKey}`, {
    defaultValue: t('bloodFinder.freshness.stale'),
  });

  const distance =
    facility.distance_km === null
      ? t('bloodFinder.distanceUnknown')
      : t('bloodFinder.distanceKm', { km: facility.distance_km });

  const place = [facility.city, facility.region].filter(Boolean).join(', ') || null;
  const verified = isVerified(facility.verification_status);

  return (
    <Card variant="flush">
      <TouchableOpacity
        onPress={onOpen}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={[facility.name, place, distance, freshnessLabel]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint={t('bloodFinder.openBank')}
        style={styles.bankRow}
      >
        {/* Round mark, where the reference puts each bank's own logo. This
            platform stores no facility logos, so the mark is the blood glyph
            rather than an invented crest. */}
        <View style={styles.bankMark}>
          <Icon name="droplet" size={26} color={colors.statusCritical} />
        </View>

        <View style={styles.bankBody}>
          <View style={styles.bankNameRow}>
            <Text style={styles.bankName} numberOfLines={2}>
              {facility.name}
            </Text>
            {verified ? <Icon name="shield-check" size={15} color={colors.blue} /> : null}
          </View>

          <Text style={styles.bankMeta} numberOfLines={1}>
            {[place, distance].filter(Boolean).join('  •  ')}
          </Text>

          <View style={styles.bankFreshRow}>
            <Icon name="clock" size={13} color={colors.textMuted} />
            <Text style={styles.bankFresh}>{freshnessLabel}</Text>
          </View>

          {/* Per-component chips, the row the reference puts under the name.
              A component the facility has not published is omitted rather than
              shown as zero — see useBloodComponentMatrix. */}
          <View style={styles.componentChips}>
            {components.filter((row) => row.units).length === 0 ? (
              <Text style={styles.bankFresh}>{t('bloodFinder.noComponentCounts')}</Text>
            ) : (
              components
                .filter((row) => row.units)
                .map((row) => (
                  <View
                    key={row.component}
                    style={[styles.componentChip, { backgroundColor: colors.tintBlueBg }]}
                  >
                    <Text style={[styles.componentChipLabel, { color: colors.blue }]}>
                      {t(`bloodFinder.componentShort.${row.component}`, {
                        defaultValue: t(`bloodFinder.components.${row.component}`),
                      })}
                    </Text>
                    <Text style={[styles.componentChipUnits, { color: colors.blue }]}>
                      {row.units}
                    </Text>
                  </View>
                ))
            )}
          </View>
        </View>

        {/* The reference's right-hand column: the headline figure stacked over
            its label, and a round call button beneath. */}
        <View style={styles.bankAside}>
          <Text style={[styles.bankUnits, { color: colors.blue }]} numberOfLines={1}>
            {availability?.units_range ?? '—'}
          </Text>
          <Text style={styles.bankUnitsLabel}>{t('bloodFinder.unitsAvailable')}</Text>
          <TouchableOpacity
            onPress={onCall}
            disabled={!phone}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={
              phone ? t('bloodFinder.callShort') : t('bloodFinder.noPhone')
            }
            style={[
              styles.bankCall,
              { borderColor: colors.border },
              !phone && styles.bankCallOff,
            ]}
          >
            <Icon name="phone" size={17} color={phone ? colors.blue : colors.textMuted} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Card>
  );
}

/**
 * The no-results state, built as an answer rather than a shrug.
 *
 * `blood_availability` is self-reported and routinely empty, so this is the
 * state most patients will actually see. Every action below is real: widening
 * the radius re-runs the search, a compatible group re-runs it against a group
 * the API says has stock, and "search the whole country" issues the supported
 * origin-less query. Nothing is invented to fill the space.
 */
export function NoStockPanel({
  radiusKm,
  nextRadius,
  onWiden,
  filtered,
  onClearFilter,
  componentLabel,
  onWholeBlood,
  group,
  compatibleGroups,
  onPickGroup,
  nationwideOpen,
  onNationwide,
  nationwidePending,
  nationwideError,
  nationwideRows,
  nationwideExpanded,
  onToggleNationwide,
  onRetryNationwide,
  onFindHospital,
  onOpenFacility,
}: {
  radiusKm: number;
  nextRadius: number | null;
  onWiden: () => void;
  filtered: boolean;
  onClearFilter: () => void;
  componentLabel: string;
  onWholeBlood: (() => void) | null;
  group: string;
  compatibleGroups: BloodGroupOption[];
  onPickGroup: (value: BloodGroupValue) => void;
  nationwideOpen: boolean;
  onNationwide: () => void;
  nationwidePending: boolean;
  nationwideError: boolean;
  nationwideRows: BloodBankResult[];
  nationwideExpanded: boolean;
  onToggleNationwide: () => void;
  onRetryNationwide: () => void;
  onFindHospital: () => void;
  onOpenFacility: (facility: BloodBankResult) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // The local filter box hiding every row is a different problem with a
  // different escape from "nothing is reported within the radius".
  if (filtered) {
    return (
      <Card variant="flush">
        <EmptyState
          icon="search"
          tint="blue"
          title={t('bloodFinder.filteredToNothing', {
            defaultValue: 'No result matches that filter.',
          })}
          message={t('bloodFinder.filteredToNothingHint', {
            defaultValue:
              'The filter only narrows the facilities already found. Clear it to see them all again.',
          })}
          actionLabel={t('bloodFinder.clear')}
          onAction={onClearFilter}
        />
      </Card>
    );
  }

  const shown = nationwideExpanded ? nationwideRows : nationwideRows.slice(0, NATIONWIDE_PREVIEW);

  return (
    <View style={styles.stack}>
      <Card variant="flush">
        <EmptyState
          icon="droplet"
          tint={BLOOD_TINT}
          title={t('bloodFinder.noResults', { km: radiusKm })}
          message={t('bloodFinder.empty.body')}
          actionLabel={nextRadius ? t('bloodFinder.empty.widen', { km: nextRadius }) : undefined}
          onAction={nextRadius ? onWiden : undefined}
        />
      </Card>

      <Card variant="flush">
        <Text style={styles.optionTitle}>{t('bloodFinder.empty.nextSteps')}</Text>
        {nextRadius ? (
          <ListRow
            icon="target"
            tint="amber"
            title={t('bloodFinder.empty.widen', { km: nextRadius })}
            onPress={onWiden}
            divider
          />
        ) : null}
        {onWholeBlood ? (
          <ListRow
            icon="droplet"
            tint={BLOOD_TINT}
            title={t('bloodFinder.empty.tryWholeBlood')}
            onPress={onWholeBlood}
            divider
          />
        ) : null}
        {!nationwideOpen ? (
          <ListRow
            icon="globe"
            tint="blue"
            title={t('bloodFinder.empty.nationwide')}
            onPress={onNationwide}
            divider
          />
        ) : null}
        <ListRow
          icon="building"
          tint="green"
          title={t('bloodFinder.empty.callHospital')}
          onPress={onFindHospital}
        />
      </Card>

      {/* Compatible groups — clinically grounded (App\Enums\BloodGroup) and
          annotated with what the API says is actually reported. */}
      {compatibleGroups.length > 0 ? (
        <View>
          <SectionHeader variant="overline" title={t('bloodFinder.empty.compatible', { group })} />
          <View style={styles.chipWrap}>
            {compatibleGroups.map((option) => (
              <Chip
                key={option.value}
                icon="droplet"
                label={option.label}
                count={option.facility_count > 0 ? option.facility_count : undefined}
                selected={option.facility_count > 0}
                onPress={() => onPickGroup(option.value)}
                accessibilityLabel={`${option.label} — ${
                  option.facility_count > 0
                    ? t('bloodFinder.facilityCount', { count: option.facility_count })
                    : t('bloodFinder.noSites')
                }`}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* Nationwide sweep */}
      {nationwideOpen ? (
        <View style={styles.stack}>
          {nationwidePending ? (
            <LoadingBlock label={t('bloodFinder.empty.checking')} />
          ) : nationwideError ? (
            <Card variant="flush">
              <EmptyState
                icon="alert-circle"
                tint="red"
                title={t('bloodFinder.empty.failed')}
                actionLabel={t('bloodFinder.retry')}
                onAction={onRetryNationwide}
              />
            </Card>
          ) : nationwideRows.length === 0 ? (
            <Card variant="flush">
              <EmptyState
                icon="globe"
                tint="amber"
                title={t('bloodFinder.empty.nationwideNone', {
                  group,
                  component: componentLabel,
                })}
                message={t('bloodFinder.empty.nationwideNoneHint')}
                actionLabel={t('bloodFinder.empty.callHospital')}
                onAction={onFindHospital}
              />
            </Card>
          ) : (
            <>
              <View>
                <SectionHeader
                  variant="overline"
                  title={t('bloodFinder.empty.nationwideFound', { count: nationwideRows.length })}
                  actionLabel={
                    nationwideRows.length > NATIONWIDE_PREVIEW
                      ? nationwideExpanded
                        ? t('bloodFinder.showLess', { defaultValue: 'Show fewer' })
                        : t('bloodFinder.showAll', { defaultValue: 'Show all' })
                      : undefined
                  }
                  actionChevron
                  onAction={
                    nationwideRows.length > NATIONWIDE_PREVIEW ? onToggleNationwide : undefined
                  }
                />
                {/* These rows come back without a distance, so they cannot be
                    ordered by how far away they are — say what they ARE ordered
                    by rather than let the list imply proximity. */}
                <Text style={styles.sectionHint}>
                  {t('bloodFinder.empty.freshestFirst', {
                    defaultValue: 'Most recently updated first · distance unavailable',
                  })}
                </Text>
              </View>
              <View style={styles.stack}>
                {shown.map((facility) => (
                  <BloodBankCard
                    key={facility.id}
                    facility={facility}
                    /* The nationwide sweep runs without an origin and for one
                       component only, so there are no per-component counts to
                       show here. An empty list renders the honest "not
                       reported" line rather than blank chips. */
                    components={[]}
                    onOpen={() => onOpenFacility(facility)}
                    onCall={() => dial(facility.phone ?? facility.emergency_contact)}
                  />
                ))}
              </View>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

/** Urgency reads as a tone, not a colour literal. */
export function urgencyTone(urgency: string): StatusTone {
  switch (urgency) {
    case 'emergency':
      return 'critical';
    case 'urgent':
      return 'warning';
    default:
      return 'neutral';
  }
}

/**
 * One request the patient already sent.
 *
 * Everything MobileBloodController::requestPayload() returns is shown, because
 * every field of it answers a question the patient will otherwise phone
 * somebody to ask: what did I ask for, where, under what reference, by when do
 * I need it, when does the hold lapse (BloodRequestService::HOLD_HOURS is 24,
 * after which the request expires on its own), what did I tell them, and — the
 * one that matters most — what did the blood bank write back.
 */
export function OpenRequestCard({
  request,
  cancelling,
  onCancel,
  onTrack,
}: {
  request: BloodRequest;
  cancelling: boolean;
  onCancel: () => void;
  /** Opens PM-BLOOD-05 for this request. */
  onTrack: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const phone = request.facility?.phone ?? null;

  const componentLabel = t(`bloodFinder.components.${request.component_type}`, {
    defaultValue: request.component_label,
  });
  const place = [request.facility?.city, request.facility?.address].filter(Boolean).join(', ');

  return (
    <Card variant="flush">
      <ListRow
        icon="receipt"
        tint={BLOOD_TINT}
        title={`${request.blood_group}  •  ${componentLabel}`}
        meta={[
          request.facility?.name,
          place || null,
          t('bloodFinder.reference', { reference: request.reference }),
        ]}
        onPress={onTrack}
        accessibilityHint={t('bloodStatus.title')}
        trailing={
          <View style={styles.rowAside}>
            <StatusBadge
              status={request.status}
              label={t(`bloodFinder.statuses.${request.status}`, {
                defaultValue: request.status_label,
              })}
              size="sm"
            />
            <StatusBadge
              status={request.urgency}
              tone={urgencyTone(request.urgency)}
              label={t(`bloodFinder.urgencies.${request.urgency}`)}
              size="sm"
            />
          </View>
        }
        divider
      />

      <View style={styles.facts}>
        <SummaryLine
          label={t('bloodFinder.request.reviewUnits')}
          value={String(request.quantity)}
          strong
        />
        {request.needed_by ? (
          <SummaryLine
            label={t('bloodFinder.request.neededBy', { defaultValue: 'Needed by' })}
            value={formatDateTime(request.needed_by)}
          />
        ) : null}
        {request.expires_at ? (
          <SummaryLine
            label={t('bloodFinder.request.expiresAt', { defaultValue: 'Hold expires' })}
            value={formatDateTime(request.expires_at)}
            valueColor={colors.statusWarning}
          />
        ) : null}
        {request.created_at ? (
          <SummaryLine
            label={t('bloodFinder.request.sentAt', { defaultValue: 'Sent' })}
            value={formatDateTime(request.created_at)}
          />
        ) : null}
        {request.contact_phone ? (
          <SummaryLine
            label={t('bloodFinder.request.contactPhone')}
            value={request.contact_phone}
          />
        ) : null}
      </View>

      {request.patient_note ? (
        <View style={styles.noteStrip}>
          <Text style={styles.noteLabel}>{t('bloodFinder.request.note')}</Text>
          <Text style={styles.noteText}>{request.patient_note}</Text>
        </View>
      ) : null}

      {/* The blood bank's own words back to the patient — the single most
          important field on the payload, so it is a banner, not a line. */}
      {request.facility_note ? (
        <View style={styles.facilityNote}>
          <NoticeBanner
            icon="chat"
            tone="pending"
            title={t('bloodFinder.request.facilityNote', {
              defaultValue: 'Message from the blood bank',
            })}
            message={request.facility_note}
          />
        </View>
      ) : null}

      {phone || request.is_cancellable ? (
        <View style={styles.cardFoot}>
          {phone ? (
            <CareButton
              label={t('bloodFinder.callShort')}
              icon="phone"
              variant="secondary"
              size="sm"
              onPress={() => dial(phone)}
              style={styles.footAction}
            />
          ) : null}
          {request.is_cancellable ? (
            <CareButton
              label={t('bloodFinder.request.cancel')}
              icon="close"
              variant="danger"
              size="sm"
              loading={cancelling}
              disabled={cancelling}
              onPress={onCancel}
              style={styles.footAction}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/* ── Styles ───────────────────────────────────────────────────────────────── */

