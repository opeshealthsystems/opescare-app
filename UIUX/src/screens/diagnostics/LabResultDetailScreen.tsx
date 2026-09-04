/**
 * DIA-002 — Lab Result Detail.
 *
 * One lab order from `/patient/lab-orders/{id}`: the order identity block, the
 * ordering provider, the normal / low / high counters, the full result table
 * with reference ranges and flag colours, and the clinician's interpretation.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchLabOrder, type LabOrderDetail, type PortalLabResult } from '../../api';
import { Card, Icon, ScreenHeader, StatusBadge } from '../../components';
import { a11yJoin, decorative } from '../../components/a11y';
import { useUnread } from '../../context/UnreadContext';
import { type TFunction, useTranslation } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import {
  ActionGrid,
  AsyncBoundary,
  colorForFlag,
  DiagButton,
  fmtDate,
  fmtDateTime,
  flagLabel,
  HeroBand,
  InfoStrip,
  Overline,
  referenceRange,
  resultRowSpoken,
  StatGrid,
  TableColumn,
  TableHead,
  TableRow,
  titleCase,
  toneForFlag,
  useAsync,
} from './shared';

function columns(t: TFunction): TableColumn[] {
  return [
    { key: 'test', label: t('diagnostics.table.test'), flex: 2.2 },
    { key: 'result', label: t('diagnostics.table.result'), flex: 1 },
    { key: 'unit', label: t('diagnostics.table.unit'), flex: 0.9 },
    { key: 'range', label: t('diagnostics.table.referenceRange'), flex: 1.6 },
    { key: 'status', label: t('diagnostics.table.status'), flex: 1.4, align: 'right' },
  ];
}

function count(results: PortalLabResult[], flag: string): number {
  return results.filter((r) => r.flag === flag).length;
}

/** Latest `entered_at` across the order's results — the reference's "Result Date". */
function resultDate(order: LabOrderDetail): string | null {
  const stamps = order.results.map((r) => r.entered_at).filter((s): s is string => !!s).sort();
  return stamps.length ? stamps[stamps.length - 1] : null;
}

export function LabResultDetailScreen() {
  const navigation = useNavigation<any>();
  const { notifications } = useUnread();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'LabResultDetail'>>();
  const orderId = params.resultId;
  const state = useAsync<LabOrderDetail>(() => fetchLabOrder(orderId), [orderId]);
  const COLUMNS = columns(t);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('diagnostics.result.title')}
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
          title={t('diagnostics.result.heroTitle')}
          subtitle={t('diagnostics.result.heroSubtitle')}
          icon="microscope"
        />

        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel={t('diagnostics.result.loading')}>
          {(order) => {
            const critical = order.results.filter((r) => r.flag === 'critical');
            const trendable = order.results.find((r) => r.numeric_value !== null);
            // The lab sent no bounds → print the same honest wording the full
            // report uses, never a bare "—" that reads as "no data".
            const NO_RANGE = t('diagnostics.report.noRange');

            return (
              <>
                {/* ── Order identity ─────────────────────────────────── */}
                <Card>
                  <View style={styles.identityHead}>
                    <View style={styles.identityCircle} {...decorative}>
                      <Icon name="flask" size={24} color={colors.blue} />
                    </View>
                    <View style={styles.identityBody}>
                      <Text style={styles.identityTitle}>{order.name}</Text>
                      <View style={styles.identityChip}>
                        <Text style={styles.identityChipText}>
                          {order.status === 'completed'
                            ? t('diagnostics.result.finalResult')
                            : titleCase(order.status)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.factRow}>
                    <Fact
                      label={t('diagnostics.result.orderId')}
                      value={order.code ?? order.id.slice(0, 8).toUpperCase()}
                      valueColor={colors.link}
                    />
                    <Fact label={t('diagnostics.result.sampleDate')} value={fmtDate(order.ordered_at)} icon />
                    <Fact label={t('diagnostics.result.resultDate')} value={fmtDate(resultDate(order))} icon />
                    <Fact
                      label={t('diagnostics.result.status')}
                      value={titleCase(order.status)}
                      valueColor={order.status === 'completed' ? colors.statusNormal : colors.statusPending}
                      last
                    />
                  </View>
                </Card>

                {critical.length > 0 && (
                  <InfoStrip icon="alert-circle" tone="critical" live="assertive">
                    <Text style={styles.alertTitle}>
                      {t('diagnostics.result.criticalTitle', { count: critical.length })}
                    </Text>
                    <Text style={styles.alertBody}>
                      {t('diagnostics.result.criticalBody', {
                        values: critical
                          .map((r) => `${r.analyte} ${r.value}${r.unit ? ` ${r.unit}` : ''}`)
                          .join(', '),
                      })}
                    </Text>
                  </InfoStrip>
                )}

                {/* ── Ordering provider ──────────────────────────────── */}
                <Card>
                  <Overline label={t('diagnostics.result.orderingProvider')} style={styles.overlineGap} />
                  <View style={styles.providerRow}>
                    <View style={styles.avatar} {...decorative}>
                      <Icon name="stethoscope" size={24} color={colors.blue} />
                    </View>
                    <View style={styles.providerBody}>
                      <Text style={styles.providerName} numberOfLines={1}>
                        {order.ordered_by_name ?? t('diagnostics.result.careTeam')}
                      </Text>
                      <Text style={styles.providerRole}>{t('diagnostics.result.orderingClinician')}</Text>
                    </View>
                    <DiagButton
                      label={t('diagnostics.result.contact')}
                      icon="phone"
                      variant="secondary"
                      size="sm"
                      onPress={() => navigation.navigate('NewMessage')}
                    />
                  </View>
                </Card>

                {/* ── Result summary ─────────────────────────────────── */}
                <Card>
                  <Overline label={t('diagnostics.result.summary')} style={styles.overlineGap} />
                  <StatGrid
                    wrap
                    tiles={[
                      {
                        key: 'normal',
                        label: t('diagnostics.result.statNormal'),
                        value: count(order.results, 'normal'),
                        icon: 'check-circle',
                        tint: 'green',
                      },
                      {
                        key: 'low',
                        label: t('diagnostics.result.statLow'),
                        value: count(order.results, 'low'),
                        icon: 'alert-triangle',
                        tint: 'amber',
                      },
                      {
                        // High no longer swallows the critical count — that has
                        // its own tile, so this matches the banner exactly.
                        key: 'high',
                        label: t('diagnostics.result.statHigh'),
                        value: count(order.results, 'high'),
                        icon: 'arrow-right',
                        tint: 'red',
                      },
                      {
                        key: 'critical',
                        label: t('diagnostics.result.statCritical'),
                        value: critical.length,
                        icon: 'alert-circle',
                        tint: 'red',
                        critical: true,
                      },
                      {
                        key: 'total',
                        label: t('diagnostics.result.statTotal'),
                        value: order.result_count,
                        icon: 'document-text',
                        tint: 'blue',
                      },
                    ]}
                  />
                </Card>

                {/* ── Test results table ─────────────────────────────── */}
                <Card>
                  <Overline label={t('diagnostics.result.testResults')} style={styles.overlineGap} />
                  <TableHead columns={COLUMNS} />
                  {order.results.map((r, i) => (
                    <TableRow
                      key={r.id}
                      columns={COLUMNS}
                      last={i === order.results.length - 1}
                      a11yLabel={resultRowSpoken({ ...r, reference: r.reference ?? NO_RANGE }, t)}
                      a11yHint={r.numeric_value !== null ? t('diagnostics.a11y.openTrend') : undefined}
                      onPress={
                        r.numeric_value !== null
                          ? () => navigation.navigate('LabResultTrend', { resultId: order.id, analyte: r.analyte })
                          : undefined
                      }
                      cells={[
                        { text: r.analyte, bold: true },
                        { text: r.value, bold: true, wrap: true },
                        { text: r.unit ?? '—' },
                        { text: referenceRange(r.ref_low, r.ref_high, r.reference ?? NO_RANGE), wrap: true },
                        {
                          node:
                            r.flag === 'critical' ? (
                              <StatusBadge
                                status={t('diagnostics.flag.critical')}
                                tone="critical"
                                size="sm"
                                icon="alert-circle"
                              />
                            ) : (
                              <Text style={[styles.flagText, { color: colorForFlag(r.flag) }]} numberOfLines={1}>
                                {flagLabel(r.flag, t)}
                              </Text>
                            ),
                        },
                      ]}
                    />
                  ))}
                </Card>

                {/* ── Interpretation ─────────────────────────────────── */}
                {!!(order.clinical_notes || order.result_summary) && (
                  <Card>
                    <Overline label={t('diagnostics.result.interpretation')} style={styles.overlineGap} />
                    <InfoStrip icon="document-text" tone="pending">
                      <Text style={styles.interpretation}>{order.clinical_notes ?? order.result_summary}</Text>
                      <View style={styles.signRow}>
                        <Text style={styles.signText} numberOfLines={1}>
                          {t('diagnostics.result.signedBy', {
                            name: order.ordered_by_name ?? t('diagnostics.result.careTeam'),
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
                      lines: [
                        t('diagnostics.result.actionDownload1'),
                        t('diagnostics.result.actionDownload2'),
                      ],
                      onPress: () => navigation.navigate('LabReportFull', { reportId: order.id }),
                    },
                    {
                      key: 'share',
                      icon: 'share',
                      lines: [
                        t('diagnostics.result.actionShare1'),
                        t('diagnostics.result.actionShare2'),
                      ],
                      onPress: () => navigation.navigate('LabReportFull', { reportId: order.id }),
                    },
                    {
                      key: 'trends',
                      icon: 'activity',
                      lines: [
                        t('diagnostics.result.actionTrends1'),
                        t('diagnostics.result.actionTrends2'),
                      ],
                      onPress: () =>
                        navigation.navigate('LabResultTrend', {
                          resultId: order.id,
                          analyte: trendable?.analyte,
                        }),
                    },
                    {
                      key: 'message',
                      icon: 'chat',
                      lines: [
                        t('diagnostics.result.actionMessage1'),
                        t('diagnostics.result.actionMessage2'),
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

function Fact({
  label,
  value,
  valueColor,
  icon,
  last,
}: {
  label: string;
  value: string;
  valueColor?: string;
  icon?: boolean;
  last?: boolean;
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  identityHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  identityCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.tintBlueBg,
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
  signText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
});
