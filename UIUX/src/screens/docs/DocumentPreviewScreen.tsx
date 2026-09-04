/**
 * DOC-002 — Document Preview / delivery actions.
 *
 * Every action here reaches a real endpoint: "Save to Health Record" persists
 * through `POST /patient/certificates/{id}/save`, and Download / Share / Print
 * mint a fresh short-lived signed link (`POST /patient/documents/{id}/share`)
 * that streams the genuine PDF from storage.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import {
  fetchCertificateForDocument,
  fetchDocument,
  setCertificateSaved,
  type MedicalCertificate,
  type PortalDocumentDetail,
} from '../../api';
import { Card, Icon, IconName, ScreenHeader, useDialog } from '../../components';
import { useTranslation } from '../../i18n';
import { patientErrorMessage, writeFailureMessage } from '../../lib/errors';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, statusMap, typography } from '../../theme/theme';
import { formatLabel } from '../../utils/format';
import { AsyncBoundary, CareButton, useAsync } from '../care/shared';
import { fmtBytes, fmtDocDate, fmtDocTime, openDocument, shareDocumentLink } from './shared';

type Data = { certificate: MedicalCertificate | null; document: PortalDocumentDetail };

export function DocumentPreviewScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'DocumentPreview'>>();
  const documentId = params.documentId;

  const [banner, setBanner] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialog = useDialog();
  const busyRef = useRef(false);
  const savingRef = useRef(false);

  const load = useCallback(async (): Promise<Data> => {
    const document = await fetchDocument(documentId);
    const certificate = await fetchCertificateForDocument(documentId).catch(() => null);
    return { certificate, document };
  }, [documentId]);

  const state = useAsync<Data>(load, [documentId]);
  const { setData } = state;

  async function run(kind: string, fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      dialog.show({
        title: t('docs.preview.actionFailedTitle'),
        tone: 'critical',
        cancelLabel: t('docs.preview.ok'),
        message: patientErrorMessage(e, t('docs.preview.actionFailedMessage')),
      });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function toggleSaved(next: boolean, data: Data) {
    if (!data.certificate) {
      dialog.show({
        title: t('docs.preview.alreadySavedTitle'),
        tone: 'info',
        cancelLabel: t('docs.preview.ok'),
        message: t('docs.preview.alreadySavedMessage'),
      });
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const updated = await setCertificateSaved(data.certificate.id, next);
      setData({ ...data, certificate: updated });
    } catch (e) {
      dialog.show({
        title: t('docs.preview.settingFailedTitle'),
        tone: 'critical',
        cancelLabel: t('docs.preview.ok'),
        message: writeFailureMessage(
          e,
          t('docs.preview.settingFailedRefresh'),
          t('docs.preview.settingFailedMessage')
        ),
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <View style={s.screen}>
      <ScreenHeader
        title={t('docs.preview.title')}
        align="center"
        actions={[
          {
            icon: 'first-aid',
            onPress: () =>
              navigation.navigate('MainTabs', { screen: 'HealthTab', params: { screen: 'RecordsHub' } }),
            accessibilityLabel: t('docs.preview.healthRecordA11y'),
          },
          {
            icon: 'phone',
            onPress: () =>
              navigation.navigate('MainTabs', { screen: 'HealthTab', params: { screen: 'RecordsHub' } }),
            accessibilityLabel: t('docs.preview.contactA11y'),
          },
        ]}
      />

      <ScrollView contentContainerStyle={s.body}>
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('docs.preview.loading')}
        >
          {(data) => {
            const { certificate: c, document: d } = data;
            const verified = !!c?.is_verified;
            const savedOn = c?.saved_to_record ?? true;
            return (
              <>
                {/* Hero */}
                <View style={s.hero}>
                  <View style={s.heroIcon}>
                    <Icon name="document-text" size={28} color={colors.blue} />
                  </View>
                  <View style={s.heroBody}>
                    <Text style={s.heroTitle} numberOfLines={2}>
                      {/* The document label is the server's — never translated. */}
                      {d.label ?? t('docs.preview.documentFallback')}
                    </Text>
                    <Text style={s.heroMeta}>
                      {fmtDocTime(c?.issued_at ?? d.created_at)
                        ? t('docs.preview.generatedOnAt', {
                            date: fmtDocDate(c?.issued_at ?? d.created_at),
                            time: fmtDocTime(c?.issued_at ?? d.created_at),
                          })
                        : t('docs.preview.generatedOn', { date: fmtDocDate(c?.issued_at ?? d.created_at) })}
                    </Text>
                    {!!c?.facility_name && (
                      <View style={s.heroPlace}>
                        <Icon name="location" size={14} color={colors.link} />
                        <Text style={s.heroPlaceText} numberOfLines={1}>
                          {c.facility_name}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={[s.pill, { backgroundColor: verified ? statusMap.normal.bg : statusMap.warning.bg }]}>
                    <Icon
                      name={verified ? 'check-circle' : 'alert-circle'}
                      size={16}
                      color={verified ? statusMap.normal.fg : statusMap.warning.fg}
                    />
                    <Text style={[s.pillText, { color: verified ? statusMap.normal.fg : statusMap.warning.fg }]}>
                      {verified ? t('docs.preview.verified') : t('docs.preview.pending')}
                    </Text>
                  </View>
                </View>

                {/* Ready banner */}
                {banner && d.is_available && (
                  <View style={s.banner}>
                    <View style={s.bannerIcon}>
                      <Icon name="check" size={20} color={colors.textOnBrand} strokeWidth={2.4} />
                    </View>
                    <View style={s.bannerBody}>
                      <Text style={s.bannerTitle}>{t('docs.preview.bannerTitle')}</Text>
                      {/* Only shown when `d.is_available` — i.e. the clinic has
                          actually published a downloadable file for this row. */}
                      <Text style={s.bannerText}>
                        {savedOn ? t('docs.preview.bannerSaved') : t('docs.preview.bannerAvailable')}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setBanner(false)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={t('docs.preview.dismissA11y')}
                    >
                      <Icon name="close" size={20} color={statusMap.normal.fg} />
                    </TouchableOpacity>
                  </View>
                )}

                {/* File preview */}
                <Card style={s.previewCard}>
                  <View style={s.previewRow}>
                    <View style={s.sheet}>
                      <Icon name="document-text" size={34} color={colors.blue} />
                      <Text style={s.sheetCaption} numberOfLines={2}>
                        {/* A certificate number is already correctly cased and
                            must pass through untouched; only the document-type
                            fallback is a raw enum needing sentence case. */}
                        {c?.certificate_number ?? formatLabel(d.document_type)}
                      </Text>
                    </View>
                    <View style={s.previewBody}>
                      <View style={s.previewHead}>
                        <View style={s.pdfIcon}>
                          <Icon name="document-text" size={20} color={colors.statusCritical} />
                        </View>
                        <View style={s.previewNameBox}>
                          <Text style={s.previewName} numberOfLines={2}>
                            {fileName(d)}
                          </Text>
                          <Text style={s.previewMeta}>
                            {fmtBytes(d.file_size)} • {(d.file_type ?? 'pdf').toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <Text style={s.previewDesc}>
                        {c
                          ? t('docs.preview.certificateDesc', {
                              facility: c.facility_name ?? t('docs.preview.facilityFallback'),
                            })
                          : t('docs.preview.documentDesc')}
                      </Text>
                      <View style={s.chip}>
                        <Icon name="shield-check" size={16} color={colors.link} />
                        <Text style={s.chipText}>
                          {verified ? t('docs.preview.verifiedDocument') : t('docs.preview.awaitingVerification')}
                        </Text>
                      </View>
                    </View>
                  </View>
                </Card>

                {/* Actions */}
                <Card variant="flush" style={s.actions}>
                  <View style={s.saveRow}>
                    <View style={s.actionIcon}>
                      <Icon name="folder-plus" size={20} color={colors.blue} />
                    </View>
                    <View style={s.actionBody}>
                      <Text style={s.actionTitle}>{t('docs.preview.saveTitle')}</Text>
                      <Text style={s.actionSub}>{t('docs.preview.saveSub')}</Text>
                    </View>
                    <Switch
                      value={savedOn}
                      disabled={saving || !c}
                      onValueChange={(v) => toggleSaved(v, data)}
                      trackColor={{ false: colors.divider, true: colors.blue }}
                      thumbColor={colors.surface}
                      accessibilityLabel={t('docs.preview.saveTitle')}
                    />
                  </View>

                  {savedOn && (
                    <TouchableOpacity
                      style={s.savedStrip}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      onPress={() => navigation.navigate('MainTabs', { screen: 'HealthTab', params: { screen: 'Documents' } })}
                    >
                      <Icon name="check-circle" size={22} color={colors.link} />
                      <View style={s.actionBody}>
                        <Text style={s.savedTitle}>{t('docs.preview.savedTitle')}</Text>
                        <Text style={s.actionSub}>{t('docs.preview.savedSub')}</Text>
                      </View>
                      <Icon name="chevron-right" size={20} color={colors.link} />
                    </TouchableOpacity>
                  )}

                  <View style={s.actionDivider} />

                  <ActionRow
                    icon="download"
                    title={t('docs.preview.downloadTitle')}
                    subtitle={t('docs.preview.downloadSub')}
                    busy={busy === 'download'}
                    onPress={() => run('download', () => openDocument(documentId))}
                    divider
                  />
                  <ActionRow
                    icon="share"
                    title={t('docs.preview.shareTitle')}
                    subtitle={t('docs.preview.shareSub')}
                    busy={busy === 'share'}
                    onPress={() =>
                      run('share', () => shareDocumentLink(documentId, d.label ?? t('docs.preview.documentFallback')))
                    }
                    divider
                  />
                  <ActionRow
                    icon="folder-plus"
                    title={t('docs.preview.filesTitle')}
                    subtitle={t('docs.preview.filesSub')}
                    busy={busy === 'files'}
                    onPress={() => run('files', () => openDocument(documentId))}
                    divider
                  />
                  <ActionRow
                    icon="print"
                    title={t('docs.preview.printTitle')}
                    subtitle={t('docs.preview.printSub')}
                    busy={busy === 'print'}
                    onPress={() => run('print', () => openDocument(documentId))}
                  />
                </Card>

                {/* Compliance note */}
                <View style={s.secure}>
                  <View style={s.secureIcon}>
                    <Icon name="lock" size={20} color={colors.blue} />
                  </View>
                  <View style={s.secureBody}>
                    <Text style={s.secureTitle}>{t('docs.preview.secureTitle')}</Text>
                    <Text style={s.secureText}>{t('docs.preview.secureText')}</Text>
                  </View>
                  <Icon name="shield" size={34} color={colors.blueLight} />
                </View>

                <View style={s.cta}>
                  <CareButton
                    label={t('docs.preview.backToDocument')}
                    icon="chevron-left"
                    variant="secondary"
                    onPress={() =>
                      navigation.canGoBack()
                        ? navigation.goBack()
                        : navigation.navigate('MedicalCertificate', { documentId })
                    }
                    style={s.ctaHalf}
                  />
                  <CareButton
                    label={t('docs.preview.viewInRecord')}
                    icon="folder"
                    onPress={() => navigation.navigate('MainTabs', { screen: 'HealthTab', params: { screen: 'Documents' } })}
                    style={s.ctaHalf}
                  />
                </View>
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>

      {dialog.element}
    </View>
  );
}

function fileName(d: PortalDocumentDetail): string {
  const base = (d.label ?? 'document').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
  return `${base}.${d.file_type ?? 'pdf'}`;
}

function ActionRow({
  icon,
  title,
  subtitle,
  onPress,
  busy,
  divider,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  busy?: boolean;
  divider?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[s.actionRow, divider && s.actionRowDivider]}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.8}
      accessibilityRole="button"
    >
      <View style={s.actionIcon}>
        <Icon name={icon} size={20} color={colors.blue} />
      </View>
      <View style={s.actionBody}>
        <Text style={s.actionTitle}>{title}</Text>
        <Text style={s.actionSub}>{subtitle}</Text>
      </View>
      <Icon name={busy ? 'clock' : 'chevron-right'} size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  hero: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md - 4 },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.tintPurpleBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBody: { flex: 1, minWidth: 0, gap: 3 },
  heroTitle: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.lg, color: colors.textPrimary },
  heroMeta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary },
  heroPlace: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroPlaceText: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.link },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill },
  pillText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },

  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md - 4,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: statusMap.normal.bg,
  },
  bannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: statusMap.normal.fg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerBody: { flex: 1, gap: 3 },
  bannerTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: statusMap.normal.fg },
  bannerText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: statusMap.normal.fg,
  },

  previewCard: {},
  previewRow: { flexDirection: 'row', gap: spacing.md - 4 },
  sheet: {
    width: 108,
    height: 152,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: spacing.sm,
  },
  sheetCaption: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 10,
    textAlign: 'center',
    color: colors.textMuted,
  },
  previewBody: { flex: 1, minWidth: 0, gap: spacing.sm },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pdfIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.statusCriticalBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewNameBox: { flex: 1, minWidth: 0, gap: 2 },
  previewName: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.link },
  previewMeta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textSecondary },
  previewDesc: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
  chipText: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.link },

  actions: { overflow: 'hidden' },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4, padding: spacing.md },
  savedStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md - 4,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
  },
  savedTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.link },
  actionDivider: { height: 1, backgroundColor: colors.divider },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4, paddingVertical: 14, paddingHorizontal: spacing.md },
  actionRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.tintBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBody: { flex: 1, minWidth: 0, gap: 2 },
  actionTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.textPrimary },
  actionSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  secure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  secureIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secureBody: { flex: 1, minWidth: 0, gap: 2 },
  secureTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.link },
  secureText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  cta: { flexDirection: 'row', gap: spacing.sm },
  ctaHalf: { flex: 1 },
});
