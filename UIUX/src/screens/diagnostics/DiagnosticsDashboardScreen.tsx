/**
 * DIA-001 — Laboratory & Imaging Dashboard.
 *
 * Live on `/patient/diagnostics/summary`, `/patient/lab-orders` and
 * `/patient/imaging`: the counters, the critical-result alert, both result
 * lists and the trendable-analyte chips are all server truth.
 */
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  fetchDiagnosticsSummary,
  fetchImagingStudies,
  fetchLabOrders,
  type DiagnosticsSummary,
  type ImagingModality,
  type PortalImagingStudy,
  type PortalLabOrder,
} from '../../api';
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  IconName,
  ListRow,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
} from '../../components';
import { useUnread } from '../../context/UnreadContext';
import { useTranslation } from '../../i18n';
import { colors, spacing, typography } from '../../theme/theme';
import { cacheKeys } from '../../lib/offlineCache';
import {
  ActionGrid,
  AsyncBoundary,
  DiagButton,
  fmtDate,
  flagLabel,
  HeroBand,
  InfoStrip,
  StatGrid,
  tintForFlag,
  titleCase,
  toneForFlag,
  useAsync,
} from './shared';

type DashboardData = {
  summary: DiagnosticsSummary;
  labs: PortalLabOrder[];
  imaging: PortalImagingStudy[];
};

const MODALITY_ICON: Record<ImagingModality, IconName> = {
  xray: 'image',
  ct: 'grid',
  mri: 'magnet',
  ultrasound: 'activity',
  mammography: 'heart-pulse',
  fluoroscopy: 'video',
  other: 'image',
};

async function load(): Promise<DashboardData> {
  const [summary, labs, imaging] = await Promise.all([
    fetchDiagnosticsSummary(),
    fetchLabOrders({ per_page: 5 }),
    fetchImagingStudies({ per_page: 5 }),
  ]);
  return { summary, labs: labs.data, imaging: imaging.data };
}

export function DiagnosticsDashboardScreen() {
  const navigation = useNavigation<any>();
  const { notifications } = useUnread();
  const { t } = useTranslation();
  const state = useAsync<DashboardData>(load, [], { cacheKey: cacheKeys.diagnosticsDashboard });
  const { reload, reloadIfStale } = state;
  const [tab, setTab] = useState<'labs' | 'imaging'>('labs');

  useFocusEffect(
    useCallback(() => {
      reloadIfStale();
    }, [reloadIfStale])
  );

  const openLab = (id: string) => navigation.navigate('LabResultDetail', { resultId: id });
  const openImaging = (id: string) => navigation.navigate('ImagingResultDetail', { studyId: id });

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('diagnostics.dashboard.title')}
        align="center"
        actions={[{ icon: 'bell', badge: notifications, onPress: () => navigation.navigate('Notifications') }]}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={state.loading && state.data !== null}
            onRefresh={reload}
            tintColor={colors.blue}
          />
        }
      >
        <HeroBand
          title={t('diagnostics.dashboard.heroTitle')}
          subtitle={t('diagnostics.dashboard.heroSubtitle')}
          icon="microscope"
        />

        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel={t('diagnostics.dashboard.loading')}>
          {(data) => {
            const criticalOrder = data.labs.find((o) => o.overall_flag === 'critical');
            const criticalResult = criticalOrder?.results.find((r) => r.flag === 'critical');

            return (
              <>
                {data.summary.results_critical > 0 && (
                  <InfoStrip icon="alert-circle" tone="critical">
                    <Text style={styles.alertTitle}>
                      {t('diagnostics.dashboard.criticalTitle', {
                        count: data.summary.results_critical,
                      })}
                    </Text>
                    <Text style={styles.alertBody}>
                      {criticalResult
                        ? t('diagnostics.dashboard.criticalBody', {
                            analyte: criticalResult.analyte,
                            value: `${criticalResult.value}${
                              criticalResult.unit ? ` ${criticalResult.unit}` : ''
                            }`,
                          })
                        : t('diagnostics.dashboard.criticalBodyGeneric')}
                    </Text>
                    {!!criticalResult && (
                      <DiagButton
                        label={t('diagnostics.dashboard.reviewCritical')}
                        size="sm"
                        variant="secondary"
                        iconRight="chevron-right"
                        onPress={() =>
                          navigation.navigate('LabResultTrend', {
                            resultId: criticalOrder!.id,
                            analyte: criticalResult.analyte,
                          })
                        }
                        style={styles.alertButton}
                      />
                    )}
                  </InfoStrip>
                )}

                <View>
                  <SectionHeader title={t('diagnostics.dashboard.overview')} />
                  <StatGrid
                    tiles={[
                      {
                        key: 'orders',
                        label: t('diagnostics.dashboard.statOrders'),
                        value: data.summary.lab_orders_total,
                        icon: 'flask',
                        tint: 'blue',
                      },
                      {
                        key: 'pending',
                        label: t('diagnostics.dashboard.statPending'),
                        value: data.summary.lab_orders_pending,
                        icon: 'clock',
                        tint: 'amber',
                      },
                      {
                        key: 'abnormal',
                        label: t('diagnostics.dashboard.statAbnormal'),
                        value: data.summary.results_abnormal,
                        icon: 'alert-triangle',
                        tint: 'purple',
                      },
                      {
                        key: 'critical',
                        label: t('diagnostics.dashboard.statCritical'),
                        value: data.summary.results_critical,
                        icon: 'alert-circle',
                        tint: 'red',
                      },
                    ]}
                  />
                </View>

                <View style={styles.tabRow}>
                  <Chip
                    label={t('diagnostics.dashboard.tabLabs')}
                    icon="flask"
                    count={data.summary.lab_orders_total}
                    selected={tab === 'labs'}
                    onPress={() => setTab('labs')}
                  />
                  <Chip
                    label={t('diagnostics.dashboard.tabImaging')}
                    icon="image"
                    count={data.summary.imaging_total}
                    selected={tab === 'imaging'}
                    onPress={() => setTab('imaging')}
                  />
                </View>

                {tab === 'labs' ? (
                  <View>
                    <SectionHeader
                      title={t('diagnostics.dashboard.recentLabs')}
                      actionChevron
                      onAction={() => navigation.navigate('LabReportFull', { reportId: data.labs[0]?.id ?? '' })}
                    />
                    {data.labs.length === 0 ? (
                      <Card>
                        <EmptyState
                          icon="flask"
                          tint="blue"
                          title={t('diagnostics.dashboard.labsEmptyTitle')}
                          message={t('diagnostics.dashboard.labsEmptyBody')}
                          actionLabel={t('diagnostics.dashboard.labsEmptyCta')}
                          onAction={() => navigation.navigate('RequestLabTest')}
                        />
                      </Card>
                    ) : (
                      <Card variant="flush">
                        {data.labs.map((o, i) => (
                          <ListRow
                            key={o.id}
                            icon="flask"
                            tint={tintForFlag(o.overall_flag)}
                            title={o.name}
                            meta={[
                              fmtDate(o.ordered_at),
                              t('diagnostics.dashboard.resultCount', { count: o.result_count }),
                            ]}
                            trailing={
                              <StatusBadge
                                status={flagLabel(o.overall_flag, t)}
                                tone={toneForFlag(o.overall_flag)}
                                size="sm"
                              />
                            }
                            onPress={() => openLab(o.id)}
                            divider={i < data.labs.length - 1}
                          />
                        ))}
                      </Card>
                    )}
                  </View>
                ) : (
                  <View>
                    <SectionHeader
                      title={t('diagnostics.dashboard.recentImaging')}
                      actionChevron
                      onAction={() => navigation.navigate('ImagingHistory')}
                    />
                    {data.imaging.length === 0 ? (
                      <Card>
                        <EmptyState
                          icon="image"
                          tint="purple"
                          title={t('diagnostics.dashboard.imagingEmptyTitle')}
                          message={t('diagnostics.dashboard.imagingEmptyBody')}
                          actionLabel={t('diagnostics.dashboard.imagingEmptyCta')}
                          onAction={() => navigation.navigate('BookImagingStudy')}
                        />
                      </Card>
                    ) : (
                      <Card variant="flush">
                        {data.imaging.map((s, i) => (
                          <ListRow
                            key={s.id}
                            icon={MODALITY_ICON[s.modality]}
                            tint="purple"
                            title={s.study_name}
                            meta={[
                              fmtDate(s.ordered_at),
                              s.has_report
                                ? t('diagnostics.dashboard.reportReady')
                                : t('diagnostics.dashboard.awaitingReport'),
                            ]}
                            trailing={<StatusBadge status={titleCase(s.status)} size="sm" />}
                            onPress={() => openImaging(s.id)}
                            divider={i < data.imaging.length - 1}
                          />
                        ))}
                      </Card>
                    )}
                  </View>
                )}

                {data.summary.trendable_analytes.length > 0 && (
                  <View>
                    <SectionHeader title={t('diagnostics.dashboard.trackTrend')} />
                    <Card>
                      <Text style={styles.trendHint}>{t('diagnostics.dashboard.trendHint')}</Text>
                      <View style={styles.chipWrap}>
                        {data.summary.trendable_analytes.map((a) => (
                          <Chip
                            key={a}
                            label={a}
                            icon="activity"
                            onPress={() =>
                              navigation.navigate('LabResultTrend', {
                                resultId: data.summary.latest_lab_order?.id ?? data.labs[0]?.id ?? '',
                                analyte: a,
                              })
                            }
                          />
                        ))}
                      </View>
                    </Card>
                  </View>
                )}

                <View>
                  <SectionHeader title={t('diagnostics.dashboard.quickActions')} />
                  <ActionGrid
                    actions={[
                      {
                        key: 'request',
                        icon: 'flask',
                        lines: [
                          t('diagnostics.dashboard.actionRequest1'),
                          t('diagnostics.dashboard.actionRequest2'),
                        ],
                        onPress: () => navigation.navigate('RequestLabTest'),
                      },
                      {
                        key: 'collection',
                        icon: 'syringe',
                        lines: [
                          t('diagnostics.dashboard.actionCollection1'),
                          t('diagnostics.dashboard.actionCollection2'),
                        ],
                        onPress: () => navigation.navigate('LabAppointmentCollection'),
                      },
                      {
                        key: 'imaging',
                        icon: 'image',
                        lines: [
                          t('diagnostics.dashboard.actionImaging1'),
                          t('diagnostics.dashboard.actionImaging2'),
                        ],
                        onPress: () => navigation.navigate('ImagingHistory'),
                      },
                      {
                        key: 'book',
                        icon: 'calendar-plus',
                        lines: [
                          t('diagnostics.dashboard.actionBook1'),
                          t('diagnostics.dashboard.actionBook2'),
                        ],
                        onPress: () => navigation.navigate('BookImagingStudy'),
                      },
                    ]}
                  />
                </View>

                {!!data.summary.latest_lab_order && (
                  <Card>
                    <View style={styles.latestHead}>
                      <Icon name="document-text" size={20} color={colors.blue} />
                      <Text style={styles.latestTitle}>{t('diagnostics.dashboard.latestPanel')}</Text>
                    </View>
                    <Text style={styles.latestName}>{data.summary.latest_lab_order.name}</Text>
                    <Text style={styles.latestMeta}>
                      {t('diagnostics.dashboard.latestMeta', {
                        date: fmtDate(data.summary.latest_lab_order.ordered_at),
                        count: data.summary.latest_lab_order.result_count,
                      })}
                    </Text>
                    <DiagButton
                      label={t('diagnostics.dashboard.openResultDetail')}
                      iconRight="chevron-right"
                      onPress={() => openLab(data.summary.latest_lab_order!.id)}
                      style={styles.latestButton}
                    />
                  </Card>
                )}
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

  tabRow: { flexDirection: 'row', gap: spacing.sm },

  trendHint: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm + 2 },

  latestHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  latestTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  latestName: {
    marginTop: spacing.sm,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  latestMeta: {
    marginTop: 2,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  latestButton: { marginTop: spacing.md },
});
