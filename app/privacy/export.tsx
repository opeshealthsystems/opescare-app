import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Chip,
  EmptyState,
  formatDate,
  formatDateTime,
  formatLabel,
  GradientButton,
  Icon,
  ListRow,
  PillInput,
  radii,
  ScreenHeader,
  SectionHeader,
  spacing,
  StatusBadge,
  typography,
  useDialog,
  useTheme,
  type DialogController,
  type IconName,
  type Palette,
  type StatusTone,
  type Tint,
} from '@/components/opes-ui';
import {
  type CorrectionRequestItem,
  type DataExportRequestItem,
  type DataExportType,
  extractApiErrorMessage,
  useCreateCorrectionRequest,
  useCreateDataExportRequest,
  useDataExportRequests,
  useDownloadDataExport,
} from '../../lib/api/queries';
import { deliverFile } from '../../lib/fileDelivery';

/**
 * Data export & corrections — the two data rights that go through review.
 *
 * The moderated part is the point: a data-export request is created `pending`
 * and stays undownloadable until a compliance officer approves it, at which
 * point it is valid for 24 hours and exactly one download (the server flips it
 * to `downloaded` and refuses a second). The API answers a premature download
 * with 403, so every state carries its own plain-language explanation and the
 * download button only exists while it can actually succeed — a 403 should
 * never be something the patient has to interpret.
 *
 * This is the compliance-approved flow. `app/export-records.tsx` is the
 * separate quick export, and the empty state here says so, verbatim.
 *
 * Presentation is the OPES kit — `ScreenHeader`, overline `SectionHeader`s,
 * `Chip` choices, `Card variant="flush"` + `ListRow` for each request with a
 * `StatusBadge`, `GradientButton` for the two submissions, `EmptyState` when
 * there is nothing to list. Colours are the platform's own, read from
 * `useTheme()`; nothing here names one.
 *
 * Confirmations go through the kit `Dialog`, never `Alert.alert`, which is a
 * silent no-op on React Native Web — a confirm built on it never fires in a
 * browser. Each confirm repeats the copy that governs the action: the export
 * confirm repeats the three review steps, the download confirm repeats the
 * one-download / 24-hour rule, and the correction confirm repeats the promise
 * that clinical entries are never quietly overwritten. Results stay as
 * in-screen notices, which are readable on every platform.
 *
 * Glyph substitutions, the kit carrying its own outline set: `Scale` → `book`,
 * `Hourglass` → `clock`, `Ban` → `x-circle`, `CircleCheck` → `check-circle`,
 * `CircleAlert` → `alert-circle`, `Inbox` → `folder`, `FileSearch` →
 * `document-text`, `PenLine` → `edit`, `CalendarClock` → `calendar`.
 */

const EXPORT_TYPES: DataExportType[] = [
  'full_record',
  'encounters',
  'prescriptions',
  'lab_results',
  'imaging',
];
const RECORD_TYPES = [
  'clinical_note',
  'diagnosis',
  'allergy',
  'prescription',
  'lab_result',
  'immunization',
  'other',
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_MIN = 10;
const REASON_MAX = 2000;

const EXPORT_TYPE_ICON: Record<DataExportType, IconName> = {
  full_record: 'folder',
  encounters: 'stethoscope',
  prescriptions: 'pill',
  lab_results: 'flask',
  imaging: 'image',
};

/** Status → how it looks and what it means. Mirrors DataExportService. */
const EXPORT_STATUS: Record<string, { tone: StatusTone; icon: IconName; tint: Tint }> = {
  pending: { tone: 'warning', icon: 'clock', tint: 'amber' },
  approved: { tone: 'normal', icon: 'check-circle', tint: 'green' },
  downloaded: { tone: 'neutral', icon: 'download', tint: 'blue' },
  rejected: { tone: 'critical', icon: 'x-circle', tint: 'red' },
  expired: { tone: 'neutral', icon: 'x-circle', tint: 'purple' },
};

const FALLBACK_STATUS: { tone: StatusTone; icon: IconName; tint: Tint } = {
  tone: 'warning',
  icon: 'clock',
  tint: 'amber',
};

type ScreenNotice = { tone: StatusTone; icon: IconName; body: string };

export default function PrivacyExportScreen() {
  usePrivateScreen();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // One controller for the whole screen, rendered once at the root — a sheet
  // opened from either section lands in the same place.
  const dialog = useDialog();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/privacy');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader
        title={t('privacy.exportTitle')}
        subtitle={t('privacy.exportPageSubtitle')}
        onBack={goBack}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* The law, named. Kept verbatim. */}
        <Notice
          tone="pending"
          icon="book"
          title={t('privacy.rightsTitle')}
          body={t('privacy.exportRightsBody')}
        />

        <ExportSection dialog={dialog} />

        <View style={styles.sectionDivider} />

        <CorrectionSection dialog={dialog} />
      </ScrollView>

      {dialog.element}
    </SafeAreaView>
  );
}

// ── Export ──────────────────────────────────────────────────────────────────

function ExportSection({ dialog }: { dialog: DialogController }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [selectedType, setSelectedType] = useState<DataExportType>('full_record');
  const [notice, setNotice] = useState<ScreenNotice | null>(null);

  const requestsQuery = useDataExportRequests();
  const createMutation = useCreateDataExportRequest();
  const downloadMutation = useDownloadDataExport();

  const requests = requestsQuery.data ?? [];

  const runRequest = () =>
    new Promise<void>((resolve) => {
      createMutation.mutate(selectedType, {
        onSuccess: () => {
          setNotice({ tone: 'normal', icon: 'check-circle', body: t('privacy.exportRequested') });
          resolve();
        },
        onError: (err) => {
          setNotice({ tone: 'critical', icon: 'alert-circle', body: extractApiErrorMessage(err) });
          resolve();
        },
      });
    });

  /**
   * The request confirm repeats the three review steps verbatim, so the
   * patient reads what "request" actually starts before they start it:
   * nothing is released yet, a compliance officer decides, and once approved
   * the window is 24 hours and one download.
   */
  const confirmRequest = () => {
    setNotice(null);
    dialog.confirm({
      title: t('privacy.requestExport'),
      message: [
        t(`privacy.exportTypeDesc.${selectedType}`),
        t('privacy.step1'),
        t('privacy.step2'),
        t('privacy.step3'),
      ].join('\n\n'),
      confirmLabel: t('privacy.requestExport'),
      cancelLabel: t('privacy.cancel'),
      onConfirm: () => runRequest(),
    });
  };

  const runDownload = (item: DataExportRequestItem) =>
    new Promise<void>((resolve) => {
      downloadMutation.mutate(item.id, {
        onSuccess: async (result) => {
          const filename = `opescare-export-${result.export_type}-${result.id}.json`;
          try {
            // `deliverFile` downloads in the browser and writes + shares on
            // native. Before it existed this ran the native path everywhere, so
            // on the web build the save threw — and because the server has
            // ALREADY flipped this request to `downloaded` by then, the patient
            // permanently spent their one collection and received nothing.
            const outcome = await deliverFile({
              filename,
              mimeType: 'application/json',
              data: JSON.stringify(result.content, null, 2),
              encoding: 'utf8',
              uti: 'public.json',
              shareTitle: t('privacy.downloadShareTitle'),
            });
            setNotice({
              tone: 'normal',
              icon: 'check-circle',
              body:
                outcome === 'saved'
                  ? t('privacy.downloadSavedOnly', { filename })
                  : t('privacy.downloadedSuccess'),
            });
          } catch {
            // The payload arrived; only the save/share step failed.
            setNotice({
              tone: 'critical',
              icon: 'alert-circle',
              body: t('privacy.downloadSaveFailed'),
            });
          }
          resolve();
        },
        onError: (err) => {
          // The API answers a download that isn't (or is no longer) collectable
          // with 403 and an English-only message — "Export is not approved." /
          // "Export download link has expired." Neither should reach the
          // patient as a raw error: it means the request has moved on, so the
          // list is refreshed and the state is explained in their own language.
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (status === 403) {
            requestsQuery.refetch();
            setNotice({ tone: 'warning', icon: 'clock', body: t('privacy.downloadNotReady') });
            resolve();
            return;
          }
          setNotice({ tone: 'critical', icon: 'alert-circle', body: extractApiErrorMessage(err) });
          resolve();
        },
      });
    });

  /** One download, one chance — the confirm says so in the API's own words. */
  const confirmDownload = (item: DataExportRequestItem) => {
    setNotice(null);
    dialog.confirm({
      title: t('privacy.download'),
      message: t('privacy.exportStatusHelp.approved'),
      confirmLabel: t('privacy.download'),
      cancelLabel: t('privacy.cancel'),
      onConfirm: () => runDownload(item),
    });
  };

  return (
    <View style={styles.section}>
      <View>
        <SectionHeader title={t('privacy.exportSectionTitle')} variant="overline" />
        <Text style={styles.sectionHint}>{t('privacy.exportSectionSubtitle')}</Text>
      </View>

      {/* What to include */}
      <View>
        <Text style={styles.fieldLabel}>{t('privacy.exportTypeLabel')}</Text>
        <View style={styles.chips}>
          {EXPORT_TYPES.map((type) => (
            <Chip
              key={type}
              label={t(`privacy.exportType.${type}`)}
              icon={EXPORT_TYPE_ICON[type]}
              selected={type === selectedType}
              onPress={() => setSelectedType(type)}
            />
          ))}
        </View>
        <Text style={styles.fieldHint}>{t(`privacy.exportTypeDesc.${selectedType}`)}</Text>
      </View>

      {/* What actually happens after you tap request. */}
      <View>
        <SectionHeader title={t('privacy.howItWorks')} variant="overline" />
        <Card variant="flush">
          <StepRow index={1} label={t('privacy.step1')} divider />
          <StepRow index={2} label={t('privacy.step2')} divider />
          <StepRow index={3} label={t('privacy.step3')} />
        </Card>
      </View>

      <GradientButton
        label={t('privacy.requestExport')}
        onPress={confirmRequest}
        loading={createMutation.isPending}
        icon="none"
        accessibilityHint={t('privacy.exportSectionSubtitle')}
      />

      {notice ? <Notice tone={notice.tone} icon={notice.icon} body={notice.body} /> : null}

      {/* ── My requests ─────────────────────────────────────────────────── */}
      <View>
        <SectionHeader title={t('privacy.myRequests')} variant="overline" />

        {requestsQuery.isLoading ? (
          <Card>
            <View style={styles.loading} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.blue} />
            </View>
          </Card>
        ) : requestsQuery.isError ? (
          <Card variant="flush">
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('privacy.myRequestsError')}
              actionLabel={t('privacy.retry')}
              onAction={() => requestsQuery.refetch()}
            />
          </Card>
        ) : requests.length === 0 ? (
          <Card variant="flush">
            <EmptyState
              icon="folder"
              tint="blue"
              title={t('privacy.noExportRequestsTitle')}
              message={t('privacy.noExportRequests')}
            />
          </Card>
        ) : (
          <View style={styles.stack}>
            {requests.map((item) => (
              <ExportRequestCard
                key={item.id}
                item={item}
                downloading={downloadMutation.isPending && downloadMutation.variables === item.id}
                onDownload={() => confirmDownload(item)}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

/** One numbered step of the review flow. */
function StepRow({
  index,
  label,
  divider,
}: {
  index: number;
  label: string;
  divider?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <ListRow
      leading={
        <View style={styles.stepMark}>
          <Text style={styles.stepNumber}>{String(index)}</Text>
        </View>
      }
      title={label}
      chevron={false}
      divider={divider}
    />
  );
}

/**
 * One export request: what was asked for, when, where it has got to, what that
 * means in words, and — only while it can actually succeed — the download.
 */
function ExportRequestCard({
  item,
  downloading,
  onDownload,
}: {
  item: DataExportRequestItem;
  downloading: boolean;
  onDownload: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const meta = EXPORT_STATUS[item.status] ?? FALLBACK_STATUS;

  const created = new Date(item.created_at);
  const createdValid = !Number.isNaN(created.getTime());
  const expires = item.expires_at ? new Date(item.expires_at) : null;
  const expiresValid = !!expires && !Number.isNaN(expires.getTime());

  const statusLabel = t(`privacy.exportStatus.${item.status}`, {
    defaultValue: formatLabel(item.status),
  });

  return (
    <Card variant="flush">
      <ListRow
        icon={meta.icon}
        tint={meta.tint}
        title={t(`privacy.exportType.${item.export_type}`, {
          defaultValue: formatLabel(item.export_type),
        })}
        meta={[createdValid ? t('privacy.requestedOn', { date: formatDate(created) }) : undefined]}
        chevron={false}
        divider
        trailing={
          <StatusBadge
            status={item.status}
            tone={meta.tone}
            label={statusLabel}
            icon={meta.icon}
            size="sm"
          />
        }
      />

      <View style={styles.detail}>
        {/* Every status says, in words, what it means for the patient — so a
            403 on a premature download is never something they walk into. */}
        <Text style={styles.detailValue}>
          {t(`privacy.exportStatusHelp.${item.status}`, {
            defaultValue: t('privacy.exportStatusHelp.pending'),
          })}
        </Text>

        {item.status === 'approved' ? (
          <>
            {expiresValid ? (
              <View style={styles.expiryRow}>
                <Icon name="calendar" size={14} color={colors.statusWarning} />
                <Text style={styles.expiryText}>
                  {t('privacy.downloadExpires', { date: formatDateTime(expires) })}
                </Text>
              </View>
            ) : null}
            <GradientButton
              label={t('privacy.download')}
              onPress={onDownload}
              loading={downloading}
              disabled={downloading}
              icon="none"
              accessibilityHint={t('privacy.exportStatusHelp.approved')}
            />
          </>
        ) : null}
      </View>
    </Card>
  );
}

// ── Corrections ─────────────────────────────────────────────────────────────

function CorrectionSection({ dialog }: { dialog: DialogController }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [recordType, setRecordType] = useState<string | null>(null);
  const [resourceId, setResourceId] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{
    recordType?: string;
    resourceId?: string;
    reason?: string;
  }>({});
  const [submitted, setSubmitted] = useState<CorrectionRequestItem | null>(null);
  const [notice, setNotice] = useState<ScreenNotice | null>(null);

  const createMutation = useCreateCorrectionRequest();

  const resetForm = () => {
    setRecordType(null);
    setResourceId('');
    setReason('');
    setErrors({});
    setSubmitted(null);
    setNotice(null);
  };

  const runSubmit = (payload: { resource_type: string; resource_id: string; reason: string }) =>
    new Promise<void>((resolve) => {
      createMutation.mutate(payload, {
        onSuccess: (item) => {
          setSubmitted(item);
          resolve();
        },
        onError: (err) => {
          setNotice({ tone: 'critical', icon: 'alert-circle', body: extractApiErrorMessage(err) });
          resolve();
        },
      });
    });

  const handleSubmit = () => {
    setNotice(null);
    const nextErrors: typeof errors = {};
    if (!recordType) nextErrors.recordType = t('privacy.errorSelectType');
    if (!UUID_RE.test(resourceId.trim())) nextErrors.resourceId = t('privacy.errorInvalidId');
    const trimmedReason = reason.trim();
    if (trimmedReason.length < REASON_MIN) nextErrors.reason = t('privacy.errorReasonTooShort');
    else if (trimmedReason.length > REASON_MAX) nextErrors.reason = t('privacy.errorReasonTooLong');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !recordType) return;

    // The confirm repeats the immutability promise verbatim: a correction is
    // recorded alongside the original, never over it.
    dialog.confirm({
      title: t('privacy.submitCorrection'),
      message: [t('privacy.correctionImmutableNote'), t('privacy.correctionSectionSubtitle')].join(
        '\n\n',
      ),
      confirmLabel: t('privacy.submitCorrection'),
      cancelLabel: t('privacy.cancel'),
      onConfirm: () =>
        runSubmit({
          resource_type: recordType,
          resource_id: resourceId.trim(),
          reason: trimmedReason,
        }),
    });
  };

  if (submitted) {
    return (
      <View style={styles.section}>
        <SectionHeader title={t('privacy.correctionSectionTitle')} variant="overline" />
        <Card variant="flush">
          <EmptyState
            icon="check-circle"
            tint="green"
            title={t('privacy.correctionSubmitted')}
            message={t('privacy.correctionSubmittedBody')}
            actionLabel={t('privacy.correctionAnother')}
            onAction={resetForm}
          />
          <View style={styles.reference}>
            <Text style={styles.referenceText} selectable>
              {t('privacy.correctionReference', { id: submitted.id })}
            </Text>
          </View>
        </Card>
      </View>
    );
  }

  const reasonLength = reason.trim().length;

  return (
    <View style={styles.section}>
      <View>
        <SectionHeader title={t('privacy.correctionSectionTitle')} variant="overline" />
        <Text style={styles.sectionHint}>{t('privacy.correctionSectionSubtitle')}</Text>
      </View>

      {/* Clinical entries are never quietly overwritten. Kept verbatim. */}
      <Notice tone="info" icon="document-text" body={t('privacy.correctionImmutableNote')} />

      <View>
        <Text style={styles.fieldLabel}>{t('privacy.recordTypeLabel')}</Text>
        <View style={styles.chips}>
          {RECORD_TYPES.map((type) => (
            <Chip
              key={type}
              label={t(`privacy.recordType.${type}`)}
              selected={type === recordType}
              onPress={() => setRecordType(type)}
            />
          ))}
        </View>
        {errors.recordType ? <Text style={styles.error}>{errors.recordType}</Text> : null}
      </View>

      <View>
        <Text style={styles.fieldLabel}>{t('privacy.recordIdLabel')}</Text>
        <PillInput
          placeholder={t('privacy.recordIdPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          value={resourceId}
          onChangeText={setResourceId}
          error={errors.resourceId}
          accessibilityLabel={t('privacy.recordIdLabel')}
        />
        <Text style={styles.fieldHint}>{t('privacy.recordIdHint')}</Text>
      </View>

      <View>
        <Text style={styles.fieldLabel}>{t('privacy.reasonLabel')}</Text>
        {/* The kit has no textarea; this is the kit's own surface, border and
            radius tokens around a multiline input, not a new colour. */}
        <View style={[styles.textarea, !!errors.reason && styles.textareaError]}>
          <TextInput
            style={styles.textareaInput}
            placeholder={t('privacy.reasonPlaceholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={4}
            maxLength={REASON_MAX}
            textAlignVertical="top"
            value={reason}
            onChangeText={setReason}
            accessibilityLabel={t('privacy.reasonLabel')}
            aria-invalid={!!errors.reason}
          />
        </View>
        <View style={styles.counterRow}>
          <Text style={styles.error}>{errors.reason ?? ''}</Text>
          <Text style={styles.counter}>
            {t('privacy.reasonCounter', { count: reasonLength, max: REASON_MAX })}
          </Text>
        </View>
      </View>

      {notice ? <Notice tone={notice.tone} icon={notice.icon} body={notice.body} /> : null}

      <GradientButton
        label={t('privacy.submitCorrection')}
        onPress={handleSubmit}
        loading={createMutation.isPending}
        icon="none"
        accessibilityHint={t('privacy.correctionSectionSubtitle')}
      />

      {/* Both footers kept verbatim. */}
      <Notice tone="neutral" icon="edit" body={t('privacy.correctionFooterNote')} />
      <Notice tone="neutral" icon="shield-check" body={t('privacy.exportFooterNote')} />
    </View>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** Tinted inline notice: icon in a status circle, optional title, body. */
function Notice({
  tone,
  icon,
  title,
  body,
}: {
  tone: StatusTone;
  icon: IconName;
  title?: string;
  body: string;
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
        <Icon name={icon} size={20} color={skin.fg} />
      </View>
      <View style={styles.noticeBody}>
        {title ? <Text style={[styles.noticeTitle, { color: skin.fg }]}>{title}</Text> : null}
        <Text style={styles.noticeText}>{body}</Text>
      </View>
    </View>
  );
}

// ── Styles (colour-dependent, built per palette) ───────────────────────────

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingTop: 0, gap: spacing.md, paddingBottom: spacing.xxl },

    section: { gap: spacing.md },
    sectionDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
    sectionHint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    stack: { gap: spacing.sm + 4 },

    loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md },

    // Fields
    fieldLabel: {
      marginBottom: spacing.sm,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 13,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    fieldHint: {
      marginTop: spacing.sm,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    error: {
      flex: 1,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: colors.statusCritical,
    },
    counterRow: {
      marginTop: spacing.xs + 2,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    counter: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    textarea: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: spacing.md,
    },
    textareaError: { borderColor: colors.statusCritical },
    textareaInput: {
      minHeight: 96,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },

    // Steps
    stepMark: {
      width: 40,
      height: 40,
      borderRadius: radii.pill,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumber: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.sm,
      color: colors.blue,
    },

    // Request card body
    detail: { padding: spacing.md, gap: spacing.sm + 4 },
    detailValue: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    expiryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
    expiryText: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.statusWarning,
    },

    // Correction reference
    reference: {
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
      padding: spacing.sm + 4,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceMuted,
    },
    referenceText: {
      textAlign: 'center',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },

    // Inline notice
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
      borderRadius: radii.pill,
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
