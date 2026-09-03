import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  Ban,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  CircleCheck,
  Download,
  FileSearch,
  Hourglass,
  Inbox,
  PenLine,
  Scale,
  Send,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import {
  CARD_SHADOW,
  Chip,
  ChoiceChip,
  EmptyState,
  InlineNotice,
  RightsHeader,
  SectionTitle,
  humanizeSlug,
  toneColors,
  type Tone,
} from '../../components/privacy/DataRightsUi';
import { colors } from '../../theme/tokens';
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

/**
 * Data Export & Corrections — the two data rights that go through review.
 *
 * No reference image depicts this screen. It follows the app's established
 * white-card language and the "Download / Share" + "Account Management" blocks
 * of the settings reference (a_bright_clean_white_mobile_app_settings_screen).
 *
 * The moderated part is the point: a data-export request is created `pending`
 * and stays undownloadable until a compliance officer approves it, at which
 * point it is valid for 24 hours and exactly one download (the server flips it
 * to `downloaded` and refuses a second). The API answers a premature download
 * with 403, so every state carries its own plain-language explanation and the
 * download button only exists while it can actually succeed — a 403 should
 * never be something the patient has to interpret.
 *
 * Results are shown as in-screen banners rather than `Alert.alert`, which is a
 * no-op on React Native Web and would leave a submitted request looking like
 * nothing happened.
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

/** Status → how it looks and what it means. Mirrors DataExportService. */
const EXPORT_STATUS: Record<string, { tone: Tone; icon: LucideIcon }> = {
  pending: { tone: 'warning', icon: Hourglass },
  approved: { tone: 'success', icon: CheckCircle2 },
  downloaded: { tone: 'muted', icon: CircleCheck },
  rejected: { tone: 'danger', icon: XCircle },
  expired: { tone: 'muted', icon: Ban },
};

type Notice = { tone: Tone; icon: LucideIcon; body: string };

export default function PrivacyExportScreen() {
  const { t } = useTranslation();

  return (
    <Screen className="px-0">
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        <RightsHeader
          title={t('privacy.exportTitle')}
          subtitle={t('privacy.exportPageSubtitle')}
          icon={Download}
        />

        <View className="mt-5">
          <InlineNotice
            tone="brand"
            icon={Scale}
            title={t('privacy.rightsTitle')}
            body={t('privacy.exportRightsBody')}
          />
        </View>

        <ExportSection />

        <View className="mt-8 h-px bg-cream-300" />

        <CorrectionSection />
      </ScrollView>
    </Screen>
  );
}

function ExportSection() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
  const [selectedType, setSelectedType] = useState<DataExportType>('full_record');
  const [notice, setNotice] = useState<Notice | null>(null);

  const requestsQuery = useDataExportRequests();
  const createMutation = useCreateDataExportRequest();
  const downloadMutation = useDownloadDataExport();

  const requests = requestsQuery.data ?? [];

  const handleRequest = () => {
    setNotice(null);
    createMutation.mutate(selectedType, {
      onSuccess: () =>
        setNotice({ tone: 'success', icon: CircleCheck, body: t('privacy.exportRequested') }),
      onError: (err) =>
        setNotice({ tone: 'danger', icon: CircleAlert, body: extractApiErrorMessage(err) }),
    });
  };

  const handleDownload = (item: DataExportRequestItem) => {
    setNotice(null);
    downloadMutation.mutate(item.id, {
      onSuccess: async (result) => {
        const filename = `opescare-export-${result.export_type}-${result.id}.json`;
        try {
          const uri = `${FileSystem.documentDirectory}${filename}`;
          await FileSystem.writeAsStringAsync(uri, JSON.stringify(result.content, null, 2), {
            encoding: FileSystem.EncodingType.UTF8,
          });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, {
              mimeType: 'application/json',
              dialogTitle: t('privacy.downloadShareTitle'),
              UTI: 'public.json',
            });
          } else {
            setNotice({
              tone: 'success',
              icon: CircleCheck,
              body: t('privacy.downloadSavedOnly', { filename }),
            });
            return;
          }
          setNotice({
            tone: 'success',
            icon: CircleCheck,
            body: t('privacy.downloadedSuccess'),
          });
        } catch {
          // The payload arrived; only the save/share step failed.
          setNotice({ tone: 'danger', icon: CircleAlert, body: t('privacy.downloadSaveFailed') });
        }
      },
      onError: (err) => {
        // The API answers a download that isn't (or is no longer) collectable
        // with 403 and an English-only message — "Export is not approved." /
        // "Export download link has expired." Neither should reach the patient
        // as a raw error: it means the request has moved on, so the list is
        // refreshed and the state is explained in their own language.
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 403) {
          requestsQuery.refetch();
          setNotice({ tone: 'warning', icon: Hourglass, body: t('privacy.downloadNotReady') });
          return;
        }
        setNotice({ tone: 'danger', icon: CircleAlert, body: extractApiErrorMessage(err) });
      },
    });
  };

  return (
    <View>
      <SectionTitle
        label={t('privacy.exportSectionTitle')}
        hint={t('privacy.exportSectionSubtitle')}
      />

      <Text className="mb-2 text-[12px] font-bold uppercase tracking-wide text-navy-muted">
        {t('privacy.exportTypeLabel')}
      </Text>
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {EXPORT_TYPES.map((type) => (
          <ChoiceChip
            key={type}
            label={t(`privacy.exportType.${type}`)}
            selected={type === selectedType}
            onPress={() => setSelectedType(type)}
          />
        ))}
      </View>
      <Text className="mt-2.5 text-[12px] leading-[18px] text-navy-secondary">
        {t(`privacy.exportTypeDesc.${selectedType}`)}
      </Text>

      {/* What actually happens after you tap request. */}
      <View className="mt-4 rounded-2xl bg-white p-4" style={CARD_SHADOW}>
        <Text className="text-[12px] font-bold uppercase tracking-wide text-navy-muted">
          {t('privacy.howItWorks')}
        </Text>
        <StepRow index={1} label={t('privacy.step1')} />
        <StepRow index={2} label={t('privacy.step2')} />
        <StepRow index={3} label={t('privacy.step3')} isLast />
      </View>

      <View className="mt-4">
        <Button
          label={t('privacy.requestExport')}
          leftIcon={Download}
          showChevron={false}
          loading={createMutation.isPending}
          onPress={handleRequest}
        />
      </View>

      {notice ? (
        <View className="mt-4">
          <InlineNotice tone={notice.tone} icon={notice.icon} body={notice.body} />
        </View>
      ) : null}

      <SectionTitle label={t('privacy.myRequests')} count={requests.length} />
      {requestsQuery.isLoading ? (
        <View className="items-center py-8">
          <ActivityIndicator color={colors.brand[500]} />
        </View>
      ) : requestsQuery.isError ? (
        <InlineNotice tone="danger" icon={CircleAlert} body={t('privacy.myRequestsError')} />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={Inbox}
          tone="muted"
          title={t('privacy.noExportRequestsTitle')}
          body={t('privacy.noExportRequests')}
        />
      ) : (
        requests.map((item) => (
          <ExportRequestCard
            key={item.id}
            item={item}
            locale={locale}
            downloading={downloadMutation.isPending && downloadMutation.variables === item.id}
            onDownload={() => handleDownload(item)}
          />
        ))
      )}
    </View>
  );
}

function StepRow({ index, label, isLast }: { index: number; label: string; isLast?: boolean }) {
  return (
    <View
      className="flex-row items-center py-2.5"
      style={!isLast ? { borderBottomWidth: 1, borderBottomColor: colors.cream[200] } : undefined}
    >
      <View className="h-6 w-6 items-center justify-center rounded-full bg-brand-100">
        <Text className="text-[11px] font-extrabold text-brand-600">{index}</Text>
      </View>
      <Text className="ml-3 flex-1 text-[13px] leading-[18px] text-navy-text">{label}</Text>
    </View>
  );
}

function ExportRequestCard({
  item,
  locale,
  downloading,
  onDownload,
}: {
  item: DataExportRequestItem;
  locale: string;
  downloading: boolean;
  onDownload: () => void;
}) {
  const { t } = useTranslation();
  const meta = EXPORT_STATUS[item.status] ?? { tone: 'muted' as Tone, icon: Hourglass };
  const StatusIcon = meta.icon;
  const { surface, ink } = toneColors(meta.tone);

  const created = new Date(item.created_at);
  const createdValid = !Number.isNaN(created.getTime());
  const expires = item.expires_at ? new Date(item.expires_at) : null;
  const expiresValid = expires && !Number.isNaN(expires.getTime());

  return (
    <View className="mb-3 rounded-2xl bg-white p-4" style={CARD_SHADOW}>
      <View className="flex-row items-start">
        <View
          className="h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: surface }}
        >
          <StatusIcon size={17} color={ink} />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-[14px] font-extrabold text-navy-text">
            {t(`privacy.exportType.${item.export_type}`, {
              defaultValue: humanizeSlug(item.export_type),
            })}
          </Text>
          {createdValid ? (
            <Text className="mt-0.5 text-[11px] text-navy-muted">
              {t('privacy.requestedOn', {
                date: created.toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                }),
              })}
            </Text>
          ) : null}
        </View>
        <Chip
          tone={meta.tone}
          icon={StatusIcon}
          label={t(`privacy.exportStatus.${item.status}`, {
            defaultValue: humanizeSlug(item.status),
          })}
        />
      </View>

      {/* Every status says, in words, what it means for the patient — so a 403
          on a premature download is never something they can walk into. */}
      <Text className="mt-3 text-[12px] leading-[18px] text-navy-secondary">
        {t(`privacy.exportStatusHelp.${item.status}`, {
          defaultValue: t('privacy.exportStatusHelp.pending'),
        })}
      </Text>

      {item.status === 'approved' ? (
        <>
          {expiresValid ? (
            <View className="mt-2.5 flex-row items-center">
              <CalendarClock size={13} color={colors.semantic.warning} />
              <Text
                className="ml-1.5 text-[11px] font-semibold"
                style={{ color: colors.semantic.warning }}
              >
                {t('privacy.downloadExpires', {
                  date: expires.toLocaleString(locale, {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                })}
              </Text>
            </View>
          ) : null}
          <Pressable
            onPress={onDownload}
            disabled={downloading}
            accessibilityRole="button"
            className="mt-3 h-12 flex-row items-center justify-center rounded-xl bg-brand-500"
            style={{ opacity: downloading ? 0.7 : 1 }}
          >
            {downloading ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Download size={15} color={colors.white} />
                <Text className="ml-2 text-[13px] font-bold text-white">
                  {t('privacy.download')}
                </Text>
              </>
            )}
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

function CorrectionSection() {
  const { t } = useTranslation();
  const [recordType, setRecordType] = useState<string | null>(null);
  const [resourceId, setResourceId] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{
    recordType?: string;
    resourceId?: string;
    reason?: string;
  }>({});
  const [submitted, setSubmitted] = useState<CorrectionRequestItem | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const createMutation = useCreateCorrectionRequest();

  const resetForm = () => {
    setRecordType(null);
    setResourceId('');
    setReason('');
    setErrors({});
    setSubmitted(null);
    setNotice(null);
  };

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

    createMutation.mutate(
      { resource_type: recordType, resource_id: resourceId.trim(), reason: trimmedReason },
      {
        onSuccess: (item) => setSubmitted(item),
        onError: (err) =>
          setNotice({ tone: 'danger', icon: CircleAlert, body: extractApiErrorMessage(err) }),
      },
    );
  };

  if (submitted) {
    return (
      <View>
        <SectionTitle label={t('privacy.correctionSectionTitle')} />
        <View className="items-center rounded-2xl bg-white px-6 py-8" style={CARD_SHADOW}>
          <View
            className="h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.semantic.successSurface }}
          >
            <CircleCheck size={26} color={colors.semantic.success} />
          </View>
          <Text className="mt-4 text-center text-[15px] font-extrabold text-navy-text">
            {t('privacy.correctionSubmitted')}
          </Text>
          <Text className="mt-1.5 max-w-[280px] text-center text-[13px] leading-5 text-navy-secondary">
            {t('privacy.correctionSubmittedBody')}
          </Text>
          <View className="mt-4 rounded-xl bg-cream-200 px-3 py-2">
            <Text className="text-[11px] text-navy-secondary">
              {t('privacy.correctionReference', { id: submitted.id })}
            </Text>
          </View>
          <Pressable
            onPress={resetForm}
            accessibilityRole="button"
            className="mt-5 rounded-full border border-brand-500 px-5 py-2.5"
          >
            <Text className="text-[13px] font-bold text-brand-600">
              {t('privacy.correctionAnother')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const reasonLength = reason.trim().length;

  return (
    <View>
      <SectionTitle
        label={t('privacy.correctionSectionTitle')}
        hint={t('privacy.correctionSectionSubtitle')}
      />

      <View className="mb-4">
        <InlineNotice tone="info" icon={FileSearch} body={t('privacy.correctionImmutableNote')} />
      </View>

      <Text className="mb-2 text-[12px] font-bold uppercase tracking-wide text-navy-muted">
        {t('privacy.recordTypeLabel')}
      </Text>
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {RECORD_TYPES.map((type) => (
          <ChoiceChip
            key={type}
            label={t(`privacy.recordType.${type}`)}
            selected={type === recordType}
            onPress={() => setRecordType(type)}
          />
        ))}
      </View>
      {errors.recordType ? (
        <Text className="mt-1.5 text-[12px] text-danger">{errors.recordType}</Text>
      ) : null}

      <View className="mt-5">
        <TextField
          label={t('privacy.recordIdLabel')}
          placeholder={t('privacy.recordIdPlaceholder')}
          autoCapitalize="none"
          value={resourceId}
          onChangeText={setResourceId}
          error={errors.resourceId}
        />
        <Text className="-mt-3 mb-4 text-[12px] text-navy-muted">{t('privacy.recordIdHint')}</Text>
      </View>

      <Text className="mb-2 text-[12px] font-bold uppercase tracking-wide text-navy-muted">
        {t('privacy.reasonLabel')}
      </Text>
      <View
        className="rounded-2xl border bg-white p-4"
        style={{ borderColor: errors.reason ? colors.semantic.danger : colors.cream[300] }}
      >
        <TextInput
          className="text-[15px] text-navy-text"
          placeholder={t('privacy.reasonPlaceholder')}
          placeholderTextColor={colors.navy.muted}
          multiline
          numberOfLines={4}
          maxLength={REASON_MAX}
          textAlignVertical="top"
          style={{ minHeight: 96 }}
          value={reason}
          onChangeText={setReason}
        />
      </View>
      <View className="mt-1.5 flex-row items-center justify-between">
        <Text className="flex-1 text-[12px] text-danger">{errors.reason ?? ''}</Text>
        <Text className="text-[11px] text-navy-muted">
          {t('privacy.reasonCounter', { count: reasonLength, max: REASON_MAX })}
        </Text>
      </View>

      {notice ? (
        <View className="mt-4">
          <InlineNotice tone={notice.tone} icon={notice.icon} body={notice.body} />
        </View>
      ) : null}

      <View className="mt-5">
        <Button
          label={t('privacy.submitCorrection')}
          leftIcon={Send}
          showChevron={false}
          loading={createMutation.isPending}
          onPress={handleSubmit}
        />
      </View>

      <View className="mt-5">
        <InlineNotice tone="muted" icon={PenLine} body={t('privacy.correctionFooterNote')} />
      </View>

      <View className="mt-4">
        <InlineNotice tone="muted" icon={ShieldCheck} body={t('privacy.exportFooterNote')} />
      </View>
    </View>
  );
}
