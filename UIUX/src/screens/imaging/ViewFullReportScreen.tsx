/**
 * DIA-012 — View Full Report.
 *
 * The radiologist's report rendered as the document it is: a letterhead, the
 * patient and referrer blocks, the acquisition strip, findings, impression,
 * recommendation and the digital signature — paged, with page thumbnails and
 * the Previous / Next / Fit controls the reference shows.
 *
 * Data comes from `/patient/imaging-reports/{report}`, which accepts either the
 * study id or the result id. Download and Share are not decorative: both mint a
 * genuine short-lived signed link from `/patient/imaging/{study}/share` — the
 * same signed-route mechanism patient documents already use — and hand it to
 * the OS (browser download, native share sheet).
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
  fetchImagingReport,
  shareImagingStudy,
  type ImagingReport,
} from '../../api/imaging';
import { Card, Icon, ScreenHeader, Wordmark } from '../../components';
import { useUnread } from '../../context/UnreadContext';
import { useTranslation, type TFunction } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { TechnicalDetails } from './detailShared';
import {
  AsyncBoundary,
  errorMessage,
  fmtBytes,
  fmtDate,
  fmtDateTime,
  fmtTime,
  modalityLabel,
  titleCase,
  useAsync,
} from './viewerShared';

const PAGES = 2;

export function ViewFullReportScreen() {
  const navigation = useNavigation<any>();
  const { notifications } = useUnread();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'ViewFullReport'>>();
  const reportId = params.reportId;

  const state = useAsync<ImagingReport>(() => fetchImagingReport(reportId), [reportId]);
  const [page, setPage] = useState(1);
  const [fit, setFit] = useState(false);
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Mints a real signed link, then hands it to the OS. */
  const deliver = async (report: ImagingReport, mode: 'download' | 'share') => {
    setBusy(mode);
    setNotice(null);
    try {
      const link = await shareImagingStudy(report.study_id, {
        format: 'report',
        include_images: false,
        include_report: true,
      });

      // The server mints a host-relative signed path; join it to the API base
      // this client is actually talking to.
      const url = absoluteApiUrl(link.share_url);

      if (mode === 'download') {
        const opened = await Linking.canOpenURL(url);
        if (!opened) throw new Error(t('imaging.fullReport.cannotOpen'));
        await Linking.openURL(url);
        setNotice(
          t('imaging.fullReport.openingNotice', {
            number: report.report_number,
            minutes: link.expires_in_minutes,
          })
        );
      } else {
        await Share.share({
          title: `${report.study_name} — ${report.report_number}`,
          message: `${report.study_name} report (${report.report_number}): ${url}`,
          url,
        });
        setNotice(
          t('imaging.fullReport.sharedNotice', { when: fmtDateTime(link.expires_at) })
        );
      }
    } catch (e) {
      setNotice(errorMessage(e, t('imaging.fullReport.linkFailed')));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('imaging.fullReport.title')}
        align="center"
        actions={[
          { icon: 'bell', badge: notifications, onPress: () => navigation.navigate('Notifications') },
          { icon: 'more-vertical', onPress: () => navigation.navigate('ImagingResults') },
        ]}
      />

      <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel={t('imaging.fullReport.loading')}>
        {(report) => (
          <>
            {/* ── Document bar ───────────────────────────────────────── */}
            <View style={styles.bar}>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('imaging.fullReport.close')}
              >
                <Icon name="close" size={24} color={colors.link} strokeWidth={2.2} />
              </TouchableOpacity>
              <Text style={styles.barTitle}>{t('imaging.fullReport.barTitle')}</Text>
              <View style={styles.barActions}>
                <TouchableOpacity
                  onPress={() => deliver(report, 'download')}
                  disabled={busy !== null}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('imaging.fullReport.downloadA11y')}
                >
                  {busy === 'download' ? (
                    <ActivityIndicator color={colors.link} />
                  ) : (
                    <Icon name="download" size={22} color={colors.link} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => deliver(report, 'share')}
                  disabled={busy !== null}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('imaging.fullReport.shareA11y')}
                >
                  {busy === 'share' ? (
                    <ActivityIndicator color={colors.link} />
                  ) : (
                    <Icon name="share" size={22} color={colors.link} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
              {/* ── File header ──────────────────────────────────────── */}
              <View style={styles.fileRow}>
                <View style={styles.fileIcon}>
                  <Icon name="document-text" size={22} color={colors.statusCritical} />
                  <Text style={styles.fileIconText}>PDF</Text>
                </View>
                <View style={styles.fileBody}>
                  <Text style={styles.fileTitle}>{t('imaging.fullReport.fileTitle')}</Text>
                  <Text style={styles.fileNumber}>{report.report_number}</Text>
                  <Text style={styles.fileMeta}>
                    {fmtBytes(report.file_size)} • {fmtDate(report.reported_at ?? report.studied_at)}
                  </Text>
                </View>
                <View style={styles.pagePill}>
                  <Text style={styles.pagePillText}>
                    {t('imaging.fullReport.pageOf', { page, total: PAGES })}
                  </Text>
                </View>
              </View>

              {!!notice && (
                <View style={styles.notice}>
                  <Icon name="info" size={18} color={colors.statusPending} />
                  <Text style={styles.noticeText}>{notice}</Text>
                </View>
              )}

              {/* ── The page ─────────────────────────────────────────── */}
              <Card>
                <View style={fit ? styles.pageFit : undefined}>
                  {page === 1 ? (
                    <PageOne report={report} t={t} />
                  ) : (
                    <PageTwo report={report} t={t} />
                  )}
                  <Text style={styles.pageNumber}>
                    {t('imaging.fullReport.pageOf', { page, total: PAGES })}
                  </Text>
                </View>
              </Card>

              {/* ── Page thumbnails ──────────────────────────────────── */}
              <View style={styles.thumbs}>
                {[1, 2].map((n) => (
                  <TouchableOpacity
                    key={n}
                    activeOpacity={0.85}
                    onPress={() => setPage(n)}
                    style={[styles.thumb, page === n && styles.thumbOn]}
                    accessibilityRole="button"
                    accessibilityLabel={t('imaging.fullReport.goToPage', { page: n })}
                    accessibilityState={{ selected: page === n }}
                  >
                    <View style={[styles.thumbBadge, page === n && styles.thumbBadgeOn]}>
                      <Text style={[styles.thumbBadgeText, page === n && styles.thumbBadgeTextOn]}>{n}</Text>
                    </View>
                    <Text style={styles.thumbTitle} numberOfLines={1}>
                      {n === 1
                        ? t('imaging.fullReport.thumbPageOne')
                        : t('imaging.fullReport.thumbPageTwo')}
                    </Text>
                    <View style={styles.thumbLines}>
                      {Array.from({ length: n === 1 ? 7 : 4 }).map((_, i) => (
                        <View key={i} style={[styles.thumbLine, i % 3 === 0 && styles.thumbLineShort]} />
                      ))}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              {/* ── Pager ────────────────────────────────────────────── */}
              <View style={styles.pager}>
                <PagerButton
                  icon="chevron-left"
                  label={t('imaging.fullReport.previousPage')}
                  disabled={page === 1}
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                />
                <PagerButton
                  iconRight="chevron-right"
                  label={t('imaging.fullReport.nextPage')}
                  active
                  disabled={page === PAGES}
                  onPress={() => setPage((p) => Math.min(PAGES, p + 1))}
                />
                <PagerButton
                  icon="maximize"
                  label={
                    fit ? t('imaging.fullReport.actualSize') : t('imaging.fullReport.fitToScreen')
                  }
                  onPress={() => setFit((v) => !v)}
                />
              </View>
            </ScrollView>
          </>
        )}
      </AsyncBoundary>
    </View>
  );
}

// ── Pages ─────────────────────────────────────────────────────────────────

function PageOne({ report, t }: { report: ImagingReport; t: TFunction }) {
  return (
    <View style={styles.page}>
      {/* Letterhead */}
      <View style={styles.letterhead}>
        <Wordmark size="md" />
        <View style={styles.letterheadRight}>
          <Text style={styles.facility}>
            {report.facility_name ?? t('imaging.common.facilityFallback')}
          </Text>
          <Text style={styles.facilityLine}>{report.department}</Text>
          <Text style={styles.facilityLine}>{t('imaging.fullReport.postalAddress')}</Text>
          <Text style={styles.facilityLine}>{t('imaging.fullReport.telephone')}</Text>
        </View>
      </View>
      <View style={styles.rule} />

      <Text style={styles.docTitle}>
        {t('imaging.fullReport.docTitle', {
          scanType: modalityLabel(t, report.modality).toUpperCase(),
        })}
      </Text>

      {/* Patient / referrer */}
      <View style={styles.columns}>
        <View style={styles.column}>
          <Text style={styles.columnHead}>{t('imaging.fullReport.headPatient')}</Text>
          <Field
            label={t('imaging.fullReport.fieldPatientName')}
            value={report.patient_name ?? '—'}
            strong
          />
          <Field
            label={t('imaging.fullReport.fieldPatientId')}
            value={report.patient_number ?? '—'}
          />
          <Field
            label={t('imaging.fullReport.fieldAgeGender')}
            value={
              report.patient_age != null
                ? t('imaging.viewer.ageSex', {
                    age: report.patient_age,
                    sex: titleCase(report.patient_gender ?? '—'),
                  })
                : titleCase(report.patient_gender ?? '—')
            }
          />
          <Field
            label={t('imaging.fullReport.fieldPhone')}
            value={report.patient_phone ?? '—'}
          />
        </View>
        <View style={styles.columnEdge} />
        <View style={styles.column}>
          <Text style={styles.columnHead}>{t('imaging.fullReport.headReferrer')}</Text>
          <Field
            label={t('imaging.fullReport.fieldReferringDoctor')}
            value={report.referring_doctor ?? '—'}
            strong
          />
          <Field label={t('imaging.fullReport.fieldBodyPart')} value={report.body_part} />
          <Field
            label={t('imaging.fullReport.fieldFacility')}
            value={report.facility_name ?? '—'}
          />
        </View>
      </View>
      <View style={styles.rule} />

      {/* Acquisition strip */}
      <View style={styles.stampRow}>
        <Stamp
          icon="calendar"
          label={t('imaging.fullReport.stampStudyDate')}
          value={fmtDate(report.studied_at)}
        />
        <Stamp
          icon="clock"
          label={t('imaging.fullReport.stampStudyTime')}
          value={fmtTime(report.studied_at)}
        />
        <Stamp
          icon="calendar-check"
          label={t('imaging.fullReport.stampReportedOn')}
          value={fmtDateTime(report.reported_at)}
        />
        <Stamp
          icon="check-circle"
          label={t('imaging.fullReport.stampReportStatus')}
          value={titleCase(report.report_status)}
        />
      </View>
      <View style={styles.rule} />

      <View style={styles.stampRow}>
        <Stamp
          icon="person"
          label={t('imaging.fullReport.stampRadiologist')}
          value={report.radiologist ?? '—'}
          extra={[report.radiologist_title, report.radiologist_registration]}
        />
        <Stamp
          icon="clipboard"
          label={t('imaging.fullReport.stampReportNumber')}
          value={report.report_number}
        />
      </View>
      <View style={styles.rule} />

      {/* Body */}
      {!!report.clinical_indication && (
        <Block title={t('imaging.fullReport.blockIndication')}>
          <Text style={styles.body}>{report.clinical_indication}</Text>
        </Block>
      )}

      <Block title={t('imaging.fullReport.blockFindings')}>
        {report.finding_lines.length ? (
          report.finding_lines.map((line, i) => (
            <View key={i} style={styles.bullet}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.body}>{line}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.body}>{t('imaging.fullReport.noFindings')}</Text>
        )}
      </Block>

      <Block title={t('imaging.fullReport.blockImpression')}>
        {report.impression_lines.length ? (
          report.impression_lines.map((line, i) => (
            <Text key={i} style={styles.body}>
              {line}
            </Text>
          ))
        ) : (
          <Text style={styles.body}>—</Text>
        )}
      </Block>

      {!!report.recommendation && (
        <Block title={t('imaging.fullReport.blockRecommendation')}>
          <Text style={styles.body}>{report.recommendation}</Text>
        </Block>
      )}

      <View style={styles.rule} />

      {/* Signature */}
      <View style={styles.signRow}>
        <View style={styles.signBlock}>
          <View style={styles.signHead}>
            <Icon name="shield-check" size={20} color={colors.statusNormal} />
            <Text style={styles.signTitle}>
              {report.digitally_signed
                ? t('imaging.report.digitallySigned')
                : t('imaging.fullReport.preliminary')}
            </Text>
          </View>
          <Text style={styles.signBody}>
            {report.digitally_signed
              ? t('imaging.fullReport.signedBody')
              : t('imaging.fullReport.unsignedBody')}
          </Text>
        </View>
        <View style={styles.signName}>
          <Text style={styles.signNameText}>{report.radiologist ?? '—'}</Text>
          <Text style={styles.signNameSub}>{report.radiologist_title ?? '—'}</Text>
          <Text style={styles.signNameSub}>{report.radiologist_registration ?? '—'}</Text>
          <Text style={styles.signNameSub}>{fmtDateTime(report.reported_at)}</Text>
        </View>
      </View>

      <Text style={styles.footer}>
        {t('imaging.fullReport.footer', { department: report.department })}
      </Text>
    </View>
  );
}

function PageTwo({ report, t }: { report: ImagingReport; t: TFunction }) {
  return (
    <View style={styles.page}>
      <Block title={t('imaging.fullReport.blockAdditional')}>
        <View style={styles.bullet}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.body}>
            {t('imaging.fullReport.additionalScanType', {
              scanType: modalityLabel(t, report.modality),
              bodyPart: report.body_part,
            })}
          </Text>
        </View>
        <View style={styles.bullet}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.body}>{t('imaging.fullReport.additionalNoPriors')}</Text>
        </View>
        <TechnicalDetails
          facts={[
            { label: t('imaging.tech.studyUid'), value: report.study_uid },
            { label: t('imaging.tech.accessionNumber'), value: report.accession_number },
          ]}
        />
      </Block>

      <Block title={t('imaging.fullReport.blockDisclaimer')}>
        <View style={styles.bullet}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.body}>{t('imaging.fullReport.disclaimerBasis')}</Text>
        </View>
        <View style={styles.bullet}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.body}>{t('imaging.fullReport.disclaimerCorrelation')}</Text>
        </View>
        <View style={styles.bullet}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.body}>
            {t('imaging.fullReport.disclaimerContact', { department: report.department })}
          </Text>
        </View>
      </Block>

      <View style={styles.rule} />
      <Text style={styles.endMark}>{t('imaging.fullReport.endMark')}</Text>
    </View>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.fieldColon}>:</Text>
      <Text style={[styles.fieldValue, strong && styles.fieldValueStrong]}>{value}</Text>
    </View>
  );
}

function Stamp({
  icon,
  label,
  value,
  extra,
}: {
  icon: 'calendar' | 'clock' | 'calendar-check' | 'check-circle' | 'person' | 'clipboard';
  label: string;
  value: string;
  extra?: (string | null)[];
}) {
  return (
    <View style={styles.stamp}>
      <Icon name={icon} size={20} color={colors.blue} />
      <View style={styles.stampBody}>
        <Text style={styles.stampLabel}>{label}</Text>
        <Text style={styles.stampValue}>{value}</Text>
        {extra
          ?.filter((e): e is string => !!e)
          .map((e) => (
            <Text key={e} style={styles.stampExtra}>
              {e}
            </Text>
          ))}
      </View>
    </View>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      <View style={styles.blockBody}>{children}</View>
    </View>
  );
}

function PagerButton({
  icon,
  iconRight,
  label,
  active,
  disabled,
  onPress,
}: {
  icon?: 'chevron-left' | 'maximize';
  iconRight?: 'chevron-right';
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const fg = disabled ? colors.textMuted : active ? colors.link : colors.textSecondary;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      style={[styles.pagerButton, active && !disabled && styles.pagerButtonOn]}
    >
      {!!icon && <Icon name={icon} size={18} color={fg} />}
      <Text style={[styles.pagerText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
      {!!iconRight && <Icon name={iconRight} size={18} color={fg} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  barTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  barActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: spacing.sm + 4,
  },
  fileIcon: {
    width: 46,
    height: 52,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  fileIconText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 9,
    color: colors.statusCritical,
  },
  fileBody: { flex: 1, minWidth: 0 },
  fileTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  fileNumber: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  fileMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  pagePill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pagePillText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },

  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.statusPendingBg,
    borderRadius: radii.md,
    padding: spacing.sm + 4,
  },
  noticeText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  page: { gap: spacing.sm + 2 },
  pageFit: { transform: [{ scale: 0.9 }] },
  letterhead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  letterheadRight: { flex: 1, alignItems: 'flex-end' },
  facility: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    textAlign: 'right',
  },
  facilityLine: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  rule: { height: 1, backgroundColor: colors.border },
  docTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.md,
    letterSpacing: 0.6,
    color: colors.textPrimary,
    textAlign: 'center',
  },

  columns: { flexDirection: 'row', gap: spacing.sm },
  column: { flex: 1, minWidth: 0, gap: 3 },
  columnEdge: { width: 1, backgroundColor: colors.border },
  columnHead: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.link,
    marginBottom: 3,
  },
  field: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  fieldLabel: {
    width: 86,
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  fieldColon: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  fieldValue: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textPrimary,
  },
  fieldValueStrong: { fontFamily: typography.fontFamily.semiBold },

  stampRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stamp: { flexGrow: 1, flexBasis: '45%', flexDirection: 'row', gap: 6 },
  stampBody: { flex: 1, minWidth: 0 },
  stampLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.link,
  },
  stampValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 12,
    color: colors.textPrimary,
  },
  stampExtra: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },

  block: { gap: 4 },
  blockTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.link,
  },
  blockBody: { gap: 3 },
  bullet: { flexDirection: 'row', gap: 6 },
  bulletDot: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  body: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textPrimary,
  },

  signRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  signBlock: { flex: 1, minWidth: 0, gap: 3 },
  signHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  signTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.statusNormal,
  },
  signBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  signName: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  signNameText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    textAlign: 'right',
  },
  signNameSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'right',
  },

  footer: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textMuted,
    textAlign: 'center',
  },
  endMark: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  pageNumber: {
    marginTop: spacing.sm,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'right',
  },

  thumbs: { flexDirection: 'row', gap: spacing.sm + 2 },
  thumb: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm + 2,
    backgroundColor: colors.surface,
    padding: 10,
    gap: 6,
  },
  thumbOn: { borderColor: colors.blue, borderWidth: 2 },
  thumbBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbBadgeOn: { backgroundColor: colors.blue },
  thumbBadgeText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 11,
    color: colors.textSecondary,
  },
  thumbBadgeTextOn: { color: colors.textOnBrand },
  thumbTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 11,
    color: colors.textPrimary,
  },
  thumbLines: { gap: 4 },
  thumbLine: { height: 3, borderRadius: 2, backgroundColor: colors.divider },
  thumbLineShort: { width: '60%' },

  pager: { flexDirection: 'row', gap: spacing.sm },
  pagerButton: {
    flex: 1,
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
  pagerButtonOn: { borderColor: colors.blue },
  pagerText: { fontFamily: typography.fontFamily.semiBold, fontSize: 13 },
});
