/**
 * DOC-001 — Medical Certificate preview.
 *
 * Renders the certificate itself from `GET /patient/documents/{id}/certificate`
 * (structure) over the document row that carries the real PDF. The QR block
 * encodes the public verification URL, and "Download (PDF)" mints a signed
 * share link and opens the genuine file the seeder wrote to storage.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  API_BASE_URL,

  fetchCertificateForDocument,
  fetchDocument,
  type MedicalCertificate,
  type PortalDocumentDetail,
} from '../../api';
import { Card, Icon, IconName, ScreenHeader, useDialog } from '../../components';
import { useTranslation, type TFunction } from '../../i18n';
import { patientErrorMessage } from '../../lib/errors';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, statusMap, typography } from '../../theme/theme';
import { QrCode } from '../../utils/QrCode';
import { AsyncBoundary, CareButton, useAsync } from '../care/shared';
import { fmtBytes, fmtDocDate, fmtDocDateLong, openDocument, pronoun, shareDocumentLink } from './shared';

type Data = { certificate: MedicalCertificate | null; document: PortalDocumentDetail };

export function MedicalCertificateScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'MedicalCertificate'>>();
  const documentId = params.documentId;

  const [busy, setBusy] = useState<null | 'download' | 'share' | 'preview'>(null);
  const dialog = useDialog();
  const busyRef = useRef(false);

  const load = useCallback(async (): Promise<Data> => {
    const document = await fetchDocument(documentId);
    // Not every document is a certificate — the render degrades to the file
    // strip plus the PDF actions rather than failing.
    const certificate = await fetchCertificateForDocument(documentId).catch(() => null);
    return { certificate, document };
  }, [documentId]);

  const state = useAsync<Data>(load, [documentId]);

  async function run(kind: 'download' | 'share' | 'preview', fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      dialog.show({
        title: t('docs.certificate.openFailedTitle'),
        tone: 'critical',
        cancelLabel: t('docs.preview.ok'),
        message: patientErrorMessage(e, t('docs.certificate.openFailedMessage')),
      });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  return (
    <View style={s.screen}>
      <ScreenHeader
        title={t('docs.certificate.title')}
        align="center"
        actions={[
          {
            icon: 'share',
            onPress: () =>
              run('share', () =>
                shareDocumentLink(documentId, state.data?.document.label ?? t('docs.certificate.labelFallback'))
              ),
            accessibilityLabel: t('docs.certificate.shareA11y'),
          },
          {
            icon: 'more-vertical',
            onPress: () => navigation.navigate('DocumentPreview', { documentId }),
            accessibilityLabel: t('docs.certificate.actionsA11y'),
          },
        ]}
      />

      <ScrollView contentContainerStyle={s.body}>
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('docs.certificate.loading')}
        >
          {({ certificate: c, document: d }) => (
            <>
              {/* File strip */}
              <Card style={s.fileCard}>
                <View style={s.fileRow}>
                  <View style={s.fileIcon}>
                    <Icon name="document-text" size={24} color={colors.statusCritical} />
                  </View>
                  <View style={s.fileBody}>
                    <Text style={s.fileName} numberOfLines={1}>
                      {/* The document label is the server's — never translated. */}
                      {d.label ?? t('docs.certificate.labelFallback')}
                    </Text>
                    <Text style={s.fileMeta}>
                      {(d.file_type ?? 'pdf').toUpperCase()} • {fmtBytes(d.file_size)}
                    </Text>
                  </View>
                  <VerifiedPill verified={!!c?.is_verified} status={c?.status ?? null} />
                </View>
              </Card>

              {/* The certificate page */}
              <Card style={s.page}>
                <View style={s.pageHead}>
                  <View style={s.brandLeft}>
                    <View style={s.brandMark}>
                      <Icon name="plus" size={18} color={colors.blueLight} strokeWidth={2.4} />
                    </View>
                    <Text style={s.brandName}>
                      {c?.facility_name ?? d.label ?? t('docs.certificate.facilityFallback')}
                    </Text>
                  </View>
                  <View style={s.brandRight}>
                    <Text style={s.brandOpes}>OPES EMR</Text>
                    <Text style={s.brandOpesSub}>{t('docs.certificate.brandSub')}</Text>
                  </View>
                </View>

                <Text style={s.certTitle}>{t('docs.certificate.heading')}</Text>
                <View style={s.rule}>
                  <View style={s.ruleLine} />
                  <View style={s.ruleDot} />
                  <View style={s.ruleLine} />
                </View>

                <View style={s.metaBlock}>
                  <MetaLine label={t('docs.certificate.certificateNo')} value={c?.certificate_number ?? '—'} />
                  <MetaLine label={t('docs.certificate.dateIssued')} value={fmtDocDate(c?.issued_at ?? d.created_at)} />
                </View>

                <Text style={s.lead}>{t('docs.certificate.lead')}</Text>

                <View style={s.factBlock}>
                  <Fact label={t('docs.certificate.name')} value={c?.patient.name ?? '—'} />
                  <Fact label={t('docs.certificate.patientId')} value={c?.patient.medical_id ?? '—'} />
                  <Fact
                    label={t('docs.certificate.ageGender')}
                    value={
                      c?.patient.age != null || c?.patient.sex
                        ? `${c?.patient.age ?? '—'} / ${cap(c?.patient.sex ?? '—')}`
                        : '—'
                    }
                  />
                </View>

                <View style={s.hr} />

                {/* One key per sentence (rule 4): the French word order differs,
                    so the facility name lost its inline bold rather than the
                    sentence being stitched together from translated fragments. */}
                <View style={s.prose}>
                  <Text style={s.proseText}>
                    {t('docs.certificate.examined', {
                      facility: c?.facility_name ?? t('docs.preview.facilityFallback'),
                      date: fmtDocDateLong(c?.examined_at ?? c?.issued_at ?? d.created_at),
                    })}
                  </Text>

                  {!!c?.unfit_from && !!c?.unfit_to && (
                    <Text style={s.proseText}>
                      {t('docs.certificate.unfit', {
                        subject: pronoun(c.patient.sex).subject,
                        from: fmtDocDateLong(c.unfit_from),
                        to: fmtDocDateLong(c.unfit_to),
                        rest: c.rest_days ? t('docs.certificate.restDays', { count: c.rest_days }) : '',
                        cause: c.diagnosis ? t('docs.certificate.cause', { diagnosis: c.diagnosis }) : '',
                      })}
                    </Text>
                  )}

                  {/* Advice and purpose are the clinician's own words. */}
                  {!!c?.advice && <Text style={s.proseText}>{c.advice}</Text>}
                  {!!c?.purpose && (
                    <Text style={s.proseText}>{t('docs.certificate.purpose', { purpose: lower(c.purpose) })}</Text>
                  )}
                </View>

                {/* Signature + authorising seal */}
                <View style={s.signRow}>
                  <View style={s.signBlock}>
                    <View style={s.signLine} />
                    <Text style={s.signName}>{c?.provider_name ?? '—'}</Text>
                    <Text style={s.signMeta}>{c?.provider_role ?? '—'}</Text>
                    <Text style={s.signMeta}>
                      {t('docs.certificate.registrationNo', { value: c?.provider_registration_no ?? '—' })}
                    </Text>
                    <Text style={s.signMeta}>{c?.facility_name ?? '—'}</Text>
                  </View>
                  <View style={s.seal}>
                    <Icon name="shield-check" size={34} color={colors.blue} />
                    <Text style={s.sealText}>{t('docs.certificate.authorised')}</Text>
                  </View>
                </View>

                {/* Electronic issuance + QR verification */}
                <View style={s.verifyBox}>
                  <Icon name="shield" size={22} color={colors.blue} />
                  <View style={s.verifyBody}>
                    <Text style={s.verifyTitle}>{t('docs.certificate.electronicTitle')}</Text>
                    <Text style={s.verifyText}>{t('docs.certificate.electronicText')}</Text>
                    <Text style={s.verifyItalic}>{t('docs.certificate.scanQr')}</Text>
                  </View>
                  {!!c?.verification_code && (
                    <View style={s.qrBox}>
                      <QrCode
                        value={`${API_BASE_URL}/patient/certificates/verify/${c.verification_code}`}
                        size={78}
                        quietZone={1}
                      />
                    </View>
                  )}
                </View>
              </Card>

              <View style={s.pageChipWrap}>
                <View style={s.pageChip}>
                  <Text style={s.pageChipText}>1 / 1</Text>
                </View>
              </View>

              {/* Thumbnail rail */}
              <View style={s.rail}>
                <View style={s.thumb}>
                  <Icon name="document-text" size={30} color={colors.blue} />
                  <View style={s.thumbBadge}>
                    <Text style={s.thumbBadgeText}>1</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={s.addThumb}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  onPress={() => navigation.navigate('DocumentPreview', { documentId })}
                >
                  <Icon name="plus" size={22} color={colors.link} />
                  <Text style={s.addThumbText}>{t('docs.certificate.addToLine1')}</Text>
                  <Text style={s.addThumbText}>{t('docs.certificate.addToLine2')}</Text>
                </TouchableOpacity>
              </View>

              {/* Viewer tools */}
              <View style={s.tools}>
                <Tool
                  icon="refresh"
                  label={t('docs.certificate.toolRotate')}
                  onPress={() =>
                    dialog.show({
                      title: t('docs.certificate.toolRotate'),
                      tone: 'info',
                      cancelLabel: t('docs.preview.ok'),
                      message: t('docs.certificate.toolRotateMessage'),
                    })
                  }
                />
                <Tool
                  icon="search"
                  label={t('docs.certificate.toolSearch')}
                  onPress={() =>
                    dialog.show({
                      title: t('docs.certificate.toolSearch'),
                      tone: 'info',
                      cancelLabel: t('docs.preview.ok'),
                      message: t('docs.certificate.toolSearchMessage'),
                    })
                  }
                />
                <Tool
                  icon="edit"
                  label={t('docs.certificate.toolMarkup')}
                  onPress={() =>
                    dialog.show({
                      title: t('docs.certificate.toolMarkup'),
                      tone: 'info',
                      cancelLabel: t('docs.preview.ok'),
                      message: t('docs.certificate.toolMarkupMessage'),
                    })
                  }
                />
                <Tool
                  icon="more-horizontal"
                  label={t('docs.certificate.toolMore')}
                  onPress={() => navigation.navigate('DocumentPreview', { documentId })}
                />
              </View>

              <View style={s.cta}>
                <CareButton
                  label={t('docs.certificate.previewFullScreen')}
                  icon="eye"
                  variant="secondary"
                  loading={busy === 'preview'}
                  onPress={() => run('preview', () => openDocument(documentId))}
                  style={s.ctaHalf}
                />
                <CareButton
                  label={t('docs.certificate.downloadPdf')}
                  icon="download"
                  loading={busy === 'download'}
                  onPress={() => run('download', () => openDocument(documentId))}
                  style={s.ctaHalf}
                />
              </View>
            </>
          )}
        </AsyncBoundary>
      </ScrollView>

      {dialog.element}
    </View>
  );
}

const cap = (v: string) => (v ? v[0].toUpperCase() + v.slice(1) : v);
const lower = (v: string) => (v ? v[0].toLowerCase() + v.slice(1) : v);

function VerifiedPill({ verified, status }: { verified: boolean; status: string | null }) {
  const { t } = useTranslation();
  const tone = verified ? statusMap.normal : status === 'requested' ? statusMap.warning : statusMap.neutral;
  const label = verified
    ? t('docs.certificate.verified')
    : status === 'requested'
      ? t('docs.certificate.requested')
      : t('docs.certificate.unverified');
  return (
    <View style={[s.verifiedPill, { borderColor: tone.fg, backgroundColor: tone.bg }]}>
      <Icon name={verified ? 'shield-check' : 'alert-circle'} size={16} color={tone.fg} />
      <Text style={[s.verifiedText, { color: tone.fg }]}>{label}</Text>
    </View>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaLine}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.fact}>
      <Text style={s.factLabel}>{label}</Text>
      <Text style={s.factValue}>{value}</Text>
    </View>
  );
}

function Tool({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.tool} onPress={onPress} activeOpacity={0.8} accessibilityRole="button">
      <Icon name={icon} size={20} color={colors.link} />
      <Text style={s.toolText}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  fileCard: {},
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4 },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.sm + 2,
    backgroundColor: colors.statusCriticalBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileBody: { flex: 1, minWidth: 0, gap: 2 },
  fileName: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.link },
  fileMeta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  verifiedText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },

  page: { paddingHorizontal: spacing.md, paddingVertical: spacing.lg, gap: spacing.md },
  pageHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  brandLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: colors.blueLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  brandRight: { alignItems: 'flex-end' },
  brandOpes: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.md, color: colors.navy },
  brandOpesSub: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 7,
    letterSpacing: 0.8,
    color: colors.textMuted,
  },

  certTitle: {
    textAlign: 'center',
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    letterSpacing: 0.4,
    color: colors.blue,
    marginTop: spacing.sm,
  },
  rule: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  ruleLine: { width: 70, height: 1, backgroundColor: colors.blue },
  ruleDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.blue },

  metaBlock: { alignItems: 'flex-end', gap: 4 },
  metaLine: { flexDirection: 'row', gap: spacing.sm },
  metaLabel: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary },
  metaValue: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.textPrimary },

  lead: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary },
  factBlock: { gap: 6 },
  fact: { flexDirection: 'row', gap: spacing.md },
  factLabel: {
    width: 100,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  factValue: { flex: 1, fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary },

  hr: { height: 1, backgroundColor: colors.border },

  prose: { gap: spacing.sm },
  proseText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.md,
    color: colors.textSecondary,
  },
  proseStrong: { fontFamily: typography.fontFamily.semiBold, color: colors.textPrimary },

  signRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.md },
  signBlock: { flex: 1, gap: 2 },
  signLine: { height: 1, backgroundColor: colors.border, marginBottom: 6 },
  signName: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.link },
  signMeta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textSecondary },
  seal: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  sealText: { fontFamily: typography.fontFamily.semiBold, fontSize: 10, letterSpacing: 0.6, color: colors.blue },

  verifyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md - 4,
    borderRadius: radii.sm,
    backgroundColor: colors.primarySoft,
    marginTop: spacing.sm,
  },
  verifyBody: { flex: 1, minWidth: 0, gap: 2 },
  verifyTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs, color: colors.link },
  verifyText: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textSecondary },
  verifyItalic: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, fontStyle: 'italic', color: colors.textSecondary },
  qrBox: { padding: 4, borderRadius: radii.sm, backgroundColor: colors.surface },

  pageChipWrap: { alignItems: 'center', marginTop: -spacing.sm },
  pageChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.sm, backgroundColor: colors.divider },
  pageChipText: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: colors.textSecondary },

  rail: { flexDirection: 'row', gap: spacing.md },
  thumb: {
    width: 96,
    height: 128,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.blue,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbBadge: {
    position: 'absolute',
    left: -8,
    bottom: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  thumbBadgeText: { fontFamily: typography.fontFamily.semiBold, fontSize: 11, color: colors.textOnBrand },
  addThumb: {
    width: 110,
    height: 128,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addThumbText: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: colors.textSecondary },

  tools: { flexDirection: 'row', gap: spacing.sm },
  tool: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  toolText: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.link },

  cta: { flexDirection: 'row', gap: spacing.sm },
  ctaHalf: { flex: 1 },
});
