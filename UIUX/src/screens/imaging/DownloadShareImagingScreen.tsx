/**
 * DIA-014 — Download / Share Imaging.
 *
 * The reference is a sheet over the study detail: pick an action, a format and
 * what to include, then Continue.
 *
 * Continue does the real thing. It POSTs to `/patient/imaging/{study}/share`,
 * which mints a Laravel signed, expiring URL for the study — the same mechanism
 * `/patient/documents/{id}/share` already uses, extended to imaging rather than
 * duplicated — and then hands that URL to the OS: the browser for a download,
 * the native share sheet for a link, the mail client for an email. The link and
 * its expiry are shown afterwards, so nothing here is a decorative success
 * toast; if the server refuses, the error it gives is what the screen shows.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  absoluteApiUrl,
  fetchStudyImages,
  shareImagingStudy,
  type ImagingShare,
  type ImagingShareFormat,
  type StudyImageSet,
} from '../../api/imaging';
import { Icon, IconName, ScreenHeader, StatusBadge } from '../../components';
import { useUnread } from '../../context/UnreadContext';
import { useTranslation, type TFunction } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { TechnicalDetails } from './detailShared';
import {
  AsyncBoundary,
  errorMessage,
  fmtDate,
  fmtDateTime,
  fmtTime,
  modalityLabel,
  StoredImage,
  studyStatusIcon,
  studyStatusLabel,
  studyStatusTone,
  useAsync,
} from './viewerShared';

type Action = 'download' | 'link' | 'email';

type Choice<K> = { key: K; titleKey: string; subtitleKey: string };

const ACTIONS: (Choice<Action> & { icon: IconName; tint: string; bg: string })[] = [
  {
    key: 'download',
    icon: 'download',
    titleKey: 'imaging.share.actionDownload',
    subtitleKey: 'imaging.share.actionDownloadSub',
    tint: colors.blue,
    bg: colors.tintBlueBg,
  },
  {
    key: 'link',
    icon: 'share',
    titleKey: 'imaging.share.actionLink',
    subtitleKey: 'imaging.share.actionLinkSub',
    tint: colors.statusNormal,
    bg: colors.tintGreenBg,
  },
  {
    key: 'email',
    icon: 'mail',
    titleKey: 'imaging.share.actionEmail',
    subtitleKey: 'imaging.share.actionEmailSub',
    tint: colors.statusInfo,
    bg: colors.tintPurpleBg,
  },
];

const FORMATS: Choice<ImagingShareFormat>[] = [
  {
    key: 'original',
    titleKey: 'imaging.share.formatOriginal',
    subtitleKey: 'imaging.share.formatOriginalSub',
  },
  {
    key: 'image',
    titleKey: 'imaging.share.formatImage',
    subtitleKey: 'imaging.share.formatImageSub',
  },
  {
    key: 'report',
    titleKey: 'imaging.share.formatReport',
    subtitleKey: 'imaging.share.formatReportSub',
  },
];

// `images`, `report` and `technical` are the only fields `ImagingShareInput`
// carries (see api/imaging.ts). An "Annotations" toggle used to sit here too,
// but nothing sent it and the API has no such field — it was a dead control, so
// it is gone rather than faked.
type IncludeKey = 'images' | 'report' | 'technical';

const INCLUDES: Choice<IncludeKey>[] = [
  {
    key: 'images',
    titleKey: 'imaging.share.includeImages',
    subtitleKey: 'imaging.share.includeImagesSub',
  },
  {
    key: 'report',
    titleKey: 'imaging.share.includeReport',
    subtitleKey: 'imaging.share.includeReportSub',
  },
  {
    key: 'technical',
    titleKey: 'imaging.share.includeTechnical',
    subtitleKey: 'imaging.share.includeTechnicalSub',
  },
];

export function DownloadShareImagingScreen() {
  const navigation = useNavigation<any>();
  const { notifications } = useUnread();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'DownloadShareImaging'>>();
  const studyId = params.studyId;

  const state = useAsync<StudyImageSet>(() => fetchStudyImages(studyId), [studyId]);

  const [action, setAction] = useState<Action>('download');
  const [format, setFormat] = useState<ImagingShareFormat>('original');
  const [include, setInclude] = useState<Record<IncludeKey, boolean>>({
    images: true,
    report: true,
    technical: false,
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImagingShare | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: IncludeKey) => setInclude((v) => ({ ...v, [key]: !v[key] }));

  const submit = async (studyName: string) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const link = await shareImagingStudy(studyId, {
        format,
        include_images: include.images,
        include_report: include.report,
        include_technical: include.technical,
      });
      // The signed path the server returns is host-relative; join it to the
      // API base this client is talking to before handing it to the OS.
      const url = absoluteApiUrl(link.share_url);
      setResult({ ...link, share_url: url });

      if (action === 'download') {
        await Linking.openURL(url);
      } else if (action === 'link') {
        await Share.share({
          title: studyName,
          message: t('imaging.share.shareMessage', {
            study: studyName,
            when: fmtDateTime(link.expires_at),
            url,
          }),
          url,
        });
      } else {
        const subject = encodeURIComponent(
          t('imaging.share.emailSubject', { study: studyName })
        );
        const body = encodeURIComponent(
          t('imaging.share.emailBody', {
            study: studyName,
            url,
            when: fmtDateTime(link.expires_at),
          })
        );
        await Linking.openURL(`mailto:?subject=${subject}&body=${body}`);
      }
    } catch (e) {
      setError(errorMessage(e, t('imaging.share.failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('imaging.share.title')}
        align="center"
        actions={[
          { icon: 'bell', badge: notifications, onPress: () => navigation.navigate('Notifications') },
          { icon: 'more-vertical', onPress: () => navigation.navigate('ImagingResults') },
        ]}
      />

      <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel={t('imaging.share.loading')}>
        {(set) => {
          const study = set.study;
          const primary = set.images[0];

          return (
            <ScrollView contentContainerStyle={styles.content}>
              {/* ── Context behind the sheet ─────────────────────────── */}
              <Text style={styles.contextTitle}>{t('imaging.share.contextTitle')}</Text>
              <View style={styles.contextCard}>
                {primary ? (
                  <StoredImage uri={primary.thumbnail_url} style={styles.contextThumb} resizeMode="cover" />
                ) : (
                  <View style={styles.contextThumb} />
                )}
                <View style={styles.contextBody}>
                  <Text style={styles.contextName}>{study.study_name}</Text>
                  <Text style={styles.contextMeta}>
                    {fmtDate(study.studied_at)} • {fmtTime(study.studied_at)}
                  </Text>
                  <Text style={styles.contextMeta} numberOfLines={2}>
                    {study.facility_name ? `${study.facility_name} – ${study.department}` : study.department}
                  </Text>
                  <TechnicalDetails
                    facts={[
                      { label: t('imaging.tech.studyUid'), value: study.study_uid },
                      { label: t('imaging.tech.orderNumber'), value: study.order_number },
                    ]}
                  />
                </View>
                <StatusBadge
                  status={study.status}
                  label={studyStatusLabel(t, study.status)}
                  tone={studyStatusTone(study.status)}
                  icon={studyStatusIcon(study.status)}
                />
              </View>

              {/* ── Sheet ────────────────────────────────────────────── */}
              <View style={styles.sheet}>
                <View style={styles.grabber} />

                <View style={styles.sheetHead}>
                  <Text style={styles.sheetTitle}>{t('imaging.share.sheetTitle')}</Text>
                  <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.close}
                    accessibilityRole="button"
                    accessibilityLabel={t('imaging.share.close')}
                  >
                    <Icon name="close" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {/* 1 — action */}
                <Text style={styles.step}>{t('imaging.share.step1')}</Text>
                <View style={styles.actionRow}>
                  {ACTIONS.map((a) => {
                    const on = a.key === action;
                    return (
                      <TouchableOpacity
                        key={a.key}
                        activeOpacity={0.85}
                        onPress={() => setAction(a.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={[styles.actionTile, on && styles.actionTileOn]}
                      >
                        <View style={[styles.actionCircle, { backgroundColor: a.bg }]}>
                          <Icon name={a.icon} size={20} color={a.tint} />
                        </View>
                        <Text style={styles.actionTitle}>{t(a.titleKey)}</Text>
                        <Text style={styles.actionSubtitle}>{t(a.subtitleKey)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.rule} />

                {/* 2 — format */}
                <Text style={styles.step}>{t('imaging.share.step2')}</Text>
                <View style={styles.formatRow}>
                  {FORMATS.map((f) => {
                    const on = f.key === format;
                    return (
                      <TouchableOpacity
                        key={f.key}
                        activeOpacity={0.85}
                        onPress={() => setFormat(f.key)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={[styles.formatTile, on && styles.formatTileOn]}
                      >
                        <View style={[styles.radio, on && styles.radioOn]}>
                          {on && <View style={styles.radioDot} />}
                        </View>
                        <View style={styles.formatBody}>
                          <Text style={styles.formatTitle}>{t(f.titleKey)}</Text>
                          <Text style={styles.formatSubtitle}>{t(f.subtitleKey)}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.rule} />

                {/* 3 — include */}
                <Text style={styles.step}>{t('imaging.share.step3')}</Text>
                <View style={styles.includes}>
                  {INCLUDES.map((c) => {
                    const on = include[c.key];
                    return (
                      <TouchableOpacity
                        key={c.key}
                        activeOpacity={0.8}
                        onPress={() => toggle(c.key)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        style={styles.includeRow}
                      >
                        <View style={[styles.checkbox, on && styles.checkboxOn]}>
                          {on && <Icon name="check" size={15} color={colors.textOnBrand} strokeWidth={2.6} />}
                        </View>
                        <View style={styles.includeBody}>
                          <Text style={styles.includeTitle}>{t(c.titleKey)}</Text>
                          <Text style={styles.includeSubtitle}>{t(c.subtitleKey)}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.rule} />

                {/* 4 — security */}
                <Text style={styles.step}>{t('imaging.share.step4')}</Text>
                <View style={styles.securityRow}>
                  <View style={styles.securityCircle}>
                    <Icon name="lock" size={20} color={colors.statusInfo} />
                  </View>
                  <View style={styles.securityBody}>
                    <Text style={styles.securityTitle}>{t('imaging.share.securityTitle')}</Text>
                    <Text style={styles.securitySubtitle}>{t('imaging.share.securityBody')}</Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={colors.textMuted} />
                </View>

                {!!error && (
                  <View style={[styles.resultBox, styles.resultError]}>
                    <Icon name="alert-circle" size={18} color={colors.statusCritical} />
                    <Text style={styles.resultText}>{error}</Text>
                  </View>
                )}

                {!!result && (
                  <View style={styles.resultBox}>
                    <Icon name="shield-check" size={18} color={colors.statusNormal} />
                    <View style={styles.resultBody}>
                      <Text style={styles.resultTitle}>
                        {t('imaging.share.linkReady', { when: fmtDateTime(result.expires_at) })}
                      </Text>
                      <Text style={styles.resultText} numberOfLines={3}>
                        {result.share_url}
                      </Text>
                      <Text style={styles.resultMeta}>
                        {t('imaging.share.linkImages', { count: result.image_count })}
                        {result.has_report ? t('imaging.share.linkWithReport') : ''}
                      </Text>
                      <TouchableOpacity
                        onPress={() => Linking.openURL(result.share_url)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.resultLink}>{t('imaging.share.openLink')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Continue */}
                <TouchableOpacity
                  onPress={() => submit(study.study_name)}
                  disabled={busy}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  style={[styles.continue, busy && styles.continueOff]}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.textOnBrand} />
                  ) : (
                    <Icon name="upload" size={20} color={colors.textOnBrand} />
                  )}
                  <Text style={styles.continueText}>
                    {busy ? t('imaging.share.preparing') : t('imaging.share.continue')}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.footNote}>
                  {t('imaging.share.footNote', {
                    scanType: modalityLabel(t, study.modality),
                    bodyPart: study.body_part,
                    count: set.count,
                  })}
                </Text>
              </View>
            </ScrollView>
          );
        }}
      </AsyncBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm + 4, paddingBottom: spacing.xl },

  contextTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xl,
    color: colors.textPrimary,
  },
  contextCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.sm + 4,
  },
  contextThumb: { width: 72, height: 72, borderRadius: radii.sm },
  contextBody: { flex: 1, minWidth: 0, gap: 1 },
  contextName: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  contextMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },

  sheet: {
    marginTop: spacing.sm,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm + 2,
  },
  grabber: {
    alignSelf: 'center',
    width: 56,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.divider,
    marginBottom: spacing.sm,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sheetTitle: {
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xl,
    color: colors.textPrimary,
  },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },

  step: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  rule: { height: 1, backgroundColor: colors.divider },

  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionTile: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: 6,
  },
  actionTileOn: { borderColor: colors.blue, backgroundColor: colors.primarySoft },
  actionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  actionTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  actionSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  formatRow: { gap: spacing.sm },
  formatTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm + 4,
  },
  formatTileOn: { borderColor: colors.blue, backgroundColor: colors.primarySoft },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.blue },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.blue },
  formatBody: { flex: 1, minWidth: 0 },
  formatTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  formatSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },

  includes: { gap: spacing.sm + 2 },
  includeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 4 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  includeBody: { flex: 1, minWidth: 0 },
  includeTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  includeSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },

  securityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  securityCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.tintPurpleBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityBody: { flex: 1, minWidth: 0 },
  securityTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  securitySubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  resultBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.statusNormalBg,
    padding: spacing.sm + 4,
  },
  resultError: { backgroundColor: colors.statusCriticalBg },
  resultBody: { flex: 1, minWidth: 0, gap: 2 },
  resultTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  resultText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },
  resultMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  resultLink: {
    marginTop: 2,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.link,
  },

  continue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.blue,
    paddingVertical: 16,
  },
  continueOff: { opacity: 0.7 },
  continueText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textOnBrand,
  },

  footNote: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
