/**
 * DIA-009 — Image Thumbnails.
 *
 * Every stored image instance for one radiology study, from
 * `/patient/imaging/{study}/images`. The bytes are real files on the server's
 * disk, served through short-lived signed URLs, so each tile renders an actual
 * radiograph rather than a placeholder rectangle.
 *
 * Grid and list are the two layouts the reference offers; the study identity
 * header, the tab strip and the four foot actions are shared with the rest of
 * the imaging slice.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchStudyImages, type StudyImage, type StudyImageSet } from '../../api/imaging';
import { Card, EmptyState, Icon, ScreenHeader, StatusBadge } from '../../components';
import { useUnread } from '../../context/UnreadContext';
import { useTranslation, type TFunction } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { TechnicalDetails } from './detailShared';
import {
  AsyncBoundary,
  FactPanel,
  fmtDate,
  fmtTime,
  InfoStrip,
  modalityLabel,
  StoredImage,
  studyStatusIcon,
  studyStatusLabel,
  studyStatusTone,
  StudyTabs,
  useAsync,
} from './viewerShared';

type Layout = 'grid' | 'list';

export function ImageThumbnailsScreen() {
  const navigation = useNavigation<any>();
  const { notifications } = useUnread();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'ImageThumbnails'>>();
  const studyId = params.studyId;

  const state = useAsync<StudyImageSet>(() => fetchStudyImages(studyId), [studyId]);
  const [layout, setLayout] = useState<Layout>('grid');
  const [selected, setSelected] = useState(0);

  const openViewer = (index: number) =>
    navigation.navigate('MedicalImageViewer', { studyId, imageIndex: index });

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('imaging.images.title')}
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
          loadingLabel={t('imaging.images.loading')}
          isEmpty={(d) => d.images.length === 0}
          empty={
            /**
             * `GET /patient/imaging-reports/{report}` (PatientImagingController::
             * report) resolves either the study id or the report id, but 404s
             * when the study has no radiology result. Only offer the report
             * when the server says one exists — `has_report` on the same
             * payload — rather than routing the patient into a dead end.
             */
            <EmptyState
              icon="image"
              tint="blue"
              title={t('imaging.images.emptyTitle')}
              message={t('imaging.images.emptyBody')}
              actionLabel={
                state.data?.study.has_report ? t('imaging.images.emptyCta') : undefined
              }
              onAction={
                state.data?.study.has_report
                  ? () => navigation.navigate('ViewFullReport', { reportId: studyId })
                  : undefined
              }
            />
          }
        >
          {(set) => {
            const study = set.study;
            const active = set.images[Math.min(selected, set.images.length - 1)];

            return (
              <>
                {/* ── Study identity ─────────────────────────────────── */}
                <View style={styles.identity}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => openViewer(0)}
                    accessibilityRole="button"
                    accessibilityLabel={t('imaging.images.openPrimary')}
                  >
                    <StoredImage uri={set.images[0].thumbnail_url} style={styles.identityThumb} resizeMode="cover" />
                  </TouchableOpacity>

                  <View style={styles.identityBody}>
                    <View style={styles.modalityChip}>
                      <Text style={styles.modalityChipText}>
                        {modalityLabel(t, study.modality).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.identityTitle}>{study.study_name}</Text>
                    <View style={styles.identityBadge}>
                      <StatusBadge
                        status={study.status}
                        label={studyStatusLabel(t, study.status)}
                        tone={studyStatusTone(study.status)}
                        icon={studyStatusIcon(study.status)}
                      />
                    </View>
                    <View style={styles.metaRow}>
                      <Icon name="calendar" size={16} color={colors.blue} />
                      <Text style={styles.metaText}>
                        {fmtDate(study.studied_at)} • {fmtTime(study.studied_at)}
                      </Text>
                    </View>
                    <View style={styles.metaRow}>
                      <Icon name="building" size={16} color={colors.blue} />
                      <Text style={styles.metaText} numberOfLines={2}>
                        {study.facility_name
                          ? `${study.facility_name} – ${study.department}`
                          : study.department}
                      </Text>
                    </View>
                  </View>
                </View>

                <FactPanel
                  facts={[
                    { label: t('imaging.common.scanType'), value: modalityLabel(t, study.modality) },
                    { label: t('imaging.common.bodyPart'), value: study.body_part },
                  ]}
                />

                <TechnicalDetails
                  facts={[
                    { label: t('imaging.tech.studyUid'), value: study.study_uid },
                    { label: t('imaging.tech.orderNumber'), value: study.order_number },
                    { label: t('imaging.tech.accessionNumber'), value: study.accession_number },
                  ]}
                />

                {/* ── Study tabs ─────────────────────────────────────── */}
                <StudyTabs
                  value="images"
                  tabs={[
                    {
                      key: 'summary',
                      label: t('imaging.tabs.summary'),
                      onPress: () => navigation.navigate('ImagingResultDetail', { studyId }),
                    },
                    { key: 'images', label: t('imaging.tabs.images', { count: set.count }) },
                    {
                      key: 'report',
                      label: t('imaging.tabs.report'),
                      onPress: () => navigation.navigate('RadiologyReport', { studyId }),
                    },
                    {
                      key: 'details',
                      label: t('imaging.tabs.details'),
                      onPress: () => navigation.navigate('ImagingOrderDetail', { orderId: studyId }),
                    },
                    {
                      key: 'activity',
                      label: t('imaging.tabs.activity'),
                      onPress: () => navigation.navigate('ImagingResultDetail', { studyId }),
                    },
                  ]}
                />

                {/* ── Layout switch ──────────────────────────────────── */}
                <View style={styles.layoutRow}>
                  <View style={styles.layoutBody}>
                    <Text style={styles.sectionTitle}>{t('imaging.images.sectionTitle')}</Text>
                    <Text style={styles.sectionSubtitle}>
                      {t('imaging.images.countInStudy', { count: set.count })}
                    </Text>
                  </View>
                  <View style={styles.layoutToggle}>
                    <LayoutButton
                      icon="grid"
                      label={t('imaging.images.layoutGrid')}
                      on={layout === 'grid'}
                      onPress={() => setLayout('grid')}
                    />
                    <LayoutButton
                      icon="list"
                      label={t('imaging.images.layoutList')}
                      on={layout === 'list'}
                      onPress={() => setLayout('list')}
                    />
                  </View>
                </View>

                {/* ── Thumbnails ─────────────────────────────────────── */}
                {layout === 'grid' ? (
                  <View style={styles.grid}>
                    {set.images.map((image, i) => (
                      <GridTile
                        key={image.id}
                        image={image}
                        index={i}
                        modality={study.modality}
                        t={t}
                        selected={i === selected}
                        onSelect={() => setSelected(i)}
                        onOpen={() => openViewer(i)}
                      />
                    ))}
                  </View>
                ) : (
                  <Card variant="flush">
                    {set.images.map((image, i) => (
                      <ListTile
                        key={image.id}
                        image={image}
                        index={i}
                        modality={study.modality}
                        t={t}
                        selected={i === selected}
                        divider={i < set.images.length - 1}
                        onSelect={() => setSelected(i)}
                        onOpen={() => openViewer(i)}
                      />
                    ))}
                  </Card>
                )}

                <InfoStrip icon="info" tone="pending">
                  <Text style={styles.infoTitle}>{t('imaging.images.infoTitle')}</Text>
                  <Text style={styles.infoBody}>{t('imaging.images.infoBody')}</Text>
                </InfoStrip>

                {/* ── Foot actions ───────────────────────────────────── */}
                <View style={styles.actions}>
                  <FootAction
                    icon="eye"
                    label={t('imaging.images.viewFullScreen')}
                    onPress={() => openViewer(selected)}
                  />
                  <FootAction
                    icon="download"
                    label={t('imaging.images.downloadAll')}
                    onPress={() => navigation.navigate('DownloadShareImaging', { studyId })}
                  />
                  <FootAction
                    icon="share"
                    label={t('imaging.images.shareStudy')}
                    onPress={() => navigation.navigate('DownloadShareImaging', { studyId })}
                  />
                  <FootAction
                    icon="columns"
                    label={t('imaging.images.addToCompare')}
                    onPress={() => navigation.navigate('ImagingComparison', { studyId })}
                  />
                </View>

                <Text style={styles.footNote}>
                  {t('imaging.images.footNote', {
                    instance: active.instance_number,
                    total: set.count,
                    label: active.view_label,
                  })}
                </Text>
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

function LayoutButton({
  icon,
  label,
  on,
  onPress,
}: {
  icon: 'grid' | 'list';
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  const fg = on ? colors.blue : colors.textMuted;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.layoutButton, on && styles.layoutButtonOn]}
    >
      <Icon name={icon} size={18} color={fg} />
      <Text style={[styles.layoutButtonText, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Caption({
  image,
  index,
  modality,
  t,
  onMore,
}: {
  image: StudyImage;
  index: number;
  modality: string;
  t: TFunction;
  onMore: () => void;
}) {
  return (
    <View style={styles.caption}>
      <View style={styles.captionHead}>
        <Text style={styles.captionTitle} numberOfLines={1}>
          {index + 1}. {image.view_label}
        </Text>
        <TouchableOpacity
          onPress={onMore}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('imaging.images.openImage', { label: image.view_label })}
        >
          <Icon name="more-vertical" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      <Text style={styles.captionMeta}>
        {fmtDate(image.captured_at)}  {fmtTime(image.captured_at)}
      </Text>
      <View style={styles.captionChips}>
        <View style={styles.tagChip}>
          <Text style={styles.tagChipText}>{modalityLabel(t, modality).toUpperCase()}</Text>
        </View>
        {image.is_primary && (
          <View style={[styles.tagChip, styles.tagChipPrimary]}>
            <Text style={[styles.tagChipText, styles.tagChipPrimaryText]}>
              {t('imaging.images.primary')}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function GridTile({
  image,
  index,
  modality,
  t,
  selected,
  onSelect,
  onOpen,
}: {
  image: StudyImage;
  index: number;
  modality: string;
  t: TFunction;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <View style={[styles.tile, selected && styles.tileOn]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onSelect}
        onLongPress={onOpen}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={t('imaging.images.openImage', { label: image.view_label })}
      >
        <StoredImage uri={image.thumbnail_url} style={styles.tileImage} resizeMode="cover" />
        {selected && (
          <View style={styles.tick}>
            <Icon name="check" size={14} color={colors.textOnBrand} strokeWidth={2.6} />
          </View>
        )}
      </TouchableOpacity>
      <Caption image={image} index={index} modality={modality} t={t} onMore={onOpen} />
    </View>
  );
}

function ListTile({
  image,
  index,
  modality,
  t,
  selected,
  divider,
  onSelect,
  onOpen,
}: {
  image: StudyImage;
  index: number;
  modality: string;
  t: TFunction;
  selected: boolean;
  divider: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onSelect}
      onLongPress={onOpen}
      style={[styles.listRow, divider && styles.listDivider, selected && styles.listRowOn]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={t('imaging.images.openImage', { label: image.view_label })}
    >
      <StoredImage uri={image.thumbnail_url} style={styles.listThumb} resizeMode="cover" />
      <View style={styles.listBody}>
        <Caption image={image} index={index} modality={modality} t={t} onMore={onOpen} />
      </View>
    </TouchableOpacity>
  );
}

function FootAction({
  icon,
  label,
  onPress,
}: {
  icon: 'eye' | 'download' | 'share' | 'columns';
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      style={styles.action}
    >
      <Icon name={icon} size={18} color={colors.link} />
      <Text style={styles.actionText} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  identity: { flexDirection: 'row', gap: spacing.md },
  identityThumb: { width: 92, height: 108, borderRadius: radii.sm },
  identityBody: { flex: 1, minWidth: 0, gap: 6 },
  modalityChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.sm - 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  modalityChipText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.blue,
  },
  identityTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    lineHeight: typography.lineHeight.lg,
    color: colors.textPrimary,
  },
  identityBadge: { flexDirection: 'row' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  layoutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  layoutBody: { flex: 1, minWidth: 0 },
  sectionTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  sectionSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  layoutToggle: { flexDirection: 'row', gap: spacing.sm },
  layoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm + 2,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.surface,
  },
  layoutButtonOn: { borderColor: colors.blue, backgroundColor: colors.primarySoft },
  layoutButtonText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 2 },
  tile: {
    flexBasis: '48%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  tileOn: { borderColor: colors.blue, borderWidth: 2 },
  tileImage: { width: '100%', aspectRatio: 0.88 },
  tick: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },

  caption: { padding: 10, gap: 5 },
  captionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  captionTitle: {
    flex: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  captionMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  captionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.sm - 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagChipText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 11,
    color: colors.blue,
  },
  tagChipPrimary: { backgroundColor: colors.statusNormalBg },
  tagChipPrimaryText: { color: colors.statusNormal },

  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: 10 },
  listRowOn: { backgroundColor: colors.primarySoft },
  listDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  listThumb: { width: 76, height: 76, borderRadius: radii.sm },
  listBody: { flex: 1, minWidth: 0 },

  infoTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  infoBody: {
    marginTop: 2,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: {
    flexGrow: 1,
    flexBasis: '22%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  actionText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 12,
    color: colors.link,
  },

  footNote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
