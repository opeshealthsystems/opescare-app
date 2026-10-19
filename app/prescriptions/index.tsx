import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardStack,
  EmptyState,
  Icon,
  ScreenHeader,
  SectionHeader,
  SegmentedTabs,
  StatusBadge,
  a11yJoin,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import { Screen } from '../../components/ui/Screen';
import {
  usePrescriptionDetail,
  usePrescriptions,
  type PrescriptionItemDetail,
  type PrescriptionSummary,
} from '../../lib/api/queries';
import { useActivePrescriptionSummary } from '../../lib/api/prescriptionQueries';
import {
  EXPIRY_WARNING_WINDOW_DAYS,
  daysUntil,
  referenceCode,
  resolveStatusLabel,
} from '../../components/prescriptions/status';
import {
  LoadingBlock,
  MedButton,
  ROW_TINTS,
  TintCircle,
  fmtShortDate,
  prescriptionTone,
} from '../../components/meds/shared';

/**
 * Prescriptions — the medications a care team has issued to this patient.
 *
 * MED-001 layout on the existing data layer: `ScreenHeader` with the Medicine
 * Finder shortcut, the navy summary hero, a scrollable status filter, the
 * "MY PRESCRIPTIONS" overline and one accent-barred `Card` per prescription.
 * Every colour is a palette token and every glyph is the kit `<Icon />`.
 *
 * **What a row says, and where it comes from.** `GET /mobile/prescriptions`
 * returns a header only — facility, status, `item_count`, and the three dates —
 * never the drug names. A row that can only say "3 medications" makes the
 * patient open all three to find the one they came for, so each rendered row
 * also asks `usePrescriptionDetail` for its own lines and upgrades to
 * "Amoxicillin +2 more" plus a collected/outstanding count once that lands.
 * That is the same query the detail screen uses, so opening a row afterwards is
 * instant. The index endpoint caps at 20 rows and this screen has no infinite
 * scroll, so the fan-out is bounded by the page, and a row whose detail is
 * still in flight (or failed) simply keeps the honest count line.
 *
 * Read-only by design: the mobile API exposes only GET index + GET show
 * (routes/api.php:269-270), so this screen surfaces no refill or renewal
 * action. The one refill route in the codebase is a session-authenticated web
 * portal route (`POST /portals/patient/prescriptions/{id}/refill`) and is not
 * reachable from a bearer-token client.
 *
 * The demo patient has no prescriptions, so the empty state is the state most
 * users meet first: it explains how a prescription reaches this screen rather
 * than reading as a failure, and both of its actions lead somewhere real.
 */

const STATUS_FILTERS = ['all', 'active', 'partially_dispensed', 'dispensed', 'expired', 'cancelled'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

/** Statuses from which no further transition is allowed (server-side truth). */
const TERMINAL_STATUSES = ['dispensed', 'cancelled', 'voided', 'entered_in_error', 'amended'];

/** Statuses that mean "this record should not have existed / no longer counts". */
const RETRACTED_STATUSES = ['voided', 'entered_in_error'];

/** `t` narrowed to the plain shape the helpers below take. */
type TFunc = (key: string, params?: Record<string, unknown>) => string;

export default function PrescriptionsListScreen() {
  usePrivateScreen();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const vocab = usePrescriptionVocab();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>('all');

  const { data, isLoading, isError, isFetching, refetch } = usePrescriptions(filter === 'all' ? undefined : filter);
  const summary = useActivePrescriptionSummary();

  const prescriptions = data?.data ?? [];
  const total = data?.pagination?.total ?? prescriptions.length;
  const hasAnyActive = (summary.data?.prescriptionCount ?? 0) > 0;
  const showCount = !isLoading && !isError && prescriptions.length > 0;
  // The index endpoint pages at 20 and nothing here loads a second page, so a
  // patient with a long history is seeing a slice. Say so rather than letting
  // the count above imply the list is complete.
  const truncated = showCount && total > prescriptions.length;

  const filterOptions = useMemo(
    () =>
      STATUS_FILTERS.map((option) => ({
        key: option,
        label: option === 'all' ? t('prescriptions.filterAll') : vocab.statusLabel(option),
      })),
    [t, vocab],
  );

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={t('prescriptions.title')}
        subtitle={t('prescriptions.subtitle')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/home'))}
        right={
          <MedButton
            label={t('prescriptions.findMedicine')}
            icon="search"
            variant="navy"
            size="sm"
            onPress={() => router.push('/pharmacy')}
          />
        }
      />

      <FlatList
        data={prescriptions}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            // One invalidation covers the list, the active-summary count and
            // every per-row detail — a pull that refreshed the headers but left
            // the dispensing bars showing yesterday's state would be worse than
            // not refreshing at all.
            onRefresh={() => {
              queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
            }}
            tintColor={colors.blue}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Active-medication summary. Rendered only once there is something
                to count — an all-zero strip would be noise above an empty list. */}
            {hasAnyActive ? (
              <SummaryHero
                prescriptions={summary.data?.prescriptionCount ?? 0}
                medications={summary.data?.medicationCount ?? 0}
              />
            ) : null}

            <SegmentedTabs
              scrollable
              options={filterOptions}
              value={filter}
              onChange={(key) => setFilter(key as StatusFilter)}
            />

            {showCount ? (
              <View style={styles.sectionRow}>
                <SectionHeader
                  variant="overline"
                  title={t('opesMeds.list.prescriptionsTitle')}
                  style={styles.sectionHeader}
                />
                <Text style={styles.count}>{t('prescriptions.resultCount', { count: total })}</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <LoadingBlock label={t('opesMeds.list.loading')} />
          ) : isError ? (
            // A failed request. Retryable, and worded so it can never be read
            // as "you have no prescriptions".
            <Card>
              <EmptyState
                icon="alert-circle"
                tint="red"
                title={t('prescriptions.loadError')}
                message={vocab.tx('prescriptions.loadErrorBody', {
                  defaultValue: 'Your prescriptions could not be fetched. Check your connection and try again.',
                })}
                actionLabel={t('prescriptions.retry')}
                onAction={() => refetch()}
              />
            </Card>
          ) : filter === 'all' ? (
            <FirstRunEmptyState />
          ) : (
            <FilteredEmptyState statusLabel={vocab.statusLabel(filter)} onShowAll={() => setFilter('all')} />
          )
        }
        ListFooterComponent={
          truncated ? (
            <Text style={styles.footnote}>
              {vocab.tx('prescriptions.showingRecent', {
                n: prescriptions.length,
                total,
                defaultValue: 'Showing your {{n}} most recent of {{total}} prescriptions.',
              })}
            </Text>
          ) : null
        }
        renderItem={({ item, index }) => (
          <PrescriptionRow prescription={item} index={index} onPress={() => router.push(`/prescriptions/${item.id}`)} />
        )}
      />
    </Screen>
  );
}

/* -- Status vocabulary ------------------------------------------------------ */

/**
 * Localized status words for this screen.
 *
 * `components/prescriptions/status.tsx` maps only the five statuses the filter
 * row offers and returns `prescriptions.statusActive` for everything else — so
 * a `voided` or `entered_in_error` prescription would be listed as "Active".
 * Those statuses are real (`App\Models\Prescription::TERMINAL_STATUSES`) and
 * that shared file is not edited here, so they are named below, and anything
 * genuinely unrecognised falls back to its own formatted value rather than
 * borrowing a word that would make a dead record look live.
 */
function usePrescriptionVocab() {
  const { t } = useTranslation();

  const tx = useCallback<TFunc>((key, params) => String(t(key, params as Record<string, unknown>)), [t]);

  const statusLabel = useCallback(
    (status: string): string => {
      // One vocabulary, shared with the list screen and the status pill. The
      // hand-written switch that used to live here named the retracted states
      // inline because the shared helper answered "Active" for them; it does
      // not any more.
      return resolveStatusLabel(status ?? '', (key) => tx(key));
    },
    [tx],
  );

  return useMemo(() => ({ tx, statusLabel }), [tx, statusLabel]);
}

/** Badge tone for a whole prescription, with the retracted statuses promoted. */
function headerTone(status: string, statusColor: PrescriptionSummary['status_color']): StatusTone {
  const s = (status ?? '').toLowerCase();
  if (RETRACTED_STATUSES.includes(s)) return 'critical';
  if (s === 'amended') return 'warning';
  return prescriptionTone(status, statusColor);
}

/** The three per-line outcomes the API records, plus a bucket for anything new. */
type LineState = 'dispensed' | 'pending' | 'cancelled' | 'other';

function lineStateOf(item: PrescriptionItemDetail): LineState {
  const raw = (item.status || (item.is_dispensed ? 'dispensed' : 'pending')).toLowerCase();
  if (raw === 'dispensed' || raw === 'pending' || raw === 'cancelled') return raw;
  return 'other';
}

/* -- Pieces ---------------------------------------------------------------- */

/** The MED-001 navy hero: two numerals and the pill mark. */
function SummaryHero({ prescriptions, medications }: { prescriptions: number; medications: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <View
      style={styles.hero}
      accessible
      accessibilityLabel={a11yJoin(
        `${prescriptions} ${t('prescriptions.summaryActive')}`,
        `${medications} ${t('prescriptions.summaryMedications')}`,
      )}
    >
      <View style={styles.heroCol}>
        <Text style={styles.heroLabel}>{t('prescriptions.summaryActive')}</Text>
        <Text style={styles.heroNumber}>{pad(prescriptions)}</Text>
      </View>
      <View style={styles.heroDivider} />
      <View style={styles.heroCol}>
        <Text style={styles.heroLabel}>{t('prescriptions.summaryMedications')}</Text>
        <Text style={[styles.heroNumber, styles.heroNumberGreen]}>{pad(medications)}</Text>
      </View>
      <View style={styles.heroMark}>
        <Icon name="pill" size={40} color={colors.textOnBrand} />
      </View>
    </View>
  );
}

function PrescriptionRow({
  prescription,
  index,
  onPress,
}: {
  prescription: PrescriptionSummary;
  index: number;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors, tintMap, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const vocab = usePrescriptionVocab();
  const tint: Tint = ROW_TINTS[index % ROW_TINTS.length];

  // Same query the detail screen uses, so opening this row is instant
  // afterwards. Until it lands the row falls back to the count line, which is
  // true either way — nothing here waits on it or invents a name.
  const { data: detail } = usePrescriptionDetail(prescription.id);
  const items = detail?.items ?? [];

  const status = (prescription.status ?? '').toLowerCase();
  const remaining = daysUntil(prescription.expires_at);
  const lapsed = remaining !== null && remaining < 0;
  const terminal = TERMINAL_STATUSES.includes(status);
  // Checked against the date as well as the status: a nightly sweep can lag,
  // and a prescription still flagged `active` whose expiry was yesterday is
  // expired in every way that matters at a pharmacy counter.
  const expired = status === 'expired' || lapsed;
  const fillable = !terminal && !expired;

  // An expiry is only worth a countdown while the prescription can still be
  // filled, and only inside the window where the date changes what you'd do.
  const expiringInDays =
    fillable && remaining !== null && remaining >= 0 && remaining <= EXPIRY_WARNING_WINDOW_DAYS ? remaining : null;
  const expiryLabel =
    expiringInDays === null
      ? null
      : expiringInDays === 0
        ? t('prescriptions.expiresToday')
        : t('prescriptions.expiresInDays', { count: expiringInDays });

  const counts = items.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[lineStateOf(item)] += 1;
      return acc;
    },
    { total: 0, dispensed: 0, pending: 0, cancelled: 0, other: 0 },
  );
  const partial = counts.dispensed > 0 && counts.pending > 0;

  const title = prescription.facility_name ?? t('prescriptions.unknownFacility');
  const statusLabel = vocab.statusLabel(prescription.status);

  // The drug line. The index endpoint carries no names, so this only fills in
  // once the per-row detail lands; the count is the floor under it.
  const countLine = t('prescriptions.medicationCount', {
    count: prescription.item_count,
  });
  const firstDrug = items[0]?.drug_name ?? null;
  const extra = Math.max(0, (prescription.item_count || counts.total) - 1);
  const drugLine = firstDrug
    ? extra > 0
      ? `${firstDrug} ${vocab.tx('prescriptions.morePlus', {
          n: extra,
          defaultValue: '+{{n}} more',
        })}`
      : firstDrug
    : countLine;

  const dateLine = prescription.prescribed_at
    ? t('prescriptions.prescribedOn', {
        date: fmtShortDate(prescription.prescribed_at),
      })
    : t('prescriptions.dateUnknown');
  const reference = t('prescriptions.reference', {
    code: referenceCode(prescription.id, prescription.reference),
  });

  const progressLine =
    counts.total > 0 && (partial || counts.cancelled > 0)
      ? vocab.tx('prescriptions.dispensedOfTotal', {
          done: counts.dispensed,
          total: counts.total,
          defaultValue: '{{done}} of {{total}} collected',
        })
      : null;

  const expiredLabel = expired
    ? prescription.expires_at
      ? vocab.tx('prescriptions.expiredOn', {
          date: fmtShortDate(prescription.expires_at),
          defaultValue: 'Expired {{date}}',
        })
      : vocab.tx('prescriptions.statusExpired')
    : null;

  // When the status word already IS "Expired", the dated label replaces it
  // rather than sitting under it as a second badge saying the same thing. A
  // prescription the server still calls `active` past its date gets both: the
  // status it was given, and the fact that it has run out.
  const statusIsExpired = status === 'expired';
  const badgeLabel = statusIsExpired && expiredLabel ? expiredLabel : statusLabel;

  return (
    <Card
      variant="flush"
      accentColor={tintMap[tint].fg}
      onPress={onPress}
      accessibilityLabel={a11yJoin(
        title,
        drugLine,
        firstDrug ? countLine : null,
        dateLine,
        reference,
        badgeLabel,
        statusIsExpired ? null : expiredLabel,
        expiryLabel,
        progressLine,
      )}
    >
      <View style={styles.rxRow}>
        <TintCircle icon="pill" tint={tint} size={48} />
        <View style={styles.rxBody}>
          <Text style={styles.rxTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.rxPurpose} numberOfLines={1}>
            {drugLine}
          </Text>
          <View style={styles.rxMetaRow}>
            <Icon name="calendar" size={14} color={colors.textMuted} />
            <Text style={styles.rxMeta} numberOfLines={1}>
              {dateLine}
              {'  •  '}
              {reference}
            </Text>
          </View>
        </View>
        <View style={styles.rxRight}>
          <StatusBadge
            status={prescription.status}
            // `status_color` returns `default` for expired, which the kit would
            // render as a grey nothing. Promoted here for the same reason
            // `prescriptionTone` already promotes `cancelled`: a prescription
            // that cannot be filled must not look like one that can. A row the
            // server still calls `active` keeps its own tone — the dated
            // "Expired" badge beside it carries the warning instead.
            tone={statusIsExpired ? 'critical' : headerTone(prescription.status, prescription.status_color)}
            label={badgeLabel}
            size="sm"
          />
          {expiredLabel && !statusIsExpired ? (
            <StatusBadge status="expired" tone="critical" icon="alert-triangle" label={expiredLabel} size="sm" />
          ) : expiryLabel ? (
            <StatusBadge status="due" tone="warning" icon="clock" label={expiryLabel} size="sm" />
          ) : null}
        </View>
        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      </View>

      {/* Which lines are filled and which are not. Only drawn when the answer is
          mixed — a prescription that is wholly outstanding or wholly collected
          already says so in its status badge. */}
      {progressLine ? (
        <View style={styles.rxProgress}>
          <View style={styles.bar} importantForAccessibility="no-hide-descendants">
            {items.map((item) => {
              const lineState = lineStateOf(item);
              // Same rule as the detail screen: a line still outstanding is
              // the TRACK, not a filled segment. Painting every segment left
              // "1 of 3 collected" looking like a full bar.
              const settled = lineState === 'dispensed' || lineState === 'cancelled';
              return (
                <View
                  key={item.id}
                  style={[
                    styles.barSegment,
                    {
                      backgroundColor: settled ? statusMap[segmentTone(lineState, fillable)].fg : colors.border,
                    },
                  ]}
                />
              );
            })}
          </View>
          <Text style={styles.rxProgressText}>{progressLine}</Text>
        </View>
      ) : null}
    </Card>
  );
}

/** Bar colour for one drug line — the same tones the detail screen's badges use. */
function segmentTone(state: LineState, fillable: boolean): StatusTone {
  switch (state) {
    case 'dispensed':
      return 'normal';
    case 'cancelled':
      return 'critical';
    case 'pending':
      return fillable ? 'warning' : 'neutral';
    default:
      return 'neutral';
  }
}

/**
 * The state the demo patient — and anyone not yet prescribed anything — sees.
 * It explains the mechanism instead of apologising, and both actions are real
 * routes: `app/appointments/book.tsx` and `app/pharmacy.tsx`.
 */
function FirstRunEmptyState() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.stack}>
      <Card>
        <EmptyState
          icon="pill"
          tint="blue"
          title={t('prescriptions.emptyTitle')}
          message={t('prescriptions.emptyBody')}
          actionLabel={t('prescriptions.emptyBookAppointment')}
          onAction={() => router.push('/appointments/book')}
        />
      </Card>

      <View>
        <SectionHeader variant="overline" title={t('prescriptions.emptyHowTitle')} />
        <CardStack spacing="sm">
          <Card variant="flush">
            <StepRow
              index={1}
              icon="stethoscope"
              tint="blue"
              title={t('prescriptions.emptyStep1Title')}
              body={t('prescriptions.emptyStep1Body')}
            />
          </Card>
          <Card variant="flush">
            <StepRow
              index={2}
              icon="document-text"
              tint="green"
              title={t('prescriptions.emptyStep2Title')}
              body={t('prescriptions.emptyStep2Body')}
            />
          </Card>
          <Card variant="flush">
            <StepRow
              index={3}
              icon="store"
              tint="purple"
              title={t('prescriptions.emptyStep3Title')}
              body={t('prescriptions.emptyStep3Body')}
            />
          </Card>
        </CardStack>
      </View>

      <MedButton
        label={t('prescriptions.emptyFindMedicine')}
        icon="search"
        variant="secondary"
        onPress={() => router.push('/pharmacy')}
      />
    </View>
  );
}

/** One numbered step of the "how a prescription gets here" explainer. */
function StepRow({
  index,
  icon,
  tint,
  title,
  body,
}: {
  index: number;
  icon: IconName;
  tint: Tint;
  title: string;
  body: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.step} accessible accessibilityLabel={a11yJoin(`${index}. ${title}`, body)}>
      <TintCircle icon={icon} tint={tint} size={40} />
      <View style={styles.stepBody}>
        <Text style={styles.stepTitle}>
          {index}. {title}
        </Text>
        <Text style={styles.stepText}>{body}</Text>
      </View>
    </View>
  );
}

/** A filter that matched nothing — a far lighter message than a first run. */
function FilteredEmptyState({ statusLabel, onShowAll }: { statusLabel: string; onShowAll: () => void }) {
  const { t } = useTranslation();

  return (
    <Card>
      <EmptyState
        icon="pill"
        tint="amber"
        title={t('prescriptions.emptyFilterTitle', { status: statusLabel })}
        message={t('prescriptions.emptyFilterBody')}
        actionLabel={t('prescriptions.showAll')}
        onAction={onShowAll}
      />
    </Card>
  );
}

/* -- Styles ---------------------------------------------------------------- */

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },
    header: { gap: spacing.md },
    stack: { gap: spacing.md },

    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    sectionHeader: { flex: 1, marginBottom: 0 },
    count: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    footnote: {
      paddingTop: spacing.xs,
      textAlign: 'center',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },

    // -- Hero ----------------------------------------------------------------
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 4,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: c.navy,
    },
    heroCol: { flex: 1, minWidth: 0 },
    heroDivider: {
      width: 1,
      alignSelf: 'stretch',
      backgroundColor: c.navyLight,
    },
    heroLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textOnBrand,
    },
    heroNumber: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xxl,
      lineHeight: typography.lineHeight.xxl,
      color: c.textOnBrand,
    },
    heroNumberGreen: { color: c.statusNormal },
    heroMark: {
      width: 56,
      height: 56,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // -- Prescription rows ---------------------------------------------------
    rxRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
    rxBody: { flex: 1, minWidth: 0, gap: 2 },
    rxTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: c.textPrimary,
    },
    rxPurpose: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textSecondary,
    },
    rxMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 2,
    },
    rxMeta: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: c.textMuted,
    },
    rxRight: { alignItems: 'flex-end', gap: 4, maxWidth: 124 },

    rxProgress: {
      gap: 5,
      paddingHorizontal: 12,
      paddingBottom: 12,
      marginTop: -2,
    },
    bar: {
      flexDirection: 'row',
      gap: 3,
      height: 6,
      borderRadius: radii.pill,
      overflow: 'hidden',
    },
    barSegment: { flex: 1, borderRadius: radii.pill },
    rxProgressText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: c.textSecondary,
    },

    // -- Explainer steps -----------------------------------------------------
    step: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: spacing.md,
    },
    stepBody: { flex: 1, minWidth: 0, gap: 2 },
    stepTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: c.textPrimary,
    },
    stepText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
    },
  });
