/**
 * DIA-018 — Imaging Comparison (this study vs an earlier one).
 *
 * `GET /patient/imaging/{id}` returns the study plus `prior_studies`: up to
 * five other studies of the same scan type on the same record. This screen
 * puts one of them beside the study the patient came from, so "has anything
 * changed since last time?" is answerable without opening two screens.
 *
 * Two honesty rules shape the copy here:
 *
 *  - The server's `prior_studies` is "same scan type, other studies", ordered
 *    newest first — it is *not* filtered to studies before this one. So this
 *    screen compares dates itself and says "earlier" or "later" from the real
 *    timestamps, and never calls a later study a prior one.
 *  - The reference render offers Overlay and Difference compare modes. Nothing
 *    on the server produces a registered or subtracted image, so they are not
 *    drawn here rather than faked.
 *
 * No interpretation is offered: the screen lays the two studies side by side
 * and repeats each radiologist's own impression, nothing more.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchImagingStudy, type ImagingStudyDetail, type PortalImagingStudy } from '../../api';
import { Card, Icon, ScreenHeader, StatusBadge } from '../../components';
import { useUnread } from '../../context/UnreadContext';
import { useTranslation, type TFunction } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import {
  DetailLine,
  flagLabel,
  flagTone,
  fmtDate,
  fmtTime,
  ModalityChip,
  statusIcon,
  statusLabel,
  statusTone,
  StudyThumb,
  TechnicalDetails,
} from './detailShared';
import { StoredImage } from './viewerShared';
import {
  AsyncBoundary,
  DiagButton,
  HeroBand,
  InfoStrip,
  LoadingBlock,
  Overline,
  useAsync,
} from '../diagnostics/shared';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days between two timestamps, or null when either date is missing. */
function daysBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  if (Number.isNaN(t1) || Number.isNaN(t2)) return null;
  return Math.round(Math.abs(t1 - t2) / MS_PER_DAY);
}

/**
 * "12 days earlier" / "3 days later" / "The same day" — from real dates only,
 * and « 12 jours plus tôt » / « 3 jours plus tard » / « Le même jour » in
 * French. The word "prior" (and its French « précédent ») is deliberately
 * absent in both languages: the server's `prior_studies` is not filtered to
 * studies before this one, so the compared study may well be the later of the
 * two and calling it a prior would be a lie.
 */
function intervalPhrase(t: TFunction, current?: string | null, other?: string | null): string {
  const days = daysBetween(current, other);
  if (days === null) return t('imaging.compare.intervalUnknown');
  if (days === 0) return t('imaging.compare.intervalSameDay');
  const t1 = new Date(current as string).getTime();
  const t2 = new Date(other as string).getTime();
  return t2 < t1
    ? t('imaging.compare.intervalEarlier', { count: days })
    : t('imaging.compare.intervalLater', { count: days });
}

export function CompareStudiesScreen() {
  const navigation = useNavigation<any>();
  const { notifications } = useUnread();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'ImagingComparison'>>();
  const studyId = params.studyId;

  const current = useAsync<ImagingStudyDetail>(() => fetchImagingStudy(studyId), [studyId]);

  // The patient's explicit pick wins; otherwise the most recent other study of
  // the same scan type, which is what the server puts first.
  const [picked, setPicked] = useState<string | null>(params.priorStudyId ?? null);
  const otherId = picked ?? current.data?.prior_studies[0]?.id ?? null;

  const other = useAsync<ImagingStudyDetail | null>(
    () => (otherId ? fetchImagingStudy(otherId) : Promise.resolve(null)),
    [otherId]
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('imaging.compare.title')}
        align="center"
        actions={[
          { icon: 'bell', badge: notifications, onPress: () => navigation.navigate('Notifications') },
          { icon: 'more-vertical', onPress: () => navigation.navigate('ImagingHistory') },
        ]}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={current.loading && current.data !== null}
            onRefresh={() => {
              current.reload();
              other.reload();
            }}
            tintColor={colors.blue}
          />
        }
      >
        <AsyncBoundary
          state={current}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('imaging.compare.loading')}
        >
          {(study) => (
            <>
              <HeroBand
                title={t('imaging.compare.title')}
                subtitle={t('imaging.compare.subtitle', { scanType: study.modality_label })}
                icon="columns"
              />

              {study.prior_studies.length === 0 ? (
                <Card>
                  <View style={styles.emptyCard}>
                    <Icon name="columns" size={28} color={colors.blue} />
                    <Text style={styles.emptyTitle}>{t('imaging.compare.nothingTitle')}</Text>
                    <Text style={styles.emptyBody}>
                      {t('imaging.compare.nothingBody', {
                        scanType: study.modality_label,
                        bodyPart: study.body_part.toLowerCase(),
                      })}
                    </Text>
                    <DiagButton
                      label={t('imaging.compare.openThisStudy')}
                      icon="image"
                      onPress={() => navigation.navigate('ImagingResultDetail', { studyId: study.id })}
                    />
                  </View>
                </Card>
              ) : (
                <>
                  {/* ── Which study to compare with ─────────────────── */}
                  <Card>
                    <Overline label={t('imaging.compare.compareWith')} />
                    <Text style={styles.pickerCaption}>
                      {t('imaging.compare.pickerCaption', { scanType: study.modality_label })}
                    </Text>
                    <View style={styles.pickerList}>
                      {study.prior_studies.map((p) => (
                        <StudyOption
                          key={p.id}
                          study={p}
                          selected={p.id === otherId}
                          relation={intervalPhrase(t, study.ordered_at, p.ordered_at)}
                          onPress={() => setPicked(p.id)}
                        />
                      ))}
                    </View>
                  </Card>

                  {/* ── The two panels ──────────────────────────────── */}
                  <View style={styles.panels}>
                    <StudyPanel caption={t('imaging.compare.thisStudy')} study={study} t={t} />
                    {other.loading && other.data === null ? (
                      <View style={styles.panelCol}>
                        <LoadingBlock label={t('imaging.compare.loadingOther')} />
                      </View>
                    ) : other.data ? (
                      <StudyPanel
                        caption={t('imaging.compare.comparedWith')}
                        study={other.data}
                        t={t}
                      />
                    ) : (
                      <View style={styles.panelCol}>
                        <Card>
                          <Text style={styles.emptyBody}>
                            {other.error ?? t('imaging.compare.otherFailed')}
                          </Text>
                        </Card>
                      </View>
                    )}
                  </View>

                  {/* ── Summary of the two, from stored facts only ──── */}
                  {other.data && (
                    <Card>
                      <Overline
                        label={t('imaging.compare.summaryHead')}
                        style={styles.summaryHead}
                      />
                      <DetailLine
                        label={t('imaging.compare.theComparedStudyWas')}
                        value={intervalPhrase(t, study.ordered_at, other.data.ordered_at)}
                      />
                      <DetailLine
                        label={t('imaging.compare.sameScanType')}
                        value={
                          study.modality === other.data.modality
                            ? t('imaging.compare.yesValue', { value: study.modality_label })
                            : t('imaging.compare.noValue', {
                                a: study.modality_label,
                                b: other.data.modality_label,
                              })
                        }
                      />
                      <DetailLine
                        label={t('imaging.compare.sameBodyArea')}
                        value={
                          study.body_part === other.data.body_part
                            ? t('imaging.compare.yesValue', { value: study.body_part })
                            : t('imaging.compare.noValue', {
                                a: study.body_part,
                                b: other.data.body_part,
                              })
                        }
                      />
                      <DetailLine
                        label={t('imaging.compare.reportOnCompared')}
                        value={
                          other.data.has_report
                            ? t('imaging.compare.reportAvailable')
                            : t('imaging.compare.reportNotAvailable')
                        }
                        last
                      />
                    </Card>
                  )}

                  <InfoStrip icon="info" tone="pending">
                    <Text style={styles.noteTitle}>{t('imaging.compare.noteTitle')}</Text>
                    <Text style={styles.noteBody}>{t('imaging.compare.noteBody')}</Text>
                  </InfoStrip>

                  <View style={styles.actionRow}>
                    <DiagButton
                      label={t('imaging.compare.openThisStudy')}
                      icon="image"
                      variant="secondary"
                      style={styles.actionButton}
                      onPress={() => navigation.navigate('ImagingResultDetail', { studyId: study.id })}
                    />
                    <DiagButton
                      label={t('imaging.compare.openComparedStudy')}
                      icon="image"
                      variant="secondary"
                      disabled={!other.data}
                      style={styles.actionButton}
                      onPress={() =>
                        other.data &&
                        (other.data.has_report
                          ? navigation.navigate('ImagingResultDetail', { studyId: other.data.id })
                          : navigation.navigate('ImagingOrderDetail', { orderId: other.data.id }))
                      }
                    />
                    <DiagButton
                      label={t('imaging.common.readReport')}
                      icon="document-text"
                      variant="secondary"
                      disabled={!study.has_report}
                      style={styles.actionButton}
                      onPress={() => navigation.navigate('RadiologyReport', { studyId: study.id })}
                    />
                    <DiagButton
                      label={t('imaging.compare.imagingHistory')}
                      icon="history"
                      variant="secondary"
                      style={styles.actionButton}
                      onPress={() => navigation.navigate('ImagingHistory')}
                    />
                  </View>
                </>
              )}
            </>
          )}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

/** One selectable row in the "compare with" list. */
function StudyOption({
  study,
  selected,
  relation,
  onPress,
}: {
  study: PortalImagingStudy;
  selected: boolean;
  relation: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.option, selected && styles.optionOn]}
    >
      <StudyThumb url={study.thumbnail_url} width={44} height={50} selected={selected} />
      <View style={styles.optionBody}>
        <Text style={styles.optionTitle} numberOfLines={1}>
          {study.study_name}
        </Text>
        <Text style={styles.optionDate}>{fmtDate(study.ordered_at)}</Text>
        <Text style={styles.optionRelation}>{relation}</Text>
      </View>
      {selected && <Icon name="check-circle" size={18} color={colors.blue} />}
    </TouchableOpacity>
  );
}

/** One side of the comparison. */
function StudyPanel({
  caption,
  study,
  t,
}: {
  caption: string;
  study: ImagingStudyDetail;
  t: TFunction;
}) {
  const primary = study.images.find((i) => i.is_primary) ?? study.images[0];
  const flag = flagLabel(t, study);

  return (
    <View style={styles.panelCol}>
      <Card>
        <Overline label={caption} />
        <ModalityChip label={study.modality_label} />
        <Text style={styles.panelTitle} numberOfLines={2}>
          {study.study_name}
        </Text>
        <Text style={styles.panelDate}>
          {fmtDate(study.ordered_at)}  •  {fmtTime(study.ordered_at)}
        </Text>
        <Text style={styles.panelPlace} numberOfLines={2}>
          {study.location ?? study.facility_name ?? t('imaging.common.facilityFallback')}
        </Text>

        <View style={styles.imageBox}>
          {primary ? (
            <StoredImage uri={primary.image_url} style={styles.image} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Icon name="image" size={26} color={colors.textMuted} />
              <Text style={styles.imagePlaceholderText}>
                {t('imaging.compare.noImageStored')}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.badgeRow}>
          <StatusBadge
            status={statusLabel(t, study.status)}
            tone={statusTone(study.status)}
            icon={statusIcon(study.status)}
            size="sm"
          />
          {!!flag && <StatusBadge status={flag} tone={flagTone(study.result_flag)} size="sm" />}
        </View>

        <Text style={styles.panelLabel}>{t('imaging.compare.radiologistImpression')}</Text>
        <Text style={styles.panelBody}>
          {study.impression ?? t('imaging.compare.noImpression')}
        </Text>

        <TechnicalDetails
          facts={[
            { label: t('imaging.tech.scanType'), value: study.modality_label },
            { label: t('imaging.tech.view'), value: study.view_label },
            { label: t('imaging.tech.accessionNumber'), value: study.accession_number },
            { label: t('imaging.tech.studyUid'), value: study.study_uid },
          ]}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },

  emptyCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  emptyTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  emptyBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  pickerCaption: {
    marginTop: spacing.xs,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  pickerList: { marginTop: spacing.sm, gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  optionOn: { borderColor: colors.blue, backgroundColor: colors.primarySoft },
  optionBody: { flex: 1, minWidth: 0, gap: 1 },
  optionTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  optionDate: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.link,
  },
  optionRelation: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },

  panels: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  panelCol: { flex: 1, minWidth: 0 },
  panelTitle: {
    marginTop: spacing.xs,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },
  panelDate: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.link,
  },
  panelPlace: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },

  imageBox: { marginTop: spacing.sm },
  image: { height: 150, borderRadius: radii.sm },
  imagePlaceholder: {
    height: 150,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  imagePlaceholderText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textMuted,
  },

  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },

  panelLabel: {
    marginTop: spacing.sm,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  panelBody: {
    marginTop: 2,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },

  summaryHead: { marginBottom: spacing.sm },

  noteTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  noteBody: {
    marginTop: 2,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionButton: { flexGrow: 1, flexBasis: '45%' },
});
