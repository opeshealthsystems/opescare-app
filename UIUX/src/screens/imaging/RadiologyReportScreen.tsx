/**
 * DIA-011 — Radiology Report.
 *
 * The signed report for a study, from `GET /patient/imaging/{id}`: the report
 * header with its status and number, the patient and referrer, the reporting
 * radiologist and their registration, the full narrative (indication, findings,
 * impression, recommendation), the digital-signature block and the filed PDF.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchImagingStudy, type ImagingStudyDetail } from '../../api';
import { Card, Icon, ScreenHeader, StatusBadge } from '../../components';
import { useUnread } from '../../context/UnreadContext';
import { useTranslation } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import {
  Bullets,
  fmtBytes,
  fmtDate,
  fmtDateTime,
  fmtTime,
  IconFact,
  ModalityChip,
  narrativeLines,
  PersonBlock,
  statusIcon,
  statusLabel,
  statusTone,
  StudyTabStrip,
  StudyThumb,
  TechnicalDetails,
} from './detailShared';
import { AsyncBoundary, DiagButton, titleCase, useAsync } from '../diagnostics/shared';

export function RadiologyReportScreen() {
  const navigation = useNavigation<any>();
  const { notifications } = useUnread();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'RadiologyReport'>>();
  const studyId = params.studyId;
  const state = useAsync<ImagingStudyDetail>(() => fetchImagingStudy(studyId), [studyId]);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('imaging.report.title')}
        align="center"
        actions={[
          { icon: 'bell', badge: notifications, onPress: () => navigation.navigate('Notifications') },
          { icon: 'more-vertical', onPress: () => navigation.navigate('ImagingResults') },
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
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('imaging.report.loading')}
        >
          {(study) => {
            const findings = narrativeLines(study.findings);
            const impression = narrativeLines(study.impression);
            const signedOn = study.reported_at;
            const isFinal = (study.report_status ?? 'final') === 'final';

            return (
              <>
                {/* ── Identity ───────────────────────────────────────── */}
                <View style={styles.identity}>
                  <StudyThumb url={study.thumbnail_url} width={96} height={112} />

                  <View style={styles.identityBody}>
                    <ModalityChip label={study.modality_label} />
                    <Text style={styles.identityTitle}>{study.study_name}</Text>
                    <StatusBadge
                      status={statusLabel(t, study.status)}
                      tone={statusTone(study.status)}
                      icon={statusIcon(study.status)}
                      size="sm"
                      style={styles.selfStart}
                    />
                    <View style={styles.metaRow}>
                      <Icon name="calendar" size={16} color={colors.blue} />
                      <Text style={styles.metaText}>
                        {fmtDate(study.ordered_at)}  •  {fmtTime(study.ordered_at)}
                      </Text>
                    </View>
                    {!!study.location && (
                      <View style={styles.metaRow}>
                        <Icon name="building" size={16} color={colors.blue} />
                        <Text style={styles.metaText} numberOfLines={2}>
                          {study.location}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.panel}>
                    <PanelFact label={t('imaging.common.bodyPart')} value={study.body_part} />
                    <PanelFact
                      label={t('imaging.common.scanType')}
                      value={study.modality_label}
                    />
                  </View>
                </View>

                <TechnicalDetails
                  facts={[
                    { label: t('imaging.tech.studyUid'), value: study.study_uid },
                    { label: t('imaging.tech.accessionNumber'), value: study.accession_number },
                  ]}
                />

                <StudyTabStrip
                  value="report"
                  imageCount={study.image_count}
                  onSelect={(key) => {
                    if (key === 'summary') navigation.navigate('ImagingResultDetail', { studyId: study.id });
                    if (key === 'images') navigation.navigate('ImageThumbnails', { studyId: study.id });
                    if (key === 'details') navigation.navigate('ImagingOrderDetail', { orderId: study.id });
                    if (key === 'activity') navigation.navigate('ImagingHistory');
                  }}
                />

                {!study.has_report ? (
                  <Card>
                    <Text style={styles.overline}>{t('imaging.report.heading')}</Text>
                    <Text style={styles.body}>{t('imaging.report.notFiled')}</Text>
                  </Card>
                ) : (
                  <Card>
                    {/* Report header */}
                    <View style={styles.reportHead}>
                      <Text style={styles.overlineFlush}>{t('imaging.report.heading')}</Text>
                      <View style={styles.reportHeadRight}>
                        <StatusBadge
                          status={titleCase(study.report_status ?? 'final')}
                          tone={isFinal ? 'normal' : 'warning'}
                          icon={isFinal ? 'check-circle' : 'clock'}
                          size="sm"
                        />
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={t('imaging.report.printReport')}
                          onPress={() => navigation.navigate('DownloadShareImaging', { studyId: study.id })}
                        >
                          <Icon name="print" size={20} color={colors.link} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Patient + referrer */}
                    <View style={styles.twoCol}>
                      <View style={styles.col}>
                        <Text style={styles.caption}>{t('imaging.common.patient')}</Text>
                        <PersonBlock
                          compact
                          name={study.patient.name}
                          lines={[
                            [
                              study.patient.medical_id,
                              study.patient.sex ? titleCase(study.patient.sex) : null,
                              study.patient.age != null
                                ? t('imaging.common.years', { count: study.patient.age })
                                : null,
                            ]
                              .filter(Boolean)
                              .join('  •  '),
                            study.patient.phone,
                          ]}
                        />
                      </View>
                      <View style={[styles.col, styles.colEdge]}>
                        <Text style={styles.caption}>{t('imaging.common.referredBy')}</Text>
                        <PersonBlock
                          compact
                          icon="person-search"
                          name={study.ordered_by_name ?? '—'}
                          lines={[study.ordered_by_specialty, study.ordered_by_facility ?? study.facility_name]}
                        />
                      </View>
                    </View>

                    {/* Study stamps */}
                    <View style={styles.stampRow}>
                      <View style={styles.stamp}>
                        <IconFact
                          icon="calendar"
                          label={t('imaging.common.studyDate')}
                          value={fmtDate(study.ordered_at)}
                        />
                      </View>
                      <View style={[styles.stamp, styles.stampEdge]}>
                        <IconFact
                          icon="clock"
                          label={t('imaging.common.studyTime')}
                          value={fmtTime(study.ordered_at)}
                        />
                      </View>
                      <View style={[styles.stamp, styles.stampEdge]}>
                        <IconFact
                          icon="calendar-check"
                          label={t('imaging.common.reportedOn')}
                          value={fmtDateTime(signedOn)}
                        />
                      </View>
                      <View style={[styles.stamp, styles.stampEdge]}>
                        <IconFact
                          icon="check-circle"
                          label={t('imaging.common.reportStatus')}
                          value={titleCase(study.report_status ?? 'final')}
                        />
                      </View>
                    </View>

                    {/* Radiologist */}
                    <View style={styles.twoCol}>
                      <View style={styles.col}>
                        <Text style={styles.caption}>{t('imaging.common.radiologist')}</Text>
                        <PersonBlock
                          compact
                          name={study.radiologist_name ?? '—'}
                          lines={[study.radiologist_title, study.radiologist_registration]}
                        />
                      </View>
                      <View style={[styles.col, styles.colEdge]}>
                        <Text style={styles.caption}>{t('imaging.common.reportNumber')}</Text>
                        <PersonBlock
                          compact
                          icon="clipboard"
                          name={study.report_number ?? '—'}
                          lines={[]}
                        />
                      </View>
                    </View>

                    {/* Narrative */}
                    <Section title={t('imaging.common.clinicalIndication')}>
                      <Text style={styles.body}>
                        {study.clinical_indication ?? t('imaging.common.notRecorded')}
                      </Text>
                    </Section>

                    <Section title={t('imaging.common.findings')}>
                      {findings.length ? (
                        <Bullets lines={findings} />
                      ) : (
                        <Text style={styles.body}>{t('imaging.common.notRecorded')}</Text>
                      )}
                    </Section>

                    <Section title={t('imaging.common.impression')}>
                      {impression.map((line) => (
                        <Text key={line} style={styles.body}>
                          {line}
                        </Text>
                      ))}
                    </Section>

                    {!!study.recommendation && (
                      <Section title={t('imaging.common.recommendation')}>
                        <Text style={styles.body}>{study.recommendation}</Text>
                      </Section>
                    )}

                    <Text style={styles.disclaimer}>{t('imaging.report.disclaimer')}</Text>

                    {/* Signature */}
                    <View style={styles.signatureRow}>
                      <View style={styles.signatureBody}>
                        <Text style={styles.signatureName}>{study.radiologist_name ?? '—'}</Text>
                        {!!study.radiologist_title && (
                          <Text style={styles.signatureLine}>{study.radiologist_title}</Text>
                        )}
                        {!!study.radiologist_registration && (
                          <Text style={styles.signatureLine}>{study.radiologist_registration}</Text>
                        )}
                        <Text style={styles.signatureLine}>
                          {fmtDate(signedOn)}  •  {fmtTime(signedOn)}
                        </Text>
                      </View>

                      <View style={styles.signedPanel}>
                        <Icon name="shield-check" size={22} color={colors.statusNormal} />
                        <View style={styles.signedBody}>
                          <Text style={styles.signedTitle}>
                            {t('imaging.report.digitallySigned')}
                          </Text>
                          <Text style={styles.signedSub}>
                            {t('imaging.report.verifiedSecure')}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </Card>
                )}

                {/* ── Attached documents ─────────────────────────────── */}
                {study.documents.length > 0 && (
                  <Card>
                    <Text style={styles.overline}>{t('imaging.report.attachedDocuments')}</Text>
                    {study.documents.map((doc, i) => (
                      <TouchableOpacity
                        key={doc.id}
                        activeOpacity={0.75}
                        onPress={() => navigation.navigate('DocumentPreview', { documentId: doc.id })}
                        style={[styles.docRow, i < study.documents.length - 1 && styles.docRowDivider]}
                        accessibilityRole="button"
                        accessibilityLabel={doc.label ?? t('imaging.common.documentFallback')}
                      >
                        <Icon name="document-text" size={20} color={colors.statusCritical} />
                        <View style={styles.docBody}>
                          <Text style={styles.docLabel} numberOfLines={1}>
                            {doc.label ?? t('imaging.common.documentFallback')}
                          </Text>
                          <Text style={styles.docMeta}>
                            {fmtBytes(doc.file_size)}  •  {fmtDate(doc.created_at)}
                          </Text>
                        </View>
                        <Icon name="download" size={18} color={colors.link} />
                      </TouchableOpacity>
                    ))}
                  </Card>
                )}

                {/* ── Actions ────────────────────────────────────────── */}
                <View style={styles.actionRow}>
                  {(
                    [
                      ['imaging.common.download', 'download'],
                      ['imaging.common.shareReport', 'share'],
                      ['imaging.common.sendToDoctor', 'send'],
                      ['imaging.common.print', 'print'],
                    ] as const
                  ).map(([key, icon]) => (
                    <DiagButton
                      key={key}
                      label={t(key)}
                      icon={icon}
                      size="sm"
                      variant="secondary"
                      style={styles.actionButton}
                      onPress={() => navigation.navigate('DownloadShareImaging', { studyId: study.id })}
                    />
                  ))}
                </View>
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.overlineFlush}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function PanelFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.panelFact}>
      <Text style={styles.panelLabel}>{label}</Text>
      <Text style={styles.panelValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },

  identity: { flexDirection: 'row', gap: spacing.sm + 4, alignItems: 'flex-start' },
  identityBody: { flex: 1.1, minWidth: 0, gap: 6 },
  identityTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    lineHeight: typography.lineHeight.lg,
    color: colors.textPrimary,
  },
  selfStart: { alignSelf: 'flex-start' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: {
    flexShrink: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  panel: {
    flex: 0.95,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: spacing.sm + 4,
    gap: 10,
  },
  panelFact: { gap: 1 },
  panelLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  panelValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },

  reportHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  reportHeadRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },

  overline: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.link,
    marginBottom: 8,
  },
  overlineFlush: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.link,
  },
  caption: {
    marginBottom: 4,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },

  twoCol: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  col: { flex: 1, minWidth: 0 },
  colEdge: { borderLeftWidth: 1, borderLeftColor: colors.divider, paddingLeft: spacing.sm + 4 },

  stampRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.divider,
    marginBottom: spacing.md,
  },

  stamp: { flex: 1, minWidth: 0 },
  stampEdge: { borderLeftWidth: 1, borderLeftColor: colors.divider, paddingLeft: spacing.sm },

  section: {
    marginBottom: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  sectionBody: { marginTop: 6, gap: 4 },
  body: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },

  disclaimer: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },

  signatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  signatureBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
    borderLeftWidth: 1,
    borderLeftColor: colors.divider,
    paddingLeft: spacing.sm + 4,
  },
  signatureName: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  signatureLine: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  signedPanel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.statusNormalBg,
    borderRadius: radii.md,
    padding: spacing.sm + 4,
  },
  signedBody: { flex: 1, minWidth: 0 },
  signedTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.statusNormal,
  },
  signedSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.statusNormal,
  },

  docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10 },
  docRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  docBody: { flex: 1, minWidth: 0 },
  docLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  docMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textMuted,
  },

  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionButton: { flexGrow: 1, flexBasis: '45%' },
});
