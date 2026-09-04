/**
 * DIA-008 — Imaging Result Detail.
 *
 * One study from `GET /patient/imaging/{id}`: the identity header with its
 * study/accession identifiers, the patient and ordering-provider blocks, the
 * clinical indication, the radiologist's findings and impression, the key
 * acquisition details, the stored image strip and the referenced documents.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchImagingStudy, type ImagingStudyDetail } from '../../api';
import { Card, Icon, ScreenHeader, SectionHeader, StatusBadge } from '../../components';
import { useUnread } from '../../context/UnreadContext';
import { useTranslation } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, statusMap, typography } from '../../theme/theme';
import {
  Bullets,
  flagLabel,
  flagTone,
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

export function ImagingResultDetailScreen() {
  const navigation = useNavigation<any>();
  const { notifications } = useUnread();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'ImagingResultDetail'>>();
  const studyId = params.studyId;
  const state = useAsync<ImagingStudyDetail>(() => fetchImagingStudy(studyId), [studyId]);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('imaging.resultDetail.title')}
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
          loadingLabel={t('imaging.resultDetail.loading')}
        >
          {(study) => {
            const flag = flagLabel(t, study);
            const findings = narrativeLines(study.findings);

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
                  value="summary"
                  imageCount={study.image_count}
                  onSelect={(key) => {
                    if (key === 'images') navigation.navigate('ImageThumbnails', { studyId: study.id });
                    if (key === 'report') navigation.navigate('RadiologyReport', { studyId: study.id });
                    if (key === 'details') navigation.navigate('ImagingOrderDetail', { orderId: study.id });
                    if (key === 'activity') navigation.navigate('ImagingHistory');
                  }}
                />

                {/* ── Patient + order ────────────────────────────────── */}
                <Card>
                  <View style={styles.twoCol}>
                    <View style={styles.col}>
                      <Text style={styles.overline}>
                        {t('imaging.resultDetail.patientInformation')}
                      </Text>
                      <PersonBlock
                        name={study.patient.name}
                        lines={[
                          [study.patient.medical_id, study.patient.sex ? titleCase(study.patient.sex) : null,
                            study.patient.age != null
                              ? t('imaging.common.years', { count: study.patient.age })
                              : null]
                            .filter(Boolean)
                            .join('  •  '),
                          study.patient.phone,
                        ]}
                      />
                    </View>

                    <View style={styles.col}>
                      <Text style={styles.overline}>
                        {t('imaging.resultDetail.orderInformation')}
                      </Text>
                      <Text style={styles.label}>{t('imaging.common.orderedBy')}</Text>
                      <Text style={styles.value}>{study.ordered_by_name ?? '—'}</Text>
                      {!!study.ordered_by_specialty && (
                        <Text style={styles.subValue}>{study.ordered_by_specialty}</Text>
                      )}
                      {!!(study.ordered_by_facility ?? study.facility_name) && (
                        <View style={styles.metaRow}>
                          <Icon name="building" size={16} color={colors.blue} />
                          <Text style={styles.metaText} numberOfLines={2}>
                            {study.ordered_by_facility ?? study.facility_name}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </Card>

                {/* ── Clinical indication ────────────────────────────── */}
                <Card>
                  <Text style={styles.overline}>{t('imaging.common.clinicalIndication')}</Text>
                  <Text style={styles.body}>
                    {study.clinical_indication ?? t('imaging.common.notRecorded')}
                  </Text>
                </Card>

                {/* ── Findings + impression ──────────────────────────── */}
                <View style={styles.sideBySide}>
                  <Card style={styles.halfCard}>
                    <Text style={styles.overline}>{t('imaging.common.findings')}</Text>
                    {findings.length ? (
                      <Bullets lines={findings} />
                    ) : (
                      <Text style={styles.body}>{t('imaging.resultDetail.reportNotFiled')}</Text>
                    )}
                  </Card>

                  <Card style={styles.halfCard}>
                    <Text style={styles.overline}>{t('imaging.common.impression')}</Text>
                    {!!flag && (
                      <StatusBadge
                        status={flag}
                        tone={flagTone(study.result_flag)}
                        size="sm"
                        style={styles.selfStart}
                      />
                    )}
                    <Text style={styles.body}>
                      {study.impression ?? t('imaging.resultDetail.impressionPending')}
                    </Text>
                  </Card>
                </View>

                {/* ── Key details ────────────────────────────────────── */}
                <Card>
                  <Text style={styles.overline}>{t('imaging.resultDetail.keyDetails')}</Text>
                  <View style={styles.factGrid}>
                    <View style={styles.factCol}>
                      <IconFact
                        icon="calendar"
                        label={t('imaging.common.studyDate')}
                        value={fmtDate(study.ordered_at)}
                      />
                      <IconFact
                        icon="clock"
                        label={t('imaging.common.studyTime')}
                        value={fmtTime(study.ordered_at)}
                      />
                      <IconFact
                        icon="activity"
                        label={t('imaging.common.view')}
                        value={study.view_label ?? '—'}
                      />
                    </View>
                    <View style={[styles.factCol, styles.factColEdge]}>
                      <IconFact
                        icon="stethoscope"
                        label={t('imaging.common.bodyPart')}
                        value={study.body_part}
                      />
                      <IconFact
                        icon="contrast"
                        label={t('imaging.resultDetail.exposure')}
                        value={study.exposure ?? '—'}
                      />
                      <IconFact
                        icon="calendar-check"
                        label={t('imaging.orderDetail.statusLabel')}
                        value={statusLabel(t, study.status)}
                        valueColor={statusMap[statusTone(study.status)].fg}
                        dot={statusMap[statusTone(study.status)].fg}
                      />
                    </View>
                    <View style={[styles.factCol, styles.factColEdge]}>
                      <IconFact
                        icon="person"
                        label={t('imaging.common.radiologist')}
                        value={study.radiologist_name ?? '—'}
                      />
                      <IconFact
                        icon="calendar"
                        label={t('imaging.common.reportedOn')}
                        value={fmtDateTime(study.reported_at)}
                      />
                      <IconFact
                        icon="shield-check"
                        label={t('imaging.common.reportStatus')}
                        value={study.report_status ? titleCase(study.report_status) : '—'}
                        valueColor={colors.statusNormal}
                        dot={colors.statusNormal}
                      />
                    </View>
                  </View>
                </Card>

                {/* ── Images ─────────────────────────────────────────── */}
                <Card>
                  <SectionHeader
                    title={t('imaging.resultDetail.imagesHeading', { count: study.image_count })}
                    variant="overline"
                    actionLabel={t('imaging.resultDetail.viewAll')}
                    onAction={() => navigation.navigate('ImageThumbnails', { studyId: study.id })}
                  />
                  {study.images.length ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageStrip}>
                      {study.images.map((img, i) => (
                        <TouchableOpacity
                          key={img.id}
                          activeOpacity={0.85}
                          onPress={() =>
                            navigation.navigate('MedicalImageViewer', { studyId: study.id, imageIndex: i })
                          }
                          style={[styles.imageTile, img.is_primary && styles.imageTileOn]}
                          accessibilityRole="button"
                          accessibilityLabel={t('imaging.images.openImage', { label: img.view_label })}
                        >
                          <StudyThumb
                            url={img.thumbnail_url}
                            width={132}
                            height={112}
                           
                            selected={img.is_primary}
                          />
                          <Text style={styles.imageLabel} numberOfLines={1}>
                            {i + 1}. {img.view_label}
                          </Text>
                          <Text style={styles.imageMeta} numberOfLines={1}>
                            {fmtDate(img.captured_at)}  {fmtTime(img.captured_at)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ) : (
                    <Text style={styles.body}>{t('imaging.resultDetail.noImages')}</Text>
                  )}
                </Card>

                {/* ── Referenced documents ───────────────────────────── */}
                {study.documents.length > 0 && (
                  <Card>
                    <Text style={styles.overline}>
                      {t('imaging.resultDetail.referencedDocuments')}
                    </Text>
                    <View style={styles.docList}>
                      {study.documents.map((doc) => (
                        <TouchableOpacity
                          key={doc.id}
                          activeOpacity={0.75}
                          onPress={() => navigation.navigate('DocumentPreview', { documentId: doc.id })}
                          style={styles.docRow}
                          accessibilityRole="button"
                          accessibilityLabel={doc.label ?? t('imaging.common.documentFallback')}
                        >
                          <Icon name="document-text" size={20} color={colors.blue} />
                          <Text style={styles.docLabel} numberOfLines={1}>
                            {doc.label ?? t('imaging.common.documentFallback')}
                          </Text>
                          <View style={styles.docChip}>
                            <Text style={styles.docChipText}>
                              {(doc.file_type ?? 'pdf').toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.docDate}>{fmtDate(doc.created_at)}</Text>
                          <Icon name="download" size={18} color={colors.link} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </Card>
                )}

                {/* ── Actions ────────────────────────────────────────── */}
                <View style={styles.actionRow}>
                  <DiagButton
                    label={t('imaging.common.viewReport')}
                    icon="document-text"
                    size="sm"
                    variant="secondary"
                    style={styles.actionButton}
                    onPress={() => navigation.navigate('RadiologyReport', { studyId: study.id })}
                  />
                  <DiagButton
                    label={t('imaging.common.download')}
                    icon="download"
                    size="sm"
                    variant="secondary"
                    style={styles.actionButton}
                    onPress={() => navigation.navigate('DownloadShareImaging', { studyId: study.id })}
                  />
                  <DiagButton
                    label={t('imaging.common.share')}
                    icon="share"
                    size="sm"
                    variant="secondary"
                    style={styles.actionButton}
                    onPress={() => navigation.navigate('DownloadShareImaging', { studyId: study.id })}
                  />
                  <DiagButton
                    label={t('imaging.common.sendToDoctor')}
                    icon="send"
                    size="sm"
                    variant="secondary"
                    style={styles.actionButton}
                    onPress={() => navigation.navigate('DownloadShareImaging', { studyId: study.id })}
                  />
                  {/*
                    DIA-013 was fully built and unreachable — nothing in the app
                    navigated to it. This is where it belongs: the study detail
                    is the only screen that knows which study the patient is
                    looking at, and "save this to my record" is a decision made
                    while looking at it. The screen it opens is idempotent and
                    shows its own saved state, so tapping this on a study that
                    is already filed reads back rather than filing it twice.
                  */}
                  <DiagButton
                    label={t('imaging.addToRecord.title')}
                    icon="folder-plus"
                    size="sm"
                    variant="secondary"
                    style={styles.actionButton}
                    onPress={() =>
                      navigation.navigate('AddImagingToHealthRecord', { studyId: study.id })
                    }
                  />
                </View>
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
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
  panelValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  panelValue: {
    flexShrink: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },

  twoCol: { flexDirection: 'row', gap: spacing.md },
  col: { flex: 1, minWidth: 0, gap: 6 },
  sideBySide: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' },
  halfCard: { flex: 1, gap: 8 },

  overline: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.link,
    marginBottom: 8,
  },
  label: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  value: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  subValue: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  body: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },

  factGrid: { flexDirection: 'row', gap: spacing.sm },
  factCol: { flex: 1, gap: 12, paddingLeft: 0 },
  factColEdge: { borderLeftWidth: 1, borderLeftColor: colors.divider, paddingLeft: spacing.sm },

  imageStrip: { gap: spacing.sm, paddingRight: spacing.md },
  imageTile: { width: 132, gap: 3 },
  imageTileOn: {},
  imageLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textPrimary,
  },
  imageMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textMuted,
  },

  docList: { gap: 4 },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  docLabel: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  docChip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm - 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  docChipText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 10,
    color: colors.link,
  },
  docDate: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textMuted,
  },

  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionButton: { flexGrow: 1, flexBasis: '45%' },
});
