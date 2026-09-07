/**
 * Labs — `/labs`.
 *
 * Port of the OPES DIA-001 "Laboratory & Imaging Dashboard"
 * (UIUX/src/screens/diagnostics/DiagnosticsDashboardScreen.tsx) onto this
 * app's data hooks.
 *
 * What changed from the OPES source, and why:
 *  - Imaging is out of scope for the Finder (no imaging endpoint), so the
 *    Labs / Imaging chip tabs, the imaging list and the two imaging quick
 *    actions are gone. The remaining quick actions route to the lab screens
 *    that exist here (`/labs/request`, `/labs/sample`) and to the facility
 *    directory (`/care-map`) for "find a laboratory".
 *  - `@react-navigation/native` → expo-router; `useUnread` → none (the bell
 *    simply opens `/notifications`).
 *  - Every hook failure (404 included) renders a kit `EmptyState` — never a
 *    crash, never an endless spinner, never invented rows. The backend serves
 *    these routes now (routes/mobile_labs.php); a 404 means a deployment that
 *    has not loaded them, which is a different message from "no results".
 */
import React, { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Chip,
  EmptyState,
  Icon,
  ListRow,
  ResultList,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
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
  StatGrid,
  errorMessage,
  fmtDate,
  flagLabel,
  toneForFlag,
  type Translate,
} from '@/components/diagnostics/shared';
import {
  isLabsUnavailable,
  useDiagnosticsSummary,
  useLabResults,
  type DiagnosticsSummary,
  type PortalLabOrder,
} from '@/lib/api/labsQueries';

/** How many recent panels the dashboard lists. There is no separate "all lab orders" route. */
const RECENT_LIMIT = 10;

// ── i18n ───────────────────────────────────────────────────────────────────

export type Tx = (key: string, defaultValue: string, params?: Record<string, unknown>) => string;

/**
 * English fallbacks for the `opesDiagnostics.*` keys the SHARED helpers
 * (`flagLabel`, `flagSpoken`, `rangeSpoken`, `resultRowSpoken`) look up
 * without a default. The namespace is being migrated into the locale files
 * by another agent; until it lands, a raw key must never reach a patient.
 */
const SHARED_DEFAULTS: Record<string, string> = {
  'opesDiagnostics.flag.normal': 'Normal',
  'opesDiagnostics.flag.low': 'Low',
  'opesDiagnostics.flag.high': 'High',
  'opesDiagnostics.flag.abnormal': 'Abnormal',
  'opesDiagnostics.flag.critical': 'Critical',
  'opesDiagnostics.flag.pending': 'Awaiting results',
  'opesDiagnostics.flag.unflagged': 'Not recorded',
  'opesDiagnostics.a11y.resultRow': '{{analyte}}, {{value}}. {{range}}. {{status}}',
  'opesDiagnostics.a11y.historyRow': '{{date}}, {{value}}. {{range}}. {{status}}',
  'opesDiagnostics.a11y.latestResult': '{{analyte}}, latest result {{value}} on {{date}}. {{range}}. {{status}}',
  'opesDiagnostics.a11y.rangeUsual': 'Usual range {{range}}',
  'opesDiagnostics.a11y.rangeNone': 'Usual range: {{noRange}}',
  'opesDiagnostics.a11y.statusNormal': 'Normal, within the usual range',
  'opesDiagnostics.a11y.statusLow': 'Low — below the usual range',
  'opesDiagnostics.a11y.statusHigh': 'High — above the usual range',
  'opesDiagnostics.a11y.statusAbnormal': 'Abnormal — outside the usual range',
  'opesDiagnostics.a11y.statusCritical': 'Critical — outside the safe range. Contact your care team.',
  'opesDiagnostics.a11y.statusUnflagged': 'No comparison with a usual range was given',
  'opesDiagnostics.a11y.openTrend': 'Shows how this test has changed over time',
  'opesDiagnostics.report.noRange': 'Not provided',
  'opesDiagnostics.async.loading': 'Loading…',
};

/**
 * The two translators every labs screen uses:
 *  - `tx(key, default, params)` — an `opesDiagnostics.*` key with its English
 *    default, so a screen renders real copy even before the namespace lands.
 *  - `tr` — a `Translate` for the shared helpers, backed by `SHARED_DEFAULTS`.
 */
export function useLabsT() {
  const { t } = useTranslation();
  const tx = useCallback<Tx>(
    (key, defaultValue, params) => String(t(`opesDiagnostics.${key}`, { defaultValue, ...params })),
    [t]
  );
  const tr = useCallback<Translate>(
    (key, params) => String(t(key, { defaultValue: SHARED_DEFAULTS[key] ?? key, ...params })),
    [t]
  );
  return { t, tx, tr };
}

/**
 * A result's flag, as a patient reads it.
 *
 * `flagLabel` in `components/diagnostics/shared` knows normal / low / high /
 * abnormal / critical / pending and falls through to `titleCase(flag)` for
 * anything else — which would print a raw English "Unflagged" to a French
 * reader. `unflagged` is the server's honest "nobody compared this value to
 * anything" state, so it is translated here and rendered as "Not recorded"
 * rather than being allowed to read as a result.
 *
 * It must NEVER be collapsed into "Normal": a value with no reference range is
 * not a value inside one.
 */
export function resultFlagLabel(flag: string, tx: Tx, tr: Translate): string {
  if (flag === 'unflagged') return tx('flag.unflagged', 'Not recorded');
  return flagLabel(flag, tr);
}

export default function LabsDashboardScreen() {
  const { t, tx, tr } = useLabsT();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const summaryQuery = useDiagnosticsSummary();
  const ordersQuery = useLabResults({ per_page: RECENT_LIMIT });

  const summary: DiagnosticsSummary | null = summaryQuery.data ?? null;
  const orders: PortalLabOrder[] = ordersQuery.data?.data ?? [];

  const loading = (summaryQuery.isLoading || ordersQuery.isLoading) && !summary && orders.length === 0;
  const refreshing = (summaryQuery.isFetching || ordersQuery.isFetching) && !loading;
  const failure = summaryQuery.error ?? ordersQuery.error ?? null;

  const refetchSummary = summaryQuery.refetch;
  const refetchOrders = ordersQuery.refetch;
  const refetch = useCallback(() => {
    void refetchSummary();
    void refetchOrders();
  }, [refetchSummary, refetchOrders]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  }, [router]);

  const openOrder = (id: string) => router.push({ pathname: '/labs/[id]', params: { id } });
  const openTrend = (id: string, analyte: string) =>
    router.push({ pathname: '/labs/[id]/trend', params: { id, analyte } });

  const latestOrderId = summary?.latest_lab_order?.id ?? orders[0]?.id ?? null;

  function renderBody() {
    if (loading) return <LoadingBlock label={tx('dashboard.loading', 'Loading your diagnostics…')} />;

    // The whole dashboard depends on the two lab reads; if neither answered
    // there is nothing honest to draw but the empty state.
    if (failure && !summary) {
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

    if (!summary) return <LoadingBlock label={tx('dashboard.loading', 'Loading your diagnostics…')} />;

    const criticalOrder = orders.find((o) => o.overall_flag === 'critical');
    const criticalResult = criticalOrder?.results?.find((r) => r.flag === 'critical');

    return (
      <>
        {summary.results_critical > 0 && (
          <InfoStrip icon="alert-circle" tone="critical" live="assertive">
            <Text style={styles.alertTitle}>
              {tx(
                'dashboard.criticalTitle',
                summary.results_critical === 1
                  ? '{{count}} critical result needs attention'
                  : '{{count}} critical results need attention',
                { count: summary.results_critical }
              )}
            </Text>
            <Text style={styles.alertBody}>
              {criticalResult
                ? tx(
                    'dashboard.criticalBody',
                    '{{analyte}} is outside the safe range at {{value}}. Contact your care team.',
                    {
                      analyte: criticalResult.analyte,
                      value: `${criticalResult.value}${criticalResult.unit ? ` ${criticalResult.unit}` : ''}`,
                    }
                  )
                : tx(
                    'dashboard.criticalBodyGeneric',
                    'One of your results is outside the safe range. Contact your care team.'
                  )}
            </Text>
            {!!criticalResult && !!criticalOrder && (
              <DiagButton
                label={tx('dashboard.reviewCritical', 'Review Critical Result')}
                size="sm"
                variant="secondary"
                iconRight="chevron-right"
                onPress={() => openTrend(criticalOrder.id, criticalResult.analyte)}
                style={styles.alertButton}
              />
            )}
          </InfoStrip>
        )}

        <View>
          <SectionHeader title={tx('dashboard.overview', 'Overview')} />
          <StatGrid
            tiles={[
              {
                key: 'orders',
                label: tx('dashboard.statOrders', 'Lab Orders'),
                value: summary.lab_orders_total,
                icon: 'flask',
                tint: 'green',
              },
              {
                key: 'pending',
                label: tx('dashboard.statPending', 'Pending'),
                value: summary.lab_orders_pending,
                icon: 'clock',
                tint: 'amber',
              },
              {
                key: 'abnormal',
                label: tx('dashboard.statAbnormal', 'Abnormal'),
                value: summary.results_abnormal,
                icon: 'alert-triangle',
                tint: 'purple',
              },
              {
                key: 'critical',
                label: tx('dashboard.statCritical', 'Critical'),
                value: summary.results_critical,
                icon: 'alert-circle',
                tint: 'red',
              },
            ]}
          />
        </View>

        <View>
          <SectionHeader title={tx('dashboard.recentLabs', 'Recent Lab Results')} />
          {ordersQuery.error && orders.length === 0 ? (
            <Card>
              <EmptyState
                icon="flask"
                tint="green"
                title={tx('unavailable.title', 'Lab results aren’t available yet')}
                message={errorMessage(ordersQuery.error)}
                actionLabel={t('opesCore.common.retry', { defaultValue: 'Try again' })}
                onAction={refetch}
              />
            </Card>
          ) : orders.length === 0 ? (
            <Card>
              <EmptyState
                icon="flask"
                tint="green"
                title={tx('dashboard.labsEmptyTitle', 'No lab results yet')}
                message={tx(
                  'dashboard.labsEmptyBody',
                  'Results appear here as soon as the laboratory releases them.'
                )}
                actionLabel={tx('dashboard.labsEmptyCta', 'Request a Lab Test')}
                onAction={() => router.push('/labs/request')}
              />
            </Card>
          ) : (
            <ResultList>
              {orders.map((o) => (
                <Card key={o.id} variant="flush">
                  <ListRow
                    icon="flask"
                    // Labs are the green tint (DESIGN_SPEC §1); only a critical
                    // panel earns the red circle, the badge carries the flag.
                    tint={o.overall_flag === 'critical' ? 'red' : 'green'}
                    title={o.name}
                    meta={[
                      fmtDate(o.ordered_at),
                      tx(
                        'dashboard.resultCount',
                        o.result_count === 1 ? '{{count}} result' : '{{count}} results',
                        { count: o.result_count }
                      ),
                    ]}
                    trailing={
                      <StatusBadge
                        status={o.overall_flag}
                        label={resultFlagLabel(o.overall_flag, tx, tr)}
                        tone={toneForFlag(o.overall_flag)}
                        size="sm"
                      />
                    }
                    onPress={() => openOrder(o.id)}
                    divider={false}
                  />
                </Card>
              ))}
            </ResultList>
          )}
        </View>

        {summary.trendable_analytes.length > 0 && !!latestOrderId && (
          <View>
            <SectionHeader title={tx('dashboard.trackTrend', 'Track a Trend')} />
            <Card>
              <Text style={styles.trendHint}>
                {tx('dashboard.trendHint', 'See how a single analyte has moved across your last results.')}
              </Text>
              <View style={styles.chipWrap}>
                {summary.trendable_analytes.map((a) => (
                  <Chip key={a} label={a} icon="activity" onPress={() => openTrend(latestOrderId, a)} />
                ))}
              </View>
            </Card>
          </View>
        )}

        <View>
          <SectionHeader title={tx('dashboard.quickActions', 'Quick Actions')} />
          <ActionGrid
            actions={[
              {
                key: 'request',
                icon: 'flask',
                lines: [tx('dashboard.actionRequest1', 'Request'), tx('dashboard.actionRequest2', 'Lab Test')],
                onPress: () => router.push('/labs/request'),
              },
              {
                key: 'collection',
                icon: 'syringe',
                lines: [
                  tx('dashboard.actionCollection1', 'Sample'),
                  tx('dashboard.actionCollection2', 'Collection'),
                ],
                onPress: () => router.push('/labs/sample'),
              },
              {
                key: 'find',
                icon: 'location',
                lines: [tx('dashboard.actionFindLab1', 'Find a'), tx('dashboard.actionFindLab2', 'Laboratory')],
                onPress: () => router.push('/care-map'),
              },
              {
                key: 'records',
                icon: 'folder',
                lines: [tx('dashboard.actionRecords1', 'My'), tx('dashboard.actionRecords2', 'Records')],
                onPress: () => router.push('/(tabs)/records'),
              },
            ]}
          />
        </View>

        {!!summary.latest_lab_order && (
          <Card>
            <View style={styles.latestHead}>
              <Icon name="document-text" size={20} color={colors.blue} />
              <Text style={styles.latestTitle}>{tx('dashboard.latestPanel', 'Latest panel')}</Text>
            </View>
            <Text style={styles.latestName}>{summary.latest_lab_order.name}</Text>
            <Text style={styles.latestMeta}>
              {tx('dashboard.latestMeta', '{{date}} · {{count}} results', {
                date: fmtDate(summary.latest_lab_order.ordered_at),
                count: summary.latest_lab_order.result_count,
              })}
            </Text>
            <DiagButton
              label={tx('dashboard.openResultDetail', 'Open Result Detail')}
              iconRight="chevron-right"
              onPress={() => openOrder(summary.latest_lab_order!.id)}
              style={styles.latestButton}
            />
          </Card>
        )}
      </>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={tx('dashboard.title', 'Lab Results')}
        align="center"
        onBack={goBack}
        actions={[
          {
            icon: 'bell',
            onPress: () => router.push('/notifications'),
            accessibilityLabel: t('opesCore.common.notifications', { defaultValue: 'Notifications' }),
          },
        ]}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={colors.blue} />}
      >
        <HeroBand
          title={tx('dashboard.heroTitleLabs', 'Laboratory Results')}
          subtitle={tx('dashboard.heroSubtitleLabs', 'Review your lab results and trends over time.')}
          icon="microscope"
        />
        {renderBody()}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Backend-unavailable state ──────────────────────────────────────────────

/**
 * The Finder API has no `/mobile/labs*` routes yet (a 404 today). This is the
 * one honest thing to draw: a kit `EmptyState` that says so, offers a retry,
 * and points at the facility directory so the patient can still find a lab.
 */
export function LabsUnavailable({
  unavailable,
  message,
  onRetry,
  onFindLab,
  tx,
}: {
  /** True for a 404 / 501 — the feature is not switched on, not a bad network. */
  unavailable: boolean;
  /** Patient-readable failure text for the non-404 case. */
  message: string;
  onRetry: () => void;
  onFindLab: () => void;
  tx: Tx;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Card>
      <EmptyState
        icon="flask"
        tint="green"
        title={tx('unavailable.title', 'Lab results aren’t available yet')}
        message={
          unavailable
            ? tx(
                'unavailable.body',
                'This app can’t reach laboratory results on your server yet. They will appear here as soon as the laboratory service is switched on.'
              )
            : message
        }
        actionLabel={t('opesCore.common.retry', { defaultValue: 'Try again' })}
        onAction={onRetry}
      />
      <DiagButton
        label={tx('unavailable.findLab', 'Find a laboratory near you')}
        icon="location"
        variant="secondary"
        onPress={onFindLab}
        style={styles.unavailableButton}
      />
    </Card>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
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

    unavailableButton: { marginTop: spacing.sm },
  });
