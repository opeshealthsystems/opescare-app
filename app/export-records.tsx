import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardStack,
  GradientButton,
  Icon,
  ListRow,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  formatDateTime,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import {
  extractApiErrorMessage,
  useExportMedicalRecordsFhir,
  useExportMedicalRecordsPdf,
} from '../lib/api/queries';
import { deliverFile, FileDeliveryError, type FileDeliveryOutcome } from '../lib/fileDelivery';
import '../lib/api/importRecordsQueries';

/**
 * Export Medical Records — the patient's immediate, unmoderated copy of their
 * own record, in the two formats the API produces:
 *   POST /mobile/medical-records/export/pdf  → base64 PDF (human-readable)
 *   POST /mobile/medical-records/export/fhir → a bare FHIR R4 Bundle (machine)
 *
 * Both endpoints are POST, rate-limited and audit-logged server-side, and both
 * take an empty body.
 *
 * **Delivering the file is `lib/fileDelivery.ts`, not this screen.** This
 * screen used to write to `FileSystem.documentDirectory` and open the OS share
 * sheet unconditionally. Neither exists on the web build, so on
 * finder.opescare.cloud every export threw at the save step and was reported
 * as a failure — while the API had answered 200 with a valid PDF. On a screen
 * that promises "no approval, no waiting" and cites the patient's legal right
 * to their record, that is a false negative about a legal right, not a cosmetic
 * bug. `deliverFile` now downloads on web and keeps the write + share sheet on
 * native, and returns WHICH of those happened so the dialog can say it.
 *
 * Distinct from app/privacy/export.tsx, which is the *moderated* export a
 * compliance officer approves — the two are cross-linked below so the
 * difference is legible rather than confusing. The moderated request list, its
 * creation and its download live on that screen and are deliberately not
 * duplicated here.
 *
 * Presentation: `ScreenHeader`, an inline rights notice, the "what's included"
 * checklist and the two formats as `Card variant="flush"` + `ListRow`s, one
 * `GradientButton` for the chosen format, a summary `Card` for the copy this
 * session produced, and the kit `Dialog` for success and failure —
 * `Alert.alert` is a no-op on React Native Web, which would leave a failed
 * export looking like a successful one.
 *
 * **The "what's included" rows are a manifest, not a filter.** The endpoints
 * accept no scope parameters, so rendering them as switches would offer a
 * choice the API cannot honour. They are read-only, ticked rows.
 *
 * The kit has no `file-code` glyph, so FHIR uses `columns` (a structured
 * document) against the PDF's `document-text`.
 */

type ExportFormat = 'pdf' | 'fhir';

interface FormatSpec {
  key: ExportFormat;
  icon: IconName;
  tint: Tint;
  titleKey: string;
  bodyKey: string;
  audienceKey: string;
  actionKey: string;
}

const FORMATS: FormatSpec[] = [
  {
    key: 'pdf',
    icon: 'document-text',
    tint: 'blue',
    titleKey: 'exportRecords.pdfTitle',
    bodyKey: 'exportRecords.pdfBody',
    audienceKey: 'exportRecords.pdfAudience',
    actionKey: 'exportRecords.pdfAction',
  },
  {
    key: 'fhir',
    icon: 'columns',
    tint: 'purple',
    titleKey: 'exportRecords.fhirTitle',
    bodyKey: 'exportRecords.fhirBody',
    audienceKey: 'exportRecords.fhirAudience',
    actionKey: 'exportRecords.fhirAction',
  },
];

const INCLUDED: { icon: IconName; tint: Tint; labelKey: string }[] = [
  { icon: 'person', tint: 'blue', labelKey: 'exportRecords.includedProfile' },
  { icon: 'alert-triangle', tint: 'amber', labelKey: 'exportRecords.includedAllergies' },
  { icon: 'stethoscope', tint: 'purple', labelKey: 'exportRecords.includedDiagnoses' },
  { icon: 'pill', tint: 'green', labelKey: 'exportRecords.includedMedications' },
  { icon: 'flask', tint: 'green', labelKey: 'exportRecords.includedLabs' },
  { icon: 'syringe', tint: 'blue', labelKey: 'exportRecords.includedImmunizations' },
];

/** The last export this session produced — the summary card's whole content. */
interface LastExport {
  format: ExportFormat;
  filename: string;
  at: Date;
  /** How the file actually reached the patient — never assumed, always reported. */
  outcome: FileDeliveryOutcome;
}

/** The success dialog title for each way a file can arrive. */
const OUTCOME_TITLE_KEY: Record<FileDeliveryOutcome, string> = {
  shared: 'exportRecords.exportReady',
  saved: 'exportRecords.savedOnly',
  downloaded: 'exportRecords.downloaded',
};

export default function ExportRecordsScreen() {
  usePrivateScreen();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [activeFormat, setActiveFormat] = useState<ExportFormat | null>(null);
  const [lastExport, setLastExport] = useState<LastExport | null>(null);

  const exportPdf = useExportMedicalRecordsPdf();
  const exportFhir = useExportMedicalRecordsFhir();

  const selected = FORMATS.find((entry) => entry.key === format) ?? FORMATS[0]!;
  const lastFormat = lastExport
    ? (FORMATS.find((entry) => entry.key === lastExport.format) ?? FORMATS[0]!)
    : null;

  /**
   * Reports an export that actually reached the patient. `outcome` comes back
   * from `deliverFile`, so the wording matches what happened — a browser
   * download, a share sheet, or a file left on the device — instead of one
   * optimistic sentence covering all three.
   */
  const announceDelivered = (
    kind: ExportFormat,
    filename: string,
    outcome: FileDeliveryOutcome,
  ) => {
    setLastExport({ format: kind, filename, at: new Date(), outcome });
    dialog.show({
      title: t(OUTCOME_TITLE_KEY[outcome], { filename }),
      // An exported copy leaves OpesCare's consent rules behind. The patient
      // is told that at the moment the file exists, not only in fine print.
      message: t('exportRecords.privacyNote'),
      tone: 'success',
    });
  };

  const handleExport = async (kind: ExportFormat) => {
    if (activeFormat) return;
    setActiveFormat(kind);
    try {
      if (kind === 'pdf') {
        const result = await exportPdf.mutateAsync();
        const outcome = await deliverFile({
          filename: result.filename,
          mimeType: result.mime_type,
          data: result.file_base64,
          encoding: 'base64',
          uti: 'com.adobe.pdf',
          shareTitle: t('exportRecords.shareTitle'),
        });
        announceDelivered(kind, result.filename, outcome);
      } else {
        // The FHIR endpoint returns the Bundle itself, not a wrapper, so it is
        // delivered verbatim and stays a valid FHIR document.
        const bundle = await exportFhir.mutateAsync();
        const filename = `medical-record-fhir-${Date.now()}.json`;
        const outcome = await deliverFile({
          filename,
          mimeType: 'application/fhir+json',
          data: JSON.stringify(bundle, null, 2),
          encoding: 'utf8',
          uti: 'public.json',
          shareTitle: t('exportRecords.shareTitle'),
        });
        announceDelivered(kind, filename, outcome);
      }
    } catch (err) {
      // Two different failures, two different sentences: the API refused, or
      // the file was produced and this device could not take it. Neither is
      // ever reported as a success.
      dialog.alert(
        t('exportRecords.title'),
        err instanceof FileDeliveryError
          ? t('exportRecords.deliveryFailed')
          : extractApiErrorMessage(err),
        'critical',
      );
    } finally {
      setActiveFormat(null);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader
        title={t('exportRecords.title')}
        subtitle={t('exportRecords.subtitle')}
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Cameroon Law No. 2010/012 — the right this screen exercises. */}
        <Notice
          tone="pending"
          icon="book"
          title={t('exportRecords.rightsTitle')}
          text={t('exportRecords.rightsBody')}
        />

        {/* ── What's included — a manifest, not a filter ────────────────── */}
        <View>
          <SectionHeader title={t('exportRecords.includedTitle')} variant="overline" />
          <Card variant="flush">
            {INCLUDED.map((row, index) => (
              <ListRow
                key={row.labelKey}
                icon={row.icon}
                tint={row.tint}
                title={t(row.labelKey)}
                chevron={false}
                divider={index < INCLUDED.length - 1}
                trailing={<Icon name="check" size={18} color={colors.statusNormal} />}
              />
            ))}
          </Card>
        </View>

        {/* ── Choose a format ──────────────────────────────────────────── */}
        <View>
          <SectionHeader title={t('exportRecords.formatTitle')} variant="overline" />
          <Text style={styles.hint}>{t('exportRecords.formatHint')}</Text>
          <Card variant="flush">
            {FORMATS.map((entry, index) => (
              <ListRow
                key={entry.key}
                icon={entry.icon}
                tint={entry.tint}
                title={t(entry.titleKey)}
                subtitle={t(entry.bodyKey)}
                onPress={() => setFormat(entry.key)}
                chevron={false}
                divider={index < FORMATS.length - 1}
                accessibilityLabel={`${t(entry.titleKey)}. ${t(entry.bodyKey)}`}
                accessibilityHint={t(entry.audienceKey)}
                trailing={
                  <View style={[styles.radio, format === entry.key && styles.radioOn]}>
                    {format === entry.key ? (
                      <Icon name="check" size={13} color={colors.textOnBrand} />
                    ) : null}
                  </View>
                }
              />
            ))}
          </Card>

          <Card style={styles.audienceCard}>
            <View style={styles.audienceRow}>
              <View style={styles.circle}>
                <Icon name={selected.icon} size={26} color={tintMap[selected.tint].fg} />
              </View>
              <Text style={styles.audienceText}>{t(selected.audienceKey)}</Text>
            </View>
          </Card>

          <GradientButton
            label={activeFormat ? t('exportRecords.generating') : t(selected.actionKey)}
            onPress={() => void handleExport(selected.key)}
            loading={activeFormat !== null}
            icon="none"
            style={styles.exportButton}
            accessibilityHint={t(selected.audienceKey)}
          />
        </View>

        {/* ── The copy this session produced ───────────────────────────── */}
        {lastExport && lastFormat ? (
          <View>
            <SectionHeader title={t('records.export')} variant="overline" />
            <Card variant="flush">
              <ListRow
                icon="download"
                tint="green"
                title={lastExport.filename}
                meta={[t(lastFormat.titleKey), formatDateTime(lastExport.at)]}
                chevron={false}
                trailing={
                  <StatusBadge
                    status="completed"
                    tone="normal"
                    label={t('opesCore.common.complete')}
                    icon="check-circle"
                    size="sm"
                  />
                }
              />
            </Card>
            {lastExport.outcome === 'shared' ? null : (
              <Text style={styles.caption}>
                {t(OUTCOME_TITLE_KEY[lastExport.outcome], { filename: lastExport.filename })}
              </Text>
            )}
          </View>
        ) : null}

        {/* Once it leaves the app, the patient is its guardian — kept verbatim. */}
        <Notice
          tone="warning"
          icon="shield-check"
          title={t('exportRecords.privacyNoteTitle')}
          text={t('exportRecords.privacyNote')}
        />

        {/* ── Where the neighbouring rights live ───────────────────────── */}
        <View>
          <SectionHeader title={t('exportRecords.relatedTitle')} variant="overline" />
          <CardStack spacing="sm">
            <Card variant="flush">
              <ListRow
                icon="history"
                tint="blue"
                title={t('exportRecords.relatedLogsTitle')}
                subtitle={t('exportRecords.relatedLogsBody')}
                onPress={() => router.push('/privacy/access-logs')}
              />
            </Card>
            <Card variant="flush">
              <ListRow
                icon="upload"
                tint="blue"
                title={t('importRecords.title')}
                subtitle={t('importRecords.subtitle')}
                onPress={() => router.push('/import-records')}
              />
            </Card>
            <Card variant="flush">
              <ListRow
                icon="shield-check"
                tint="purple"
                title={t('exportRecords.relatedRequestTitle')}
                subtitle={t('exportRecords.relatedRequestBody')}
                onPress={() => router.push('/privacy/export')}
              />
            </Card>
          </CardStack>
        </View>
      </ScrollView>

      {dialog.element}
    </SafeAreaView>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** Tinted inline notice: icon in a surface circle, title, body. */
function Notice({
  tone,
  icon,
  title,
  text,
}: {
  tone: StatusTone;
  icon: IconName;
  title: string;
  text: string;
}) {
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const skin = statusMap[tone];
  return (
    <View
      style={[styles.notice, { backgroundColor: skin.bg }]}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.noticeIcon}>
        <Icon name={icon} size={24} color={skin.fg} />
      </View>
      <View style={styles.noticeBody}>
        <Text style={[styles.noticeTitle, { color: skin.fg }]}>{title}</Text>
        <Text style={styles.noticeText}>{text}</Text>
      </View>
    </View>
  );
}

// ── Styles (colour-dependent, built per palette) ───────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl },

    hint: {
      marginTop: -spacing.xs,
      marginBottom: spacing.sm,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    caption: {
      marginTop: spacing.sm,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },

    circle: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },

    radio: {
      width: 22,
      height: 22,
      borderRadius: radii.pill,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOn: { borderColor: colors.blue, backgroundColor: colors.blue },

    audienceCard: { marginTop: spacing.sm + 4 },
    audienceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
    audienceText: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
    exportButton: { marginTop: spacing.md },

    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 4,
      padding: spacing.md,
      borderRadius: radii.md,
    },
    noticeIcon: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noticeBody: { flex: 1, minWidth: 0, gap: 2 },
    noticeTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },
    noticeText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
  });
