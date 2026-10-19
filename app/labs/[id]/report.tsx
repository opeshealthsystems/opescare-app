import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
/**
 * Lab Report (full) — `/labs/[id]/report`.
 *
 * Port of OPES DIA-004 (design reference src/screens/diagnostics/LabReportFullScreen.tsx (archived prototype, see docs/DESIGN_REFERENCE.md)):
 * the printed report header (patient block, who ordered it, sample / report
 * dates), the plain-language read of what the results mean, the full result
 * table with the laboratory's own reference ranges, the interpretation and
 * signature, the stored PDF when one exists, the demoted technical references,
 * and the report actions.
 *
 * What changed from the OPES source, and why:
 *  - Three fetches (`fetchLabOrder` + `fetchProfile` + `fetchDocuments`) become
 *    one `useLabReport(id)` — this app's contract already returns
 *    `{ order, patient, document }` from `/mobile/labs/{id}/report`.
 *  - `@react-navigation/native` → expo-router. "Send to Doctor" opens the
 *    Messages tab; "View Trends" opens `/labs/[id]/trend`.
 *  - The OPES "Print" tile is GONE, not restyled: this app ships no print
 *    module, and a tile that cannot print is worse than no tile. Its slot goes
 *    to "View Trends", which is real.
 *  - Share sends the report as text (the prescriptions-screen precedent), not
 *    a link: `download_url` is bearer-authenticated, so a shared URL would be
 *    a 401 in the recipient's hands.
 *
 * PATIENT SAFETY — analyte names lead; codes, the order UUID and the visit
 * reference are demoted into a collapsed technical block. Reference ranges are
 * only ever the server's own `ref_low` / `ref_high` / `reference`; where the
 * laboratory sent none the row says "Not provided" rather than implying one.
 *
 * A failed read renders
 * the kit `EmptyState` (`LabsUnavailable`), never a crash or an endless spinner.
 */
import { downloadPdfWithRefresh } from '@/lib/pdfDownload';
import React, { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
  useDialog,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import {
  ActionGrid,
  HeroBand,
  InfoStrip,
  LoadingBlock,
  Overline,
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
  useLabReport,
  type LabOrderDetail,
  type LabReportDocument,
  type PortalLabResult,
} from '@/lib/api/labsQueries';
import { LabsUnavailable, resultFlagLabel, useLabsT, type Tx } from '../index';

function columns(tx: Tx): TableColumn[] {
  return [
    { key: 'test', label: tx('table.test', 'Test'), flex: 2.5 },
    { key: 'result', label: tx('table.result', 'Result'), flex: 1 },
    { key: 'unit', label: tx('table.unit', 'Unit'), flex: 1 },
    { key: 'range', label: tx('table.usualRange', 'Usual Range'), flex: 1.6 },
    { key: 'status', label: tx('table.status', 'Status'), flex: 1, align: 'right' },
  ];
}

/** Latest `entered_at` across the order's results — the report's "Report Date". */
function reportDate(order: LabOrderDetail): string | null {
  const stamps = (order.results ?? [])
    .map((r) => r.entered_at)
    .filter((s): s is string => !!s)
    .sort();
  return stamps.length ? stamps[stamps.length - 1] : null;
}

/**
 * The results the laboratory actually placed outside a range.
 *
 * `unflagged` is excluded deliberately. It means no range existed to compare
 * the value against, so it is neither inside nor outside one; counting it here
 * would put "1 result is outside the usual range" on a report where nothing of
 * the sort was found — an alarm raised by the absence of data.
 */
function offRange(results: PortalLabResult[]): PortalLabResult[] {
  return results.filter((r) => r.flag !== 'normal' && r.flag !== 'unflagged');
}

/**
 * "185 KB" / "1.2 MB". Local rather than imported: the labs slice takes its
 * helpers from `@/components/diagnostics/shared`, and this one lives in the
 * documents slice.
 */
function fmtBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LabReportFullScreen() {
  usePrivateScreen();
  const { t, tx, tr } = useLabsT();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const params = useLocalSearchParams<{ id: string }>();
  const orderId = Array.isArray(params.id) ? params.id[0] : params.id;

  const query = useLabReport(orderId);
  const report = query.data ?? null;
  const COLUMNS = useMemo(() => columns(tx), [tx]);
  /** The lab never sent bounds for this analyte — say so rather than imply one. */
  const NO_RANGE = tx('report.noRange', 'Not provided');

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/labs/[id]', params: { id: orderId } });
  }, [router, orderId]);

  const openTrend = useCallback(
    (analyte?: string) =>
      router.push({
        pathname: '/labs/[id]/trend',
        params: { id: orderId, ...(analyte ? { analyte } : {}) },
      }),
    [router, orderId]
  );

  const closeLabel = t('opesUi.components.close', { defaultValue: 'Close' });

  /** The stored PDF, when the server actually holds one. */
  const openFile = useCallback(
    async (document: LabReportDocument | null) => {
      if (!document) {
        dialog.show({
          title: tx('report.noDownloadTitle', 'No report file yet'),
          message: tx(
            'report.noDownloadBody',
            'The laboratory has not attached a signed PDF to this order. The results above are the full record the server holds.'
          ),
          tone: 'info',
          cancelLabel: closeLabel,
        });
        return;
      }
      try {
        // Fetched into the cache and offered via the share sheet; the signed
        // link lives 15 minutes, so an expired one is re-minted once.
        await downloadPdfWithRefresh(
          { url: document.download_url, filename: `lab-report-${document.label ?? document.id}`, shareTitle: document.label ?? undefined },
          async () => (await query.refetch()).data?.document?.download_url ?? null,
        );
      } catch (e) {
        dialog.alert(
          tx('report.failOpenTitle', 'The report would not open'),
          errorMessage(
            e,
            tx('report.failFallback', 'The file could not be opened on this device. Try again in a moment.')
          )
        );
      }
    },
    [dialog, tx, closeLabel, query]
  );

  /**
   * The report as text. `download_url` is bearer-authenticated, so sharing the
   * URL would hand the recipient a 401 — the readable summary is the honest
   * thing to send.
   */
  const shareReport = useCallback(
    async (order: LabOrderDetail) => {
      const lines = [
        order.name,
        tx('report.shareDate', 'Sample date: {{date}}', { date: fmtDate(order.ordered_at) }),
        ...(order.results ?? []).map(
          (r) =>
            `• ${r.analyte}: ${r.value}${r.unit ? ` ${r.unit}` : ''} (${referenceRange(
              r.ref_low,
              r.ref_high,
              r.reference ?? NO_RANGE
            )}) — ${resultFlagLabel(r.flag, tx, tr)}`
        ),
        order.clinical_notes ?? order.result_summary ?? '',
      ].filter(Boolean);
      try {
        await Share.share({ message: lines.join('\n') });
      } catch {
        // Share sheet dismissed, or no share target on this platform (web).
      }
    },
    [tx, tr, NO_RANGE]
  );

  function renderBody() {
    if (query.isLoading && !report) {
      return <LoadingBlock label={tx('report.loading', 'Loading your report…')} />;
    }
    if (query.error && !report) {
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
    if (!report) return <LoadingBlock label={tx('report.loading', 'Loading your report…')} />;

    const { order, patient, document } = report;
    const results = order.results ?? [];
    const flagged = offRange(results);
    const critical = results.filter((r) => r.flag === 'critical');
    const signedAt = reportDate(order);
    const trendable = results.find((r) => r.numeric_value !== null);

    return (
      <>
        {/* ── Report header ──────────────────────────────────────────── */}
        <Card>
          <Text style={styles.reportTitle}>{tx('report.reportHeading', 'Laboratory Report')}</Text>
          <Text style={styles.reportPanel}>{order.name}</Text>

          <View style={styles.fields}>
            <Field
              icon="person"
              label={tx('report.patientName', 'Patient')}
              value={patient?.name ?? '—'}
              styles={styles}
              colors={colors}
            />
            <Field
              icon="id-card"
              label={tx('report.healthId', 'Health ID')}
              value={patient?.health_id ?? '—'}
              styles={styles}
              colors={colors}
            />
            <Field
              icon="person"
              label={tx('report.sexAge', 'Sex / Age')}
              value={
                patient
                  ? [
                      patient.sex ? titleCase(patient.sex) : null,
                      patient.age != null ? tx('report.years', '{{count}} yrs', { count: patient.age }) : null,
                    ]
                      .filter(Boolean)
                      .join(' / ') || '—'
                  : '—'
              }
              styles={styles}
              colors={colors}
            />
            <Field
              icon="stethoscope"
              label={tx('report.orderedBy', 'Ordered by')}
              value={order.ordered_by_name ?? tx('report.yourCareTeam', 'Your care team')}
              styles={styles}
              colors={colors}
            />
            <Field
              icon="calendar"
              label={tx('report.sampleDate', 'Sample date')}
              value={fmtDate(order.ordered_at)}
              styles={styles}
              colors={colors}
            />
            <Field
              icon="calendar-check"
              label={tx('report.reportDate', 'Report date')}
              value={signedAt ? fmtDate(signedAt) : tx('report.notReportedYet', 'Not reported yet')}
              styles={styles}
              colors={colors}
            />
            <Field
              icon="check-circle"
              label={tx('report.status', 'Status')}
              value={titleCase(order.status)}
              valueColor={order.status === 'completed' ? colors.statusNormal : colors.statusPending}
              styles={styles}
              colors={colors}
            />
            <Field
              icon="flask"
              label={tx('report.priority', 'Priority')}
              value={titleCase(order.priority)}
              styles={styles}
              colors={colors}
            />
          </View>
        </Card>

        {/* ── What the results mean for the patient ──────────────────── */}
        {critical.length > 0 ? (
          <InfoStrip icon="alert-circle" tone="critical" live="assertive">
            <Text style={styles.criticalTitle}>
              {tx(
                'report.criticalTitle',
                critical.length === 1
                  ? '{{count}} result is outside the safe range'
                  : '{{count}} results are outside the safe range',
                { count: critical.length }
              )}
            </Text>
            <Text style={styles.noticeBody}>
              {tx('report.criticalBody', '{{values}}. Contact your care team as soon as possible.', {
                values: critical.map((r) => `${r.analyte} ${r.value}${r.unit ? ` ${r.unit}` : ''}`).join(', '),
              })}
            </Text>
          </InfoStrip>
        ) : flagged.length > 0 ? (
          <InfoStrip icon="info" tone="warning" live="polite">
            <Text style={styles.noticeTitle}>
              {tx(
                'report.flaggedTitle',
                flagged.length === 1
                  ? '{{count}} result is outside the usual range'
                  : '{{count}} results are outside the usual range',
                { count: flagged.length }
              )}
            </Text>
            <Text style={styles.noticeBody}>
              {tx(
                'report.flaggedBody',
                'A value outside the usual range is not a diagnosis on its own. Your care team reads it together with the rest of your record.'
              )}
            </Text>
          </InfoStrip>
        ) : null}

        {/* ── Results ────────────────────────────────────────────────── */}
        <Card>
          <Overline label={tx('report.testResults', 'Test Results')} style={styles.overlineGap} />
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
              <Text style={styles.rangeNote}>
                {tx(
                  'report.rangeNote',
                  'Usual ranges are the laboratory’s own. Where it sent none, the range reads “{{noRange}}”.',
                  { noRange: NO_RANGE }
                )}
              </Text>
              {/* Only when a result actually carries the state — an explanation
                  for something not on the page is just noise. */}
              {results.some((r) => r.flag === 'unflagged') && (
                <Text style={styles.rangeNote}>
                  {tx(
                    'report.unflaggedNote',
                    '“{{label}}” means the laboratory published no usual range for that test, so this result has not been compared with one. It is not the same as a normal result.',
                    { label: tx('flag.unflagged', 'Not recorded') }
                  )}
                </Text>
              )}
            </>
          )}
        </Card>

        {/* ── Interpretation & signature ─────────────────────────────── */}
        {!!(order.clinical_notes || order.result_summary) && (
          <Card>
            <Overline label={tx('report.interpretation', 'Interpretation')} style={styles.overlineGap} />
            <Text style={styles.interpretation}>{order.clinical_notes ?? order.result_summary}</Text>
            <View style={styles.signBlock}>
              <Icon name="shield-check" size={18} color={colors.statusNormal} />
              <View style={styles.signBody}>
                <Text style={styles.signName}>
                  {tx('report.signedBy', 'Electronically signed by {{name}}', {
                    name: order.ordered_by_name ?? tx('report.yourCareTeamLower', 'your care team'),
                  })}
                </Text>
                <Text style={styles.signMeta}>{signedAt ? fmtDateTime(signedAt) : '—'}</Text>
              </View>
            </View>
          </Card>
        )}

        {/* ── The stored PDF, when there is one ──────────────────────── */}
        <Card>
          <Overline label={tx('report.reportFile', 'Report File')} style={styles.overlineGap} />
          {document ? (
            <View style={styles.fileRow}>
              <View style={styles.fileIcon} {...decorative}>
                <Icon name="document-text" size={22} color={colors.blue} />
              </View>
              <View style={styles.fileBody}>
                <Text style={styles.fileName} numberOfLines={2}>
                  {document.label ?? tx('report.fileFallback', 'Laboratory report')}
                </Text>
                <Text style={styles.fileMeta}>
                  {`${(document.file_type ?? 'PDF').toUpperCase()} · ${fmtBytes(document.file_size)} · ${fmtDate(
                    document.created_at
                  )}`}
                </Text>
              </View>
            </View>
          ) : (
            <InfoStrip icon="info" tone="pending">
              <Text style={styles.noticeTitle}>{tx('report.noPdfTitle', 'No signed PDF on file')}</Text>
              <Text style={styles.noticeBody}>
                {tx(
                  'report.noPdfBody',
                  'The laboratory has not attached a document to this order. Everything it did release is shown above.'
                )}
              </Text>
            </InfoStrip>
          )}
        </Card>

        {/* ── Demoted technical references ───────────────────────────── */}
        <TechnicalDetails
          title={tx('report.technicalTitle', 'Technical details')}
          caption={tx('report.technicalCaption', 'Codes and references your care team may ask for.')}
          facts={[
            { label: tx('report.factTestCode', 'Test code'), value: order.code },
            { label: tx('report.factOrderRef', 'Order reference'), value: order.id },
            { label: tx('report.factVisitRef', 'Visit reference'), value: order.encounter_id },
            { label: tx('report.factDocumentRef', 'Document reference'), value: document?.id ?? null },
          ]}
          styles={styles}
          colors={colors}
        />

        <ActionGrid
          actions={[
            {
              key: 'download',
              icon: 'download',
              lines: [tx('report.actionDownload1', 'Download'), tx('report.actionDownload2', 'PDF')],
              onPress: () => void openFile(document),
            },
            {
              key: 'share',
              icon: 'share',
              lines: [tx('report.actionShare1', 'Share'), tx('report.actionShare2', 'Report')],
              onPress: () => void shareReport(order),
            },
            {
              key: 'trends',
              icon: 'activity',
              lines: [tx('report.actionTrends1', 'View'), tx('report.actionTrends2', 'Trends')],
              onPress: () => openTrend(trendable?.analyte),
            },
            {
              key: 'message',
              icon: 'chat',
              lines: [tx('report.actionMessage1', 'Send to Doctor'), tx('report.actionMessage2', 'Message')],
              onPress: () => router.push('/(tabs)/messages'),
            },
          ]}
        />
      </>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={tx('report.title', 'Lab Report')}
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
            refreshing={query.isFetching && !!report}
            onRefresh={() => void query.refetch()}
            tintColor={colors.blue}
          />
        }
      >
        <HeroBand
          title={tx('report.heroTitle', 'Full Laboratory Report')}
          subtitle={tx('report.heroSubtitle', 'The complete report as the laboratory released it.')}
          icon="microscope"
        />
        {renderBody()}
      </ScrollView>
      {dialog.element}
    </SafeAreaView>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function Field({
  icon,
  label,
  value,
  valueColor,
  styles,
  colors,
}: {
  icon: IconName;
  label: string;
  value: string;
  valueColor?: string;
  styles: ReturnType<typeof makeStyles>;
  colors: Palette;
}) {
  return (
    <View style={styles.field} accessible accessibilityLabel={a11yJoin(label, value)}>
      <Icon name={icon} size={16} color={colors.blue} />
      <View style={styles.fieldBody}>
        <Text style={styles.fieldLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.fieldValue, !!valueColor && { color: valueColor }]} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

/**
 * The codes a patient never needs but a clinician sometimes asks for. Collapsed
 * by default so the report reads as a report, not as a database row.
 */
function TechnicalDetails({
  title,
  caption,
  facts,
  styles,
  colors,
}: {
  title: string;
  caption: string;
  facts: { label: string; value: string | null | undefined }[];
  styles: ReturnType<typeof makeStyles>;
  colors: Palette;
}) {
  const [open, setOpen] = useState(false);
  const shown = facts.filter((f) => !!f.value);
  if (shown.length === 0) return null;
  return (
    <Card>
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        style={styles.techHead}
      >
        <Icon name="info" size={18} color={colors.textMuted} />
        <Text style={styles.techTitle}>{title}</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {open && (
        <View style={styles.techBody}>
          <Text style={styles.techCaption}>{caption}</Text>
          {shown.map((f) => (
            <View key={f.label} style={styles.techRow} accessible accessibilityLabel={a11yJoin(f.label, f.value)}>
              <Text style={styles.techLabel} numberOfLines={1}>
                {f.label}
              </Text>
              <Text style={styles.techValue} numberOfLines={2}>
                {f.value}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

    reportTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    reportPanel: {
      marginTop: spacing.xs,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
      textAlign: 'center',
    },

    fields: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      rowGap: spacing.md,
    },
    field: { flexDirection: 'row', gap: spacing.sm, width: '50%', paddingRight: spacing.sm },
    fieldBody: { flex: 1, minWidth: 0 },
    fieldLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    fieldValue: {
      marginTop: 2,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },

    criticalTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.statusCritical,
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

    overlineGap: { marginBottom: spacing.sm },

    flagText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs },
    rangeNote: {
      marginTop: spacing.sm,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },

    interpretation: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    signBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    signBody: { flex: 1, minWidth: 0 },
    signName: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    signMeta: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },

    fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    fileIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.tintBlueBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fileBody: { flex: 1, minWidth: 0 },
    fileName: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    fileMeta: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },

    techHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    techTitle: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    techBody: {
      marginTop: spacing.sm,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      gap: spacing.sm,
    },
    techCaption: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    techRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      borderRadius: radii.sm,
    },
    techLabel: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    techValue: {
      flex: 1.4,
      textAlign: 'right',
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: colors.textPrimary,
    },
  });
