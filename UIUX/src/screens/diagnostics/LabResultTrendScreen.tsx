/**
 * DIA-003 — Lab Result Trend.
 *
 * The chartable series for one analyte from `/patient/lab-trends/{analyte}`,
 * with the analyte switcher fed by `/patient/diagnostics/summary`. The seeded
 * creatinine series ends in a critical value — that state is rendered in full
 * critical styling (banner, red numeral, red charted point, critical badge).
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  fetchDiagnosticsSummary,
  fetchLabTrend,
  type DiagnosticsSummary,
  type LabTrend,
} from '../../api';
import { Card, Chip, EmptyState, Icon, IconName, ScreenHeader, StatusBadge } from '../../components';
import { decorative } from '../../components/a11y';
import { useUnread } from '../../context/UnreadContext';
import { type TFunction, useTranslation } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, spacing, typography } from '../../theme/theme';
import {
  ActionGrid,
  AsyncBoundary,
  colorForFlag,
  DiagButton,
  fmtDate,
  flagLabel,
  flagSpoken,
  HeroBand,
  InfoStrip,
  Overline,
  rangeSpoken,
  referenceRange,
  TableColumn,
  TableHead,
  TableRow,
  toneForFlag,
  trimNum,
  useAsync,
} from './shared';
import { TrendChart } from './TrendChart';

type TrendData = { summary: DiagnosticsSummary; trend: LabTrend };

function columns(t: TFunction): TableColumn[] {
  return [
    { key: 'date', label: t('diagnostics.table.date'), flex: 1.5 },
    { key: 'result', label: t('diagnostics.table.result'), flex: 1 },
    { key: 'unit', label: t('diagnostics.table.unit'), flex: 0.9 },
    { key: 'range', label: t('diagnostics.table.referenceRange'), flex: 1.5 },
    { key: 'status', label: t('diagnostics.table.status'), flex: 1.4, align: 'right' },
  ];
}

const DIRECTION_ICON: Record<LabTrend['direction'], IconName> = {
  up: 'arrow-right',
  down: 'arrow-right',
  flat: 'minus',
};

/** Literal keys, not a lookup table, so `npm run i18n:check` can see them. */
function directionLabel(direction: LabTrend['direction'], t: TFunction): string {
  switch (direction) {
    case 'up':
      return t('diagnostics.trend.dirRising');
    case 'down':
      return t('diagnostics.trend.dirFalling');
    default:
      return t('diagnostics.trend.dirStable');
  }
}

export function LabResultTrendScreen() {
  const navigation = useNavigation<any>();
  const { notifications } = useUnread();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'LabResultTrend'>>();
  const [analyte, setAnalyte] = useState<string | undefined>(params.analyte);
  const COLUMNS = columns(t);

  const state = useAsync<TrendData>(async () => {
    const summary = await fetchDiagnosticsSummary();
    const chosen = analyte ?? summary.trendable_analytes[0];
    if (!chosen) throw new Error(t('diagnostics.trend.noneAvailable'));
    const trend = await fetchLabTrend(chosen);
    return { summary, trend };
  }, [analyte, t]);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('diagnostics.trend.title')}
        align="center"
        actions={[
          { icon: 'bell', badge: notifications, onPress: () => navigation.navigate('Notifications') },
          { icon: 'more-vertical', onPress: () => navigation.navigate('DiagnosticsDashboard') },
        ]}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={state.loading && state.data !== null}
            onRefresh={state.reload}
            tintColor={colors.blue}
          />
        }
      >
        <HeroBand
          title={t('diagnostics.trend.heroTitle')}
          subtitle={t('diagnostics.trend.heroSubtitle')}
          icon="activity"
        />

        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel={t('diagnostics.trend.loading')}>
          {(data) => {
            const series = data.trend;
            const latest = series.latest;
            const isCritical = latest.flag === 'critical';
            const valueColor = colorForFlag(latest.flag);
            const first = series.points[0];
            const newest = [...series.points].reverse();
            const dirIcon = DIRECTION_ICON[series.direction];
            const dirLabel = directionLabel(series.direction, t);
            // Where the lab sent no bounds, print the honest wording, not "—".
            const NO_RANGE = t('diagnostics.report.noRange');
            const latestRangeText = referenceRange(series.ref_low, series.ref_high, latest.reference ?? NO_RANGE);
            // Never append a unit to "Not provided" — that would read as a value.
            const latestRangeLabel =
              latestRangeText === NO_RANGE || !series.unit
                ? latestRangeText
                : `${latestRangeText} ${series.unit}`;

            if (series.points.length === 0) {
              return (
                <Card>
                  <EmptyState
                    icon="activity"
                    tint="blue"
                    title={t('diagnostics.trend.emptyTitle')}
                    message={t('diagnostics.trend.emptyBody')}
                  />
                </Card>
              );
            }

            return (
              <>
                {/* ── Test switcher ──────────────────────────────────── */}
                <Card>
                  <View style={styles.headRow}>
                    <View style={styles.headCircle} {...decorative}>
                      <Icon name="droplet" size={24} color={colors.blue} />
                    </View>
                    <View style={styles.headBody}>
                      <Text style={styles.headTitle} numberOfLines={2}>
                        {series.analyte}
                      </Text>
                      <Text style={styles.headCount}>
                        {t('diagnostics.trend.resultsFound', { count: series.points.length })}
                      </Text>
                    </View>
                    <DiagButton
                      label={t('diagnostics.trend.changeTest')}
                      icon="refresh"
                      variant="secondary"
                      size="sm"
                      onPress={() => navigation.navigate('DiagnosticsDashboard')}
                    />
                  </View>

                  <View style={styles.metaRow}>
                    <View style={styles.metaCol}>
                      <Text style={styles.metaLabel}>{t('diagnostics.trend.dateRange')}</Text>
                      <View style={styles.metaValueRow}>
                        <Icon name="calendar" size={16} color={colors.blue} />
                        <Text style={styles.metaValue} numberOfLines={1}>
                          {fmtDate(first?.recorded_at)} – {fmtDate(latest.entered_at)}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.metaCol, styles.metaColDivided]}>
                      <Text style={styles.metaLabel}>{t('diagnostics.trend.viewBy')}</Text>
                      <Text style={styles.metaValue}>{t('diagnostics.trend.viewByDate')}</Text>
                    </View>
                  </View>
                </Card>

                {/* ── Analyte chips ──────────────────────────────────── */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {data.summary.trendable_analytes.map((a) => (
                    <Chip key={a} label={a} selected={a === series.analyte} onPress={() => setAnalyte(a)} />
                  ))}
                </ScrollView>

                {/* ── Critical alert ─────────────────────────────────── */}
                {isCritical && (
                  <InfoStrip icon="alert-circle" tone="critical" live="assertive">
                    <Text style={styles.alertTitle}>{t('diagnostics.trend.criticalTitle')}</Text>
                    <Text style={styles.alertBody}>
                      {t('diagnostics.trend.criticalBody', {
                        analyte: series.analyte,
                        value: `${latest.value}${series.unit ? ` ${series.unit}` : ''}`,
                        range: referenceRange(series.ref_low, series.ref_high, latest.reference),
                      })}
                    </Text>
                    <DiagButton
                      label={t('diagnostics.trend.messageDoctor')}
                      icon="chat"
                      size="sm"
                      onPress={() => navigation.navigate('NewMessage')}
                      style={styles.alertButton}
                    />
                  </InfoStrip>
                )}

                {/* ── Latest value + direction ───────────────────────── */}
                <Card>
                  <View style={styles.latestRow}>
                    <View
                      style={styles.latestLeft}
                      accessible
                      // The big number is coloured by flag; spoken, the flag
                      // and the laboratory's range have to be said in words.
                      accessibilityLabel={t('diagnostics.a11y.latestResult', {
                        analyte: series.analyte,
                        value: `${latest.value}${series.unit ? ` ${series.unit}` : ''}`,
                        date: fmtDate(latest.entered_at),
                        range: rangeSpoken(series.ref_low, series.ref_high, latest.reference, t),
                        status: flagSpoken(latest.flag, t),
                      })}
                    >
                      <Text style={styles.latestName}>{series.analyte}</Text>
                      <Text style={styles.latestRange}>
                        {t('diagnostics.trend.normalRange', { range: latestRangeLabel })}
                      </Text>
                      <View style={styles.latestValueRow}>
                        <Text style={[styles.latestValue, { color: valueColor }]}>{latest.value}</Text>
                        {!!series.unit && <Text style={[styles.latestUnit, { color: valueColor }]}>{series.unit}</Text>}
                      </View>
                      <Text style={styles.latestDate}>
                        {t('diagnostics.trend.latestResult', { date: fmtDate(latest.entered_at) })}
                      </Text>
                      <StatusBadge
                        status={flagLabel(latest.flag, t)}
                        tone={toneForFlag(latest.flag)}
                        icon={isCritical ? 'alert-circle' : undefined}
                        style={styles.latestBadge}
                      />
                    </View>

                    <View style={styles.latestRight} accessible>
                      <Text style={styles.metaLabel}>{t('diagnostics.trend.trendLabel')}</Text>
                      <View style={styles.dirRow}>
                        <View style={[styles.dirCircle, { borderColor: valueColor }]}>
                          <Icon name={dirIcon} size={18} color={valueColor} />
                        </View>
                        <Text style={[styles.dirLabel, { color: valueColor }]}>{dirLabel}</Text>
                      </View>
                      <Text style={styles.dirMeta}>{t('diagnostics.trend.vsFirst')}</Text>
                      <Text style={styles.dirMeta}>
                        ({trimNum(first.value)}
                        {series.unit ? ` ${series.unit}` : ''})
                      </Text>
                      {series.change_percent != null && (
                        <Text style={[styles.dirChange, { color: valueColor }]}>
                          {series.change_percent > 0 ? '+' : ''}
                          {series.change_percent}%
                        </Text>
                      )}
                    </View>
                  </View>
                </Card>

                {/* ── Chart ──────────────────────────────────────────── */}
                <Card>
                  <TrendChart points={series.points} refLow={series.ref_low} refHigh={series.ref_high} unit={series.unit} />
                </Card>

                {/* ── History table ──────────────────────────────────── */}
                <Card>
                  <Overline label={t('diagnostics.trend.history')} style={styles.overlineGap} />
                  <TableHead columns={COLUMNS} />
                  {newest.map((p, i) => (
                    <TableRow
                      key={`${p.recorded_at}-${i}`}
                      columns={COLUMNS}
                      last={i === newest.length - 1}
                      a11yLabel={t('diagnostics.a11y.historyRow', {
                        date: fmtDate(p.recorded_at),
                        value: `${trimNum(p.value)}${series.unit ? ` ${series.unit}` : ''}`,
                        range: rangeSpoken(series.ref_low, series.ref_high, latest.reference, t),
                        status: flagSpoken(p.flag, t),
                      })}
                      onPress={() => navigation.navigate('LabResultDetail', { resultId: params.resultId })}
                      cells={[
                        { text: fmtDate(p.recorded_at), bold: true },
                        { text: trimNum(p.value), bold: true, wrap: true },
                        { text: series.unit ?? '—' },
                        { text: referenceRange(series.ref_low, series.ref_high, latest.reference ?? NO_RANGE), wrap: true },
                        {
                          node:
                            p.flag === 'critical' ? (
                              <StatusBadge
                                status={t('diagnostics.flag.critical')}
                                tone="critical"
                                size="sm"
                                icon="alert-circle"
                              />
                            ) : (
                              <Text style={[styles.flagText, { color: colorForFlag(p.flag) }]} numberOfLines={1}>
                                {flagLabel(p.flag, t)}
                              </Text>
                            ),
                        },
                      ]}
                    />
                  ))}
                </Card>

                <ActionGrid
                  actions={[
                    {
                      key: 'detail',
                      icon: 'clipboard',
                      lines: [
                        t('diagnostics.trend.actionDetail1'),
                        t('diagnostics.trend.actionDetail2'),
                      ],
                      onPress: () => navigation.navigate('LabResultDetail', { resultId: params.resultId }),
                    },
                    {
                      key: 'download',
                      icon: 'download',
                      lines: [
                        t('diagnostics.trend.actionDownload1'),
                        t('diagnostics.trend.actionDownload2'),
                      ],
                      onPress: () => navigation.navigate('LabReportFull', { reportId: params.resultId }),
                    },
                    {
                      key: 'share',
                      icon: 'share',
                      lines: [
                        t('diagnostics.trend.actionShare1'),
                        t('diagnostics.trend.actionShare2'),
                      ],
                      onPress: () => navigation.navigate('LabReportFull', { reportId: params.resultId }),
                    },
                    {
                      key: 'message',
                      icon: 'chat',
                      lines: [
                        t('diagnostics.trend.actionMessage1'),
                        t('diagnostics.trend.actionMessage2'),
                      ],
                      onPress: () => navigation.navigate('NewMessage'),
                    },
                  ]}
                />
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  headCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.tintBlueBg,
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
  metaColDivided: { borderLeftWidth: 1, borderLeftColor: colors.divider, paddingLeft: spacing.md },
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
  latestValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: spacing.sm },
  latestValue: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.xxl },
  latestUnit: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md },
  latestDate: {
    marginTop: 2,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  latestBadge: { marginTop: spacing.sm },

  dirRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 6 },
  dirCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dirLabel: { flex: 1, fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md },
  dirMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  dirChange: { marginTop: 2, fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },

  overlineGap: { marginBottom: spacing.sm + 2 },
  flagText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs },
});
