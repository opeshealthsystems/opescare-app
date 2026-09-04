/**
 * DIA-004 — Lab Report (full).
 *
 * The whole laboratory report for one order, and the screen that finally makes
 * DIA-002's and DIA-003's "Download PDF" / "Share Result" real.
 *
 * CONTRACTS — every field below comes from an endpoint that exists today:
 *   • GET /patient/lab-orders/{order}  (PatientDiagnosticsController::labOrder)
 *       → PortalPresenter::labOrder(..., withResults: true) + ordered_by_name,
 *         clinical_notes. That is the identity block, the result table with its
 *         ref_low/ref_high/reference/flag, and the interpretation.
 *   • GET /patient/profile             (PatientDashboardController::profile)
 *       → the patient block the report header prints.
 *   • GET /patient/documents?document_type=lab_result
 *       → the stored PDF, matched to this order by encounter. Download / Share
 *         / Print are offered ONLY when such a file exists; the app never
 *         pretends to hold a document the server does not have.
 *
 * PATIENT SAFETY — human-readable analyte names lead; LOINC codes, the order
 * UUID and the encounter reference are demoted into `TechnicalDetails`. Nothing
 * here diagnoses or advises: an out-of-range value is stated, and the patient is
 * pointed at their care team using the same wording DIA-002 already uses.
 * Reference ranges are only ever the server's own ref_low/ref_high/reference —
 * never a threshold invented in the app (the `vitalBands.ts` precedent) — and
 * where the lab sent none the row says so.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  fetchDocuments,
  fetchLabOrder,
  fetchProfile,
  type LabOrderDetail,
  type PortalDocument,
  type PortalLabResult,
  type PortalProfile,
} from '../../api';
import { Card, Icon, ScreenHeader, StatusBadge, useDialog } from '../../components';
import { useUnread } from '../../context/UnreadContext';
import { type TFunction, useTranslation } from '../../i18n';
import { writeFailureMessage } from '../../lib/errors';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, spacing, typography } from '../../theme/theme';
import { fmtBytes, openDocument, shareDocumentLink } from '../docs/shared';
import { TechnicalDetails } from '../imaging/detailShared';
import {
  ActionGrid,
  AsyncBoundary,
  colorForFlag,
  fmtDate,
  fmtDateTime,
  flagLabel,
  HeroBand,
  InfoStrip,
  Overline,
  referenceRange,
  resultRowSpoken,
  TableColumn,
  TableHead,
  TableRow,
  titleCase,
  useAsync,
} from './shared';

function columns(t: TFunction): TableColumn[] {
  return [
    { key: 'test', label: t('diagnostics.table.test'), flex: 2.5 },
    { key: 'result', label: t('diagnostics.table.result'), flex: 1 },
    { key: 'unit', label: t('diagnostics.table.unit'), flex: 1 },
    { key: 'range', label: t('diagnostics.table.usualRange'), flex: 1.6 },
    { key: 'status', label: t('diagnostics.table.status'), flex: 1, align: 'right' },
  ];
}

type Report = {
  order: LabOrderDetail;
  profile: PortalProfile | null;
  /** The stored PDF for this order's encounter, if the server holds one. */
  document: PortalDocument | null;
};

/** Latest `entered_at` across the order's results — the report's "Report Date". */
function reportDate(order: LabOrderDetail): string | null {
  const stamps = order.results
    .map((r) => r.entered_at)
    .filter((s): s is string => !!s)
    .sort();
  return stamps.length ? stamps[stamps.length - 1] : null;
}

function offRange(results: PortalLabResult[]): PortalLabResult[] {
  return results.filter((r) => r.flag !== 'normal');
}

export function LabReportFullScreen() {
  const navigation = useNavigation<any>();
  const { notifications } = useUnread();
  const { params } = useRoute<RouteProp<AppStackParamList, 'LabReportFull'>>();
  const orderId = params.reportId;

  const { t } = useTranslation();
  const dialog = useDialog();
  const COLUMNS = columns(t);
  /** The lab never sent bounds for this analyte — say so rather than imply one. */
  const NO_RANGE = t('diagnostics.report.noRange');
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);

  const load = useCallback(async (): Promise<Report> => {
    const order = await fetchLabOrder(orderId);
    // Neither of these is essential to reading the report, so a failure on
    // either must not hide the results themselves.
    const profile = await fetchProfile().catch(() => null);
    const documents = await fetchDocuments({ document_type: 'lab_result', per_page: 50 })
      .then((page) => page.data)
      .catch(() => [] as PortalDocument[]);

    const document =
      documents.find((d) => !!order.encounter_id && d.encounter_id === order.encounter_id) ?? null;

    return { order, profile, document };
  }, [orderId]);

  const state = useAsync<Report>(load, [orderId]);

  /** One file action at a time, and never a silent failure. */
  async function run(kind: string, failTitle: string, fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      dialog.alert(
        failTitle,
        writeFailureMessage(
          e,
          t('diagnostics.report.failHint'),
          t('diagnostics.report.failFallback')
        )
      );
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('diagnostics.report.title')}
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
          title={t('diagnostics.report.heroTitle')}
          subtitle={t('diagnostics.report.heroSubtitle')}
          icon="microscope"
        />

        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('diagnostics.report.loading')}
        >
          {({ order, profile, document }) => {
            const patient = profile?.patient ?? null;
            const flagged = offRange(order.results);
            const critical = order.results.filter((r) => r.flag === 'critical');
            const signedAt = reportDate(order);

            return (
              <>
                {/* ── Report header ──────────────────────────────────── */}
                <Card>
                  <Text style={styles.reportTitle}>{t('diagnostics.report.reportHeading')}</Text>
                  <Text style={styles.reportPanel}>{order.name}</Text>

                  <View style={styles.fields}>
                    <Field icon="person" label={t('diagnostics.report.patientName')} value={patient?.name ?? '—'} />
                    <Field icon="id-card" label={t('diagnostics.report.healthId')} value={patient?.health_id ?? '—'} />
                    <Field
                      icon="person"
                      label={t('diagnostics.report.sexAge')}
                      value={
                        patient
                          ? [
                              patient.sex ? titleCase(patient.sex) : null,
                              patient.age != null
                                ? t('diagnostics.report.years', { count: patient.age })
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' / ') || '—'
                          : '—'
                      }
                    />
                    <Field
                      icon="stethoscope"
                      label={t('diagnostics.report.orderedBy')}
                      value={order.ordered_by_name ?? t('diagnostics.report.yourCareTeam')}
                    />
                    <Field icon="calendar" label={t('diagnostics.report.sampleDate')} value={fmtDate(order.ordered_at)} />
                    <Field
                      icon="calendar-check"
                      label={t('diagnostics.report.reportDate')}
                      value={signedAt ? fmtDate(signedAt) : t('diagnostics.report.notReportedYet')}
                    />
                    <Field
                      icon="check-circle"
                      label={t('diagnostics.report.status')}
                      value={titleCase(order.status)}
                      valueColor={order.status === 'completed' ? colors.statusNormal : colors.statusPending}
                    />
                    <Field icon="flask" label={t('diagnostics.report.priority')} value={titleCase(order.priority)} />
                  </View>
                </Card>

                {/* ── What the results mean for the patient ──────────── */}
                {critical.length > 0 ? (
                  <InfoStrip icon="alert-circle" tone="critical" live="assertive">
                    <Text style={styles.noticeTitle}>
                      {t('diagnostics.report.criticalTitle', { count: critical.length })}
                    </Text>
                    <Text style={styles.noticeBody}>
                      {t('diagnostics.report.criticalBody', {
                        values: critical
                          .map((r) => `${r.analyte} ${r.value}${r.unit ? ` ${r.unit}` : ''}`)
                          .join(', '),
                      })}
                    </Text>
                  </InfoStrip>
                ) : flagged.length > 0 ? (
                  <InfoStrip icon="info" tone="warning" live="polite">
                    <Text style={styles.noticeTitle}>
                      {t('diagnostics.report.flaggedTitle', { count: flagged.length })}
                    </Text>
                    <Text style={styles.noticeBody}>{t('diagnostics.report.flaggedBody')}</Text>
                  </InfoStrip>
                ) : null}

                {/* ── Results ────────────────────────────────────────── */}
                <Card>
                  <Overline label={t('diagnostics.report.testResults')} style={styles.overlineGap} />
                  {order.results.length === 0 ? (
                    <InfoStrip icon="clock" tone="pending">
                      <Text style={styles.noticeTitle}>{t('diagnostics.report.pendingTitle')}</Text>
                      <Text style={styles.noticeBody}>{t('diagnostics.report.pendingBody')}</Text>
                    </InfoStrip>
                  ) : (
                    <>
                      <TableHead columns={COLUMNS} />
                      {order.results.map((r, i) => (
                        <TableRow
                          key={r.id}
                          columns={COLUMNS}
                          last={i === order.results.length - 1}
                          a11yLabel={resultRowSpoken({ ...r, reference: r.reference ?? NO_RANGE }, t)}
                          cells={[
                            { text: r.analyte, bold: true },
                            { text: r.value, bold: true },
                            { text: r.unit ?? '—' },
                            { text: referenceRange(r.ref_low, r.ref_high, r.reference ?? NO_RANGE) },
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
                      <Text style={styles.rangeNote}>
                        {t('diagnostics.report.rangeNote', { noRange: NO_RANGE })}
                      </Text>
                    </>
                  )}
                </Card>

                {/* ── Interpretation & signature ─────────────────────── */}
                {!!(order.clinical_notes || order.result_summary) && (
                  <Card>
                    <Overline label={t('diagnostics.report.interpretation')} style={styles.overlineGap} />
                    <Text style={styles.interpretation}>{order.clinical_notes ?? order.result_summary}</Text>
                    <View style={styles.signBlock}>
                      <Icon name="shield-check" size={18} color={colors.statusNormal} />
                      <View style={styles.signBody}>
                        <Text style={styles.signName}>
                          {t('diagnostics.report.signedBy', {
                            name: order.ordered_by_name ?? t('diagnostics.report.yourCareTeamLower'),
                          })}
                        </Text>
                        <Text style={styles.signMeta}>{signedAt ? fmtDateTime(signedAt) : '—'}</Text>
                      </View>
                    </View>
                  </Card>
                )}

                {/* ── The stored PDF, when there is one ──────────────── */}
                <Card>
                  <Overline label={t('diagnostics.report.reportFile')} style={styles.overlineGap} />
                  {document ? (
                    <View style={styles.fileRow}>
                      <View style={styles.fileIcon}>
                        <Icon name="document-text" size={22} color={colors.blue} />
                      </View>
                      <View style={styles.fileBody}>
                        <Text style={styles.fileName} numberOfLines={2}>
                          {document.label ?? t('diagnostics.report.fileFallback')}
                        </Text>
                        <Text style={styles.fileMeta}>
                          {(document.file_type ?? 'PDF').toUpperCase()} · {fmtBytes(document.file_size)} ·{' '}
                          {fmtDate(document.created_at)}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <InfoStrip icon="info" tone="pending">
                      <Text style={styles.noticeTitle}>{t('diagnostics.report.noPdfTitle')}</Text>
                      <Text style={styles.noticeBody}>{t('diagnostics.report.noPdfBody')}</Text>
                    </InfoStrip>
                  )}
                </Card>

                <TechnicalDetails
                  caption={t('diagnostics.report.technicalCaption')}
                  facts={[
                    { label: t('diagnostics.report.factTestCode'), value: order.code },
                    { label: t('diagnostics.report.factOrderRef'), value: order.id },
                    { label: t('diagnostics.report.factVisitRef'), value: order.encounter_id },
                    { label: t('diagnostics.report.factDocumentRef'), value: document?.id },
                  ]}
                />

                <ActionGrid
                  actions={[
                    {
                      key: 'download',
                      icon: 'download',
                      lines: [
                        busy === 'download'
                          ? t('diagnostics.report.opening')
                          : t('diagnostics.report.actionDownload1'),
                        t('diagnostics.report.actionDownload2'),
                      ],
                      onPress: () =>
                        document
                          ? run('download', t('diagnostics.report.failDownloadTitle'), () =>
                              openDocument(document.id)
                            )
                          : dialog.alert(
                              t('diagnostics.report.noDownloadTitle'),
                              t('diagnostics.report.noDownloadBody'),
                              'info'
                            ),
                    },
                    {
                      key: 'share',
                      icon: 'share',
                      lines: [
                        busy === 'share'
                          ? t('diagnostics.report.preparing')
                          : t('diagnostics.report.actionShare1'),
                        t('diagnostics.report.actionShare2'),
                      ],
                      onPress: () =>
                        document
                          ? run('share', t('diagnostics.report.failShareTitle'), () =>
                              shareDocumentLink(
                                document.id,
                                document.label ?? t('diagnostics.report.shareName', { name: order.name })
                              )
                            )
                          : dialog.alert(
                              t('diagnostics.report.noShareTitle'),
                              t('diagnostics.report.noShareBody'),
                              'info'
                            ),
                    },
                    {
                      key: 'message',
                      icon: 'chat',
                      lines: [
                        t('diagnostics.report.actionMessage1'),
                        t('diagnostics.report.actionMessage2'),
                      ],
                      onPress: () => navigation.navigate('NewMessage'),
                    },
                    {
                      key: 'print',
                      icon: 'print',
                      lines: [
                        busy === 'print'
                          ? t('diagnostics.report.opening')
                          : t('diagnostics.report.actionPrint1'),
                        t('diagnostics.report.actionPrint2'),
                      ],
                      onPress: () =>
                        document
                          ? run('print', t('diagnostics.report.failOpenTitle'), () =>
                              openDocument(document.id)
                            )
                          : dialog.alert(
                              t('diagnostics.report.noPrintTitle'),
                              t('diagnostics.report.noPrintBody'),
                              'info'
                            ),
                    },
                  ]}
                />
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
      {dialog.element}
    </View>
  );
}

function Field({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.field}>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
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
});
