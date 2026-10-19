import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
/**
 * Lab Result Trend — `/labs/[id]/trend?analyte=…`.
 *
 * Port of OPES DIA-003 (design reference src/screens/diagnostics/LabResultTrendScreen.tsx (archived prototype, see docs/DESIGN_REFERENCE.md)):
 * one analyte's series across every order it appears in — the switcher, the
 * critical banner, the latest value with its direction, the plotted chart, and
 * the newest-first history table.
 *
 * What changed from the OPES source, and why:
 *  - `useAsync(fetchDiagnosticsSummary + fetchLabTrend)` → the two react-query
 *    hooks `useDiagnosticsSummary()` and `useLabTrend(analyte)`. A trend is
 *    keyed by ANALYTE, not by order id (the series spans every order the
 *    analyte appears in), so `id` here is only the order to return to.
 *  - The summary is the analyte SWITCHER, not the trend itself: if it fails the
 *    chips are simply absent and the named analyte still plots.
 *  - `@react-navigation/native` → expo-router. "Change test" goes back to
 *    `/labs`; the action tiles open `/labs/[id]` and `/labs/[id]/report`;
 *    "Message" opens the Messages tab.
 *
 * A failed read renders
 * the kit `EmptyState` (`LabsUnavailable`), never a crash or an endless spinner.
 * Nothing is interpolated or invented — the chart plots only the points the
 * server sent.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Card,
  CardStack,
  Chip,
  EmptyState,
  Icon,
  ScreenHeader,
  StatusBadge,
  decorative,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import {
  ActionGrid,
  DiagButton,
  HeroBand,
  InfoStrip,
  LoadingBlock,
  Overline,
  TableHead,
  TableRow,
  colorForFlag,
  errorMessage,
  flagSpoken,
  fmtDate,
  rangeSpoken,
  referenceRange,
  toneForFlag,
  trimNum,
  type TableColumn,
} from '@/components/diagnostics/shared';
import { TrendChart } from '@/components/diagnostics/TrendChart';
import { isLabsUnavailable, useDiagnosticsSummary, useLabTrend, type LabTrend } from '@/lib/api/labsQueries';
import { LabsUnavailable, resultFlagLabel, useLabsT, type Tx } from '../index';

function columns(tx: Tx): TableColumn[] {
  return [
    { key: 'date', label: tx('table.date', 'Date'), flex: 1.5 },
    { key: 'result', label: tx('table.result', 'Result'), flex: 1 },
    { key: 'unit', label: tx('table.unit', 'Unit'), flex: 0.9 },
    {
      key: 'range',
      label: tx('table.referenceRange', 'Reference Range'),
      flex: 1.5,
    },
    {
      key: 'status',
      label: tx('table.status', 'Status'),
      flex: 1.4,
      align: 'right',
    },
  ];
}

/**
 * The kit has no up / down arrow pair, so direction is carried by the WORD
 * ("Rising" / "Falling" / "Stable") and the flag colour, with the neutral
 * arrow and minus as the mark. Never an emoji, never an inlined SVG.
 */
const DIRECTION_ICON: Record<LabTrend['direction'], IconName> = {
  up: 'arrow-right',
  down: 'arrow-right',
  flat: 'minus',
};

/** Literal keys, not a lookup table, so an i18n audit can see them. */
function directionLabel(direction: LabTrend['direction'], tx: Tx): string {
  switch (direction) {
    case 'up':
      return tx('trend.dirRising', 'Rising');
    case 'down':
      return tx('trend.dirFalling', 'Falling');
    default:
      return tx('trend.dirStable', 'Stable');
  }
}

export default function LabResultTrendScreen() {
  usePrivateScreen();
  const { t, tx, tr } = useLabsT();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ id: string; analyte?: string }>();
  const orderId = Array.isArray(params.id) ? params.id[0] : params.id;
  const routeAnalyte = Array.isArray(params.analyte) ? params.analyte[0] : params.analyte;

  /** `null` until the patient picks one; the route's analyte is the first choice. */
  const [picked, setPicked] = useState<string | null>(routeAnalyte ?? null);

  const summaryQuery = useDiagnosticsSummary();
  const trendable = summaryQuery.data?.trendable_analytes ?? [];
  // With no analyte named, plot the first one the summary offers.
  const analyte = picked ?? trendable[0];
  const trendQuery = useLabTrend(analyte);

  const series = trendQuery.data ?? null;
  const COLUMNS = useMemo(() => columns(tx), [tx]);
  const NO_RANGE = tx('report.noRange', 'Not provided');

  const refetchSummary = summaryQuery.refetch;
  const refetchTrend = trendQuery.refetch;
  const refetch = useCallback(() => {
    void refetchSummary();
    void refetchTrend();
  }, [refetchSummary, refetchTrend]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/labs/[id]', params: { id: orderId } });
  }, [router, orderId]);

  const openOrder = useCallback(
    () => router.push({ pathname: '/labs/[id]', params: { id: orderId } }),
    [router, orderId],
  );
  const openReport = useCallback(
    () => router.push({ pathname: '/labs/[id]/report', params: { id: orderId } }),
    [router, orderId],
  );
  const openMessages = useCallback(() => router.push('/(tabs)/messages'), [router]);

  // The trend is the screen; the summary only feeds the switcher. Loading is
  // whichever of the two is still needed to draw something.
  const waiting = (summaryQuery.isLoading && !summaryQuery.data && !picked) || (trendQuery.isLoading && !series);
  const failure = trendQuery.error ?? (trendable.length === 0 ? summaryQuery.error : null) ?? null;

  function renderBody() {
    if (waiting) return <LoadingBlock label={tx('trend.loading', 'Loading this trend…')} />;

    if (failure && !series) {
      return (
        <LabsUnavailable
          unavailable={isLabsUnavailable(failure)}
          message={errorMessage(failure)}
          onRetry={refetch}
          onFindLab={() => router.push('/care-map')}
          tx={tx}
        />
      );
    }

    // The reads succeeded and there is simply nothing chartable — a different
    // statement from "the server does not serve this", and a different screen.
    if (!analyte) {
      return (
        <Card>
          <EmptyState
            icon="activity"
            tint="green"
            title={tx('trend.noneAvailableTitle', 'Nothing to chart yet')}
            message={tx(
              'trend.noneAvailableBody',
              'A trend needs at least one numeric result. Yours appear here as soon as the laboratory releases them.',
            )}
            actionLabel={tx('trend.backToResults', 'Back to results')}
            onAction={() => router.push('/labs')}
          />
        </Card>
      );
    }

    if (!series) return <LoadingBlock label={tx('trend.loading', 'Loading this trend…')} />;

    const points = series.points ?? [];
    if (points.length === 0) {
      return (
        <Card>
          <EmptyState
            icon="activity"
            tint="green"
            title={tx('trend.emptyTitle', 'Only one result so far')}
            message={tx(
              'trend.emptyBody',
              'A trend needs more than one result for this test. The next one will draw the line.',
            )}
            actionLabel={tx('trend.backToResults', 'Back to results')}
            onAction={openOrder}
          />
        </Card>
      );
    }

    const latest = series.latest ?? null;
    const flag = latest?.flag ?? points[points.length - 1].flag;
    const isCritical = flag === 'critical';
    const valueColor = colorForFlag(flag);
    const first = points[0];
    const newest = [...points].reverse();
    const dirIcon = DIRECTION_ICON[series.direction] ?? 'minus';
    const dirLabel = directionLabel(series.direction, tx);
    const latestValue = latest ? latest.value : trimNum(points[points.length - 1].value);
    const latestAt = latest?.entered_at ?? points[points.length - 1].recorded_at;

    const latestRangeText = referenceRange(series.ref_low, series.ref_high, latest?.reference ?? NO_RANGE);
    // Never append a unit to "Not provided" — that would read as a value.
    const latestRangeLabel =
      latestRangeText === NO_RANGE || !series.unit ? latestRangeText : `${latestRangeText} ${series.unit}`;

    return (
      <>
        {/* ── Test switcher ──────────────────────────────────────────── */}
        <Card>
          <View style={styles.headRow}>
            <View style={styles.headCircle} {...decorative}>
              <Icon name="droplet" size={24} color={colors.tintGreen} />
            </View>
            <View style={styles.headBody}>
              <Text style={styles.headTitle} numberOfLines={2}>
                {series.analyte}
              </Text>
              <Text style={styles.headCount}>
                {tx('trend.resultsFound', points.length === 1 ? '{{count}} result' : '{{count}} results', {
                  count: points.length,
                })}
              </Text>
            </View>
            <DiagButton
              label={tx('trend.changeTest', 'Change')}
              icon="refresh"
              variant="secondary"
              size="sm"
              onPress={() => router.push('/labs')}
              a11yLabel={tx('trend.changeTestA11y', 'Choose another test to chart')}
            />
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaCol}>
              <Text style={styles.metaLabel}>{tx('trend.dateRange', 'Date range')}</Text>
              <View style={styles.metaValueRow}>
                <Icon name="calendar" size={16} color={colors.blue} />
                <Text style={styles.metaValue} numberOfLines={1}>
                  {`${fmtDate(first?.recorded_at)} – ${fmtDate(latestAt)}`}
                </Text>
              </View>
            </View>
            <View style={[styles.metaCol, styles.metaColDivided]}>
              <Text style={styles.metaLabel}>{tx('trend.viewBy', 'View by')}</Text>
              <Text style={styles.metaValue}>{tx('trend.viewByDate', 'Date')}</Text>
            </View>
          </View>
        </Card>

        {/* ── Analyte chips ──────────────────────────────────────────── */}
        {trendable.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {trendable.map((a) => (
              <Chip
                key={a}
                label={a}
                icon="activity"
                selected={a === series.analyte}
                onPress={() => setPicked(a)}
                accessibilityHint={tx('trend.chipHint', 'Chart this test instead')}
              />
            ))}
          </ScrollView>
        )}

        {/* ── Critical alert ─────────────────────────────────────────── */}
        {isCritical && (
          <InfoStrip icon="alert-circle" tone="critical" live="assertive">
            <Text style={styles.alertTitle}>{tx('trend.criticalTitle', 'This result is outside the safe range')}</Text>
            <Text style={styles.alertBody}>
              {tx('trend.criticalBody', '{{analyte}} is {{value}}, against a usual range of {{range}}.', {
                analyte: series.analyte,
                value: `${latestValue}${series.unit ? ` ${series.unit}` : ''}`,
                range: latestRangeText,
              })}
            </Text>
            <DiagButton
              label={tx('trend.messageDoctor', 'Message your doctor')}
              icon="chat"
              size="sm"
              onPress={openMessages}
              style={styles.alertButton}
            />
          </InfoStrip>
        )}

        {/* ── Latest value + direction ───────────────────────────────── */}
        <Card>
          <View style={styles.latestRow}>
            <View
              style={styles.latestLeft}
              accessible
              // The big number is coloured by flag; spoken, the flag and the
              // laboratory's range have to be said in words.
              accessibilityLabel={tr('opesDiagnostics.a11y.latestResult', {
                analyte: series.analyte,
                value: `${latestValue}${series.unit ? ` ${series.unit}` : ''}`,
                date: fmtDate(latestAt),
                range: rangeSpoken(series.ref_low, series.ref_high, latest?.reference, tr),
                status: flagSpoken(flag, tr),
              })}
            >
              <Text style={styles.latestName}>{series.analyte}</Text>
              <Text style={styles.latestRange}>
                {tx('trend.normalRange', 'Usual range: {{range}}', {
                  range: latestRangeLabel,
                })}
              </Text>
              <View style={styles.latestValueRow}>
                <Text style={[styles.latestValue, { color: valueColor }]}>{latestValue}</Text>
                {!!series.unit && <Text style={[styles.latestUnit, { color: valueColor }]}>{series.unit}</Text>}
              </View>
              <Text style={styles.latestDate}>
                {tx('trend.latestResult', 'Latest result, {{date}}', {
                  date: fmtDate(latestAt),
                })}
              </Text>
              <StatusBadge
                status={flag}
                label={resultFlagLabel(flag, tx, tr)}
                tone={toneForFlag(flag)}
                icon={isCritical ? 'alert-circle' : undefined}
                style={styles.latestBadge}
              />
            </View>

            <View style={styles.latestRight} accessible>
              <Text style={styles.metaLabel}>{tx('trend.trendLabel', 'Trend')}</Text>
              <View style={styles.dirRow}>
                <View style={[styles.dirCircle, { borderColor: valueColor }]} {...decorative}>
                  <Icon name={dirIcon} size={18} color={valueColor} />
                </View>
                <Text style={[styles.dirLabel, { color: valueColor }]}>{dirLabel}</Text>
              </View>
              <Text style={styles.dirMeta}>{tx('trend.vsFirst', 'vs. first result')}</Text>
              {!!first && (
                <Text style={styles.dirMeta}>{`(${trimNum(first.value)}${series.unit ? ` ${series.unit}` : ''})`}</Text>
              )}
              {series.change_percent != null && (
                <Text style={[styles.dirChange, { color: valueColor }]}>
                  {`${series.change_percent > 0 ? '+' : ''}${series.change_percent}%`}
                </Text>
              )}
            </View>
          </View>
        </Card>

        {/* ── Chart ──────────────────────────────────────────────────── */}
        <Card>
          <TrendChart points={points} refLow={series.ref_low} refHigh={series.ref_high} unit={series.unit} />
        </Card>

        {/* ── History table ──────────────────────────────────────────── */}
        <CardStack spacing="sm">
          <Card>
            <Overline label={tx('trend.history', 'History')} style={styles.overlineGap} />
            <TableHead columns={COLUMNS} />
          </Card>
          {newest.map((p, i) => (
            <Card key={`${p.recorded_at ?? 'na'}-${i}`} variant="flush">
              <TableRow
                columns={COLUMNS}
                a11yLabel={tr('opesDiagnostics.a11y.historyRow', {
                  date: fmtDate(p.recorded_at),
                  value: `${trimNum(p.value)}${series.unit ? ` ${series.unit}` : ''}`,
                  range: rangeSpoken(series.ref_low, series.ref_high, latest?.reference, tr),
                  status: flagSpoken(p.flag, tr),
                })}
                a11yHint={tx('trend.historyHint', 'Opens the order this result came from')}
                onPress={openOrder}
                cells={[
                  { text: fmtDate(p.recorded_at), bold: true },
                  { text: trimNum(p.value), bold: true, wrap: true },
                  { text: series.unit ?? '—' },
                  {
                    text: referenceRange(series.ref_low, series.ref_high, latest?.reference ?? NO_RANGE),
                    wrap: true,
                  },
                  {
                    node:
                      p.flag === 'critical' ? (
                        <StatusBadge
                          status="critical"
                          label={tx('flag.critical', 'Critical')}
                          tone="critical"
                          size="sm"
                          icon="alert-circle"
                        />
                      ) : (
                        <Text style={[styles.flagText, { color: colorForFlag(p.flag) }]} numberOfLines={1}>
                          {resultFlagLabel(p.flag, tx, tr)}
                        </Text>
                      ),
                  },
                ]}
              />
            </Card>
          ))}
        </CardStack>

        <ActionGrid
          actions={[
            {
              key: 'detail',
              icon: 'clipboard',
              lines: [tx('trend.actionDetail1', 'Result'), tx('trend.actionDetail2', 'Detail')],
              onPress: openOrder,
            },
            {
              key: 'report',
              icon: 'document-text',
              lines: [tx('trend.actionReport1', 'Full'), tx('trend.actionReport2', 'Report')],
              onPress: openReport,
            },
            {
              key: 'share',
              icon: 'share',
              lines: [tx('trend.actionShare1', 'Share'), tx('trend.actionShare2', 'Result')],
              onPress: openReport,
            },
            {
              key: 'message',
              icon: 'chat',
              lines: [tx('trend.actionMessage1', 'Send to Doctor'), tx('trend.actionMessage2', 'Message')],
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
        title={tx('trend.title', 'Result Trend')}
        align="center"
        onBack={goBack}
        actions={[
          {
            icon: 'bell',
            onPress: () => router.push('/notifications'),
            accessibilityLabel: t('opesCore.common.notifications', {
              defaultValue: 'Notifications',
            }),
          },
          {
            icon: 'more-vertical',
            onPress: () => router.push('/labs'),
            accessibilityLabel: t('opesCore.common.moreOptions', {
              defaultValue: 'More options',
            }),
          },
        ]}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={(trendQuery.isFetching || summaryQuery.isFetching) && !!series}
            onRefresh={refetch}
            tintColor={colors.blue}
          />
        }
      >
        <HeroBand
          title={tx('trend.heroTitle', 'Result Trend')}
          subtitle={tx('trend.heroSubtitle', 'How one test has moved across your results.')}
          icon="activity"
        />
        {renderBody()}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: {
      padding: spacing.md,
      gap: spacing.md,
      paddingBottom: spacing.xxl,
    },

    headRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 4,
    },
    headCircle: {
      width: 52,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headBody: { flex: 1, minWidth: 0 },
    headTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: colors.textPrimary,
    },
    headCount: {
      marginTop: 2,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.link,
    },

    metaRow: {
      flexDirection: 'row',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    metaCol: { flex: 1, gap: 4 },
    metaColDivided: {
      borderLeftWidth: 1,
      borderLeftColor: colors.divider,
      paddingLeft: spacing.md,
    },
    metaLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    metaValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    metaValue: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },

    chipRow: { gap: spacing.sm, paddingRight: spacing.md },

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
    alertButton: { marginTop: spacing.sm, alignSelf: 'flex-start' },

    latestRow: { flexDirection: 'row', gap: spacing.md },
    latestLeft: { flex: 1.35, minWidth: 0 },
    latestRight: {
      flex: 1,
      borderLeftWidth: 1,
      borderLeftColor: colors.divider,
      paddingLeft: spacing.md,
      gap: 2,
    },
    latestName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    latestRange: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    latestValueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
      marginTop: spacing.sm,
    },
    latestValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xxl,
    },
    latestUnit: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
    },
    latestDate: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    latestBadge: { marginTop: spacing.sm },

    dirRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: 6,
    },
    dirCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dirLabel: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
    },
    dirMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    dirChange: {
      marginTop: 2,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },

    overlineGap: { marginBottom: spacing.sm + 2 },
    flagText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
    },
  });
