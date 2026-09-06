/**
 * Lab Result Detail — `/labs/[id]`.
 *
 * Port of OPES DIA-002 (UIUX/src/screens/diagnostics/LabResultDetailScreen.tsx):
 * the order identity block, the ordering provider, the normal / low / high /
 * critical counters, the full result table with reference ranges and flag
 * colours, the clinician's review note, and why the test was ordered.
 *
 * "Your clinician's note" (T7) lists `interpretations` — the SHARED notes a
 * reviewing clinician wrote for the patient, with author and date, straight
 * from `GET /mobile/labs/{id}`. With none, the card says "Not yet reviewed",
 * or "Reviewed on … — no note was shared" when `reviewed_at` is set. The
 * block that used to be labelled "Interpretation" is the ORDER's
 * `clinical_notes` / `result_summary` — the pre-test indication — and is now
 * labelled "Why this test was ordered" so a patient does not read the reason
 * for a test as its verdict. Types for the additions live in
 * `lib/api/labInterpretationTypes.ts` (labsQueries.ts is owned elsewhere).
 *
 * Navigation is expo-router: a numeric row opens `/labs/[id]/trend?analyte=…`,
 * the PDF / share tiles open `/labs/[id]/report`, "Contact" and "Send to
 * Doctor" open the Messages tab.
 *
 * A failed read renders
 * the kit `EmptyState` (`LabsUnavailable`), never a crash or an endless spinner.
 */
import React, { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Card,
  Icon,
  ScreenHeader,
  StatusBadge,
  a11yJoin,
  decorative,
  radii,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import {
  ActionGrid,
  DiagButton,
  HeroBand,
  InfoStrip,
  LoadingBlock,
  Overline,
  StatGrid,
  TableHead,
  TableRow,
  colorForFlag,
  errorMessage,
  fmtDate,
  fmtDateTime,
  referenceRange,
  resultRowSpoken,
  titleCase,
  type TableColumn,
} from '@/components/diagnostics/shared';
import {
  isLabsUnavailable,
  useLabResult,
  type LabOrderDetail,
  type PortalLabResult,
} from '@/lib/api/labsQueries';
import type { LabInterpretation, LabOrderDetailWithInterpretations } from '@/lib/api/labInterpretationTypes';
import { LabsUnavailable, resultFlagLabel, useLabsT, type Tx } from './index';

function columns(tx: Tx): TableColumn[] {
  return [
    { key: 'test', label: tx('table.test', 'Test'), flex: 2.2 },
    { key: 'result', label: tx('table.result', 'Result'), flex: 1 },
    { key: 'unit', label: tx('table.unit', 'Unit'), flex: 0.9 },
    { key: 'range', label: tx('table.referenceRange', 'Reference Range'), flex: 1.6 },
    { key: 'status', label: tx('table.status', 'Status'), flex: 1.4, align: 'right' },
  ];
}

function count(results: PortalLabResult[], flag: string): number {
  return results.filter((r) => r.flag === flag).length;
}

/** Latest `entered_at` across the order's results — the reference's "Result Date". */
function resultDate(order: LabOrderDetail): string | null {
  const stamps = (order.results ?? [])
    .map((r) => r.entered_at)
    .filter((s): s is string => !!s)
    .sort();
  return stamps.length ? stamps[stamps.length - 1] : null;
}

export default function LabResultDetailScreen() {
  const { t, tx, tr } = useLabsT();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ id: string }>();
  const orderId = Array.isArray(params.id) ? params.id[0] : params.id;

  const query = useLabResult(orderId);
  // Read through the T7 extension: `interpretations` / `reviewed_at` are
  // optional, so a server without them renders "not yet reviewed".
  const order = (query.data ?? null) as LabOrderDetailWithInterpretations | null;
  const COLUMNS = useMemo(() => columns(tx), [tx]);
  // The lab sent no bounds → print the same honest wording the full report
  // uses, never a bare "—" that reads as "no data".
  const NO_RANGE = tx('report.noRange', 'Not provided');

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/labs');
  }, [router]);

  const openTrend = (analyte?: string) =>
    router.push({ pathname: '/labs/[id]/trend', params: { id: orderId, ...(analyte ? { analyte } : {}) } });
  const openReport = () => router.push({ pathname: '/labs/[id]/report', params: { id: orderId } });
  const openMessages = () => router.push('/(tabs)/messages');

  function renderBody() {
    if (query.isLoading && !order) return <LoadingBlock label={tx('result.loading', 'Loading your result…')} />;
    if (query.error && !order) {
      return (
        <LabsUnavailable
          unavailable={isLabsUnavailable(query.error)}
          message={errorMessage(query.error)}
          onRetry={() => void query.refetch()}
          onFindLab={() => router.push('/care-map')}
          tx={tx}
        />
      );
    }
    if (!order) return <LoadingBlock label={tx('result.loading', 'Loading your result…')} />;

    const results = order.results ?? [];
    const critical = results.filter((r) => r.flag === 'critical');
    const trendable = results.find((r) => r.numeric_value !== null);
    // Only notes with text are listed; the server already sends shared ones only.
    const notes: LabInterpretation[] = (order.interpretations ?? []).filter(
      (n) => typeof n?.patient_note === 'string' && n.patient_note.trim() !== ''
    );

    return (
      <>
        {/* ── Order identity ─────────────────────────────────────────── */}
        <Card>
          <View style={styles.identityHead}>
            <View style={styles.identityCircle} {...decorative}>
              <Icon name="flask" size={24} color={colors.tintGreen} />
            </View>
            <View style={styles.identityBody}>
              <Text style={styles.identityTitle}>{order.name}</Text>
              <View style={styles.identityChip}>
                <Text style={styles.identityChipText}>
                  {order.status === 'completed' ? tx('result.finalResult', 'Final Result') : titleCase(order.status)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.factRow}>
            <Fact
              label={tx('result.orderId', 'Order ID')}
              value={order.code ?? order.id.slice(0, 8).toUpperCase()}
              valueColor={colors.link}
              styles={styles}
              colors={colors}
            />
            <Fact
              label={tx('result.sampleDate', 'Sample Date')}
              value={fmtDate(order.ordered_at)}
              icon
              styles={styles}
              colors={colors}
            />
            <Fact
              label={tx('result.resultDate', 'Result Date')}
              value={fmtDate(resultDate(order))}
              icon
              styles={styles}
              colors={colors}
            />
            <Fact
              label={tx('result.status', 'Status')}
              value={titleCase(order.status)}
              valueColor={order.status === 'completed' ? colors.statusNormal : colors.statusPending}
              last
              styles={styles}
              colors={colors}
            />
          </View>
        </Card>

        {critical.length > 0 && (
          <InfoStrip icon="alert-circle" tone="critical" live="assertive">
            <Text style={styles.alertTitle}>
              {tx(
                'result.criticalTitle',
                critical.length === 1
                  ? '{{count}} critical result in this panel'
                  : '{{count}} critical results in this panel',
                { count: critical.length }
              )}
            </Text>
            <Text style={styles.alertBody}>
              {tx(
                'result.criticalBody',
                '{{values}} — outside the safe range. Contact your care team as soon as possible.',
                {
                  values: critical.map((r) => `${r.analyte} ${r.value}${r.unit ? ` ${r.unit}` : ''}`).join(', '),
                }
              )}
            </Text>
          </InfoStrip>
        )}

        {/* ── Ordering provider ──────────────────────────────────────── */}
        <Card>
          <Overline label={tx('result.orderingProvider', 'Ordering Provider')} style={styles.overlineGap} />
          <View style={styles.providerRow}>
            <View style={styles.avatar} {...decorative}>
              <Icon name="stethoscope" size={24} color={colors.blue} />
            </View>
            <View style={styles.providerBody}>
              <Text style={styles.providerName} numberOfLines={1}>
                {order.ordered_by_name ?? tx('result.careTeam', 'Care team')}
              </Text>
              <Text style={styles.providerRole}>{tx('result.orderingClinician', 'Ordering clinician')}</Text>
            </View>
            <DiagButton
              label={tx('result.contact', 'Contact')}
              icon="chat"
              variant="secondary"
              size="sm"
              onPress={openMessages}
            />
          </View>
        </Card>

        {/* ── Result summary ─────────────────────────────────────────── */}
        <Card>
          <Overline label={tx('result.summary', 'Result Summary')} style={styles.overlineGap} />
          <StatGrid
            wrap
            tiles={[
              {
                key: 'normal',
                label: tx('result.statNormal', 'Normal'),
                value: count(results, 'normal'),
                icon: 'check-circle',
                tint: 'green',
              },
              {
                key: 'low',
                label: tx('result.statLow', 'Low'),
                value: count(results, 'low'),
                icon: 'alert-triangle',
                tint: 'amber',
              },
              {
                key: 'high',
                label: tx('result.statHigh', 'High'),
                value: count(results, 'high'),
                icon: 'arrow-right',
                tint: 'red',
              },
              {
                key: 'critical',
                label: tx('result.statCritical', 'Critical'),
                value: critical.length,
                icon: 'alert-circle',
                tint: 'red',
                critical: true,
              },
              {
                key: 'total',
                label: tx('result.statTotal', 'Total Tests'),
                value: order.result_count ?? results.length,
                icon: 'document-text',
                tint: 'blue',
              },
            ]}
          />
        </Card>

        {/* ── Test results table ─────────────────────────────────────── */}
        <Card>
          <Overline label={tx('result.testResults', 'Test Results')} style={styles.overlineGap} />
          {results.length === 0 ? (
            <InfoStrip icon="clock" tone="pending">
              <Text style={styles.noticeTitle}>{tx('report.pendingTitle', 'Results are not back yet')}</Text>
              <Text style={styles.noticeBody}>
                {tx(
                  'report.pendingBody',
                  'The laboratory has not released a verified result for this order. It appears here as soon as it is signed off.'
                )}
              </Text>
            </InfoStrip>
          ) : (
            <>
              <TableHead columns={COLUMNS} />
              {results.map((r, i) => (
                <TableRow
                  key={r.id}
                  columns={COLUMNS}
                  last={i === results.length - 1}
                  a11yLabel={resultRowSpoken({ ...r, reference: r.reference ?? NO_RANGE }, tr)}
                  a11yHint={
                    r.numeric_value !== null
                      ? tx('a11y.openTrend', 'Shows how this test has changed over time')
                      : undefined
                  }
                  onPress={r.numeric_value !== null ? () => openTrend(r.analyte) : undefined}
                  cells={[
                    { text: r.analyte, bold: true },
                    { text: r.value, bold: true, wrap: true },
                    { text: r.unit ?? '—' },
                    { text: referenceRange(r.ref_low, r.ref_high, r.reference ?? NO_RANGE), wrap: true },
                    {
                      node:
                        r.flag === 'critical' ? (
                          <StatusBadge
                            status="critical"
                            label={tx('flag.critical', 'Critical')}
                            tone="critical"
                            size="sm"
                            icon="alert-circle"
                          />
                        ) : (
                          <Text style={[styles.flagText, { color: colorForFlag(r.flag) }]} numberOfLines={1}>
                            {resultFlagLabel(r.flag, tx, tr)}
                          </Text>
                        ),
                    },
                  ]}
                />
              ))}
            </>
          )}
        </Card>

        {/* ── Your clinician's note ─────────────────────────────────── */}
        <Card>
          <Overline label={tx('result.clinicianNote', 'Your clinician’s note')} style={styles.overlineGap} />
          {notes.length > 0 ? (
            notes.map((n, i) => (
              <View key={`${n.at ?? 'n'}-${i}`} style={[styles.noteItem, i > 0 && styles.noteItemGap]}>
                <InfoStrip icon="check-circle" tone="normal">
                  <Text style={styles.interpretation}>{n.patient_note}</Text>
                  <View style={styles.signRow}>
                    <Text style={styles.signText} numberOfLines={1}>
                      {n.author_name && n.author_role
                        ? tx('result.noteAuthor', '{{name}}, {{role}}', { name: n.author_name, role: n.author_role })
                        : n.author_name ?? n.author_role ?? tx('result.noteAuthorUnknown', 'Your clinician')}
                    </Text>
                    {!!n.at && <Text style={styles.signText}>{fmtDateTime(n.at)}</Text>}
                  </View>
                </InfoStrip>
              </View>
            ))
          ) : order.reviewed_at ? (
            <InfoStrip icon="check-circle" tone="normal">
              <Text style={styles.noticeTitle}>
                {tx('result.reviewedNoNote', 'Reviewed on {{date}} — no note was shared', {
                  date: fmtDate(order.reviewed_at),
                })}
              </Text>
              <Text style={styles.noticeBody}>
                {tx(
                  'result.reviewedNoNoteBody',
                  'A clinician has seen this result. If you have questions, contact the ordering clinician.'
                )}
              </Text>
            </InfoStrip>
          ) : (
            <InfoStrip icon="clock" tone="pending">
              <Text style={styles.noticeTitle}>{tx('result.notReviewed', 'Not yet reviewed by your clinician')}</Text>
              <Text style={styles.noticeBody}>
                {tx('result.notReviewedBody', 'When a clinician reviews this result, their note appears here.')}
              </Text>
            </InfoStrip>
          )}
        </Card>

        {/* ── Why this test was ordered (the order's own notes) ─────── */}
        {!!(order.clinical_notes || order.result_summary) && (
          <Card>
            <Overline label={tx('result.whyOrdered', 'Why this test was ordered')} style={styles.overlineGap} />
            <InfoStrip icon="document-text" tone="pending">
              <Text style={styles.interpretation}>{order.clinical_notes ?? order.result_summary}</Text>
              <View style={styles.signRow}>
                <Text style={styles.signText} numberOfLines={1}>
                  {tx('result.signedBy', 'Electronically signed by: {{name}}', {
                    name: order.ordered_by_name ?? tx('result.careTeam', 'Care team'),
                  })}
                </Text>
                <Text style={styles.signText}>{fmtDateTime(resultDate(order))}</Text>
              </View>
            </InfoStrip>
          </Card>
        )}

        <ActionGrid
          actions={[
            {
              key: 'pdf',
              icon: 'download',
              lines: [tx('result.actionDownload1', 'Download'), tx('result.actionDownload2', 'PDF')],
              onPress: openReport,
            },
            {
              key: 'share',
              icon: 'share',
              lines: [tx('result.actionShare1', 'Share'), tx('result.actionShare2', 'Result')],
              onPress: openReport,
            },
            {
              key: 'trends',
              icon: 'activity',
              lines: [tx('result.actionTrends1', 'View'), tx('result.actionTrends2', 'Trends')],
              onPress: () => openTrend(trendable?.analyte),
            },
            {
              key: 'message',
              icon: 'chat',
              lines: [tx('result.actionMessage1', 'Send to Doctor'), tx('result.actionMessage2', 'Message')],
              onPress: openMessages,
            },
          ]}
        />
      </>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={tx('result.title', 'Lab Result')}
        align="center"
        onBack={goBack}
        actions={[
          {
            icon: 'bell',
            onPress: () => router.push('/notifications'),
            accessibilityLabel: t('opesCore.common.notifications', { defaultValue: 'Notifications' }),
          },
          {
            icon: 'more-vertical',
            onPress: () => router.push('/labs'),
            accessibilityLabel: t('opesCore.common.moreOptions', { defaultValue: 'More options' }),
          },
        ]}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching && !!order}
            onRefresh={() => void query.refetch()}
            tintColor={colors.blue}
          />
        }
      >
        <HeroBand
          title={tx('result.heroTitle', 'Lab Result Detail')}
          subtitle={tx('result.heroSubtitle', 'View your laboratory test result and doctor’s interpretation.')}
          icon="microscope"
        />
        {renderBody()}
      </ScrollView>
    </SafeAreaView>
  );
}

function Fact({
  label,
  value,
  valueColor,
  icon,
  last,
  styles,
  colors,
}: {
  label: string;
  value: string;
  valueColor?: string;
  icon?: boolean;
  last?: boolean;
  styles: ReturnType<typeof makeStyles>;
  colors: Palette;
}) {
  return (
    <View style={[styles.fact, !last && styles.factDivided]} accessible accessibilityLabel={a11yJoin(label, value)}>
      <Text style={styles.factLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.factValueRow}>
        {icon && <Icon name="calendar" size={14} color={colors.blue} />}
        <Text style={[styles.factValue, !!valueColor && { color: valueColor }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

    identityHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
    identityCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.tintGreenBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    identityBody: { flex: 1, minWidth: 0 },
    identityTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: colors.textPrimary,
    },
    identityChip: {
      alignSelf: 'flex-start',
      marginTop: 6,
      borderRadius: radii.pill,
      backgroundColor: colors.primarySoft,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    identityChipText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.link,
    },

    factRow: {
      flexDirection: 'row',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    fact: { flex: 1, alignItems: 'center', paddingHorizontal: 2, gap: 4 },
    factDivided: { borderRightWidth: 1, borderRightColor: colors.divider },
    factLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      color: colors.textSecondary,
    },
    factValueRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    factValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      color: colors.textPrimary,
    },

    alertTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.statusCritical,
    },
    alertBody: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },

    noticeTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    noticeBody: {
      marginTop: spacing.xs / 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },

    overlineGap: { marginBottom: spacing.sm + 2 },

    providerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.tintBlueBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    providerBody: { flex: 1, minWidth: 0 },
    providerName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    providerRole: {
      marginTop: 2,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.link,
    },

    flagText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs },

    interpretation: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    signRow: { marginTop: spacing.sm },
    noteItem: {},
    noteItemGap: { marginTop: spacing.sm },
    signText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      color: colors.textSecondary,
    },
  });
