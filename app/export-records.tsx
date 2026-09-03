import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  AlertTriangle,
  Check,
  CircleAlert,
  CircleCheck,
  Download,
  FileCode,
  FileText,
  FlaskConical,
  History,
  Pill,
  Scale,
  ShieldCheck,
  Stethoscope,
  Syringe,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../components/ui/Screen';
import {
  CARD_SHADOW,
  InlineNotice,
  NavRow,
  RightsHeader,
  SectionTitle,
  type Tone,
} from '../components/privacy/DataRightsUi';
import {
  extractApiErrorMessage,
  useExportMedicalRecordsFhir,
  useExportMedicalRecordsPdf,
} from '../lib/api/queries';
import { colors } from '../theme/tokens';

type ExportFormat = 'pdf' | 'fhir';
type Notice = { tone: Tone; icon: LucideIcon; body: string };

/**
 * Export Medical Records — the patient's immediate, unmoderated copy of their
 * own record, in the two formats the API produces:
 *   POST /mobile/medical-records/export/pdf  → base64 PDF (human-readable)
 *   POST /mobile/medical-records/export/fhir → a bare FHIR R4 Bundle (machine)
 *
 * Distinct from app/privacy/export.tsx, which is the *moderated* export
 * request a compliance officer approves; the two are cross-linked below so the
 * difference is legible rather than confusing.
 *
 * No reference image depicts this screen. The "what's included" checklist and
 * the two format cards follow the settings reference's "Download / Share" and
 * "Account Management" blocks (a_bright_clean_white_mobile_app_settings_screen)
 * re-rendered in the gold/cream brand.
 *
 * Feedback is in-screen, not `Alert.alert` — Alert is a no-op on React Native
 * Web, which would leave a failed export looking like a successful one.
 */
export default function ExportRecordsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [activeFormat, setActiveFormat] = useState<ExportFormat | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const exportPdf = useExportMedicalRecordsPdf();
  const exportFhir = useExportMedicalRecordsFhir();

  /** Writes the export to app storage. Throws on failure — the caller treats
   * that as a real export failure. */
  const saveExport = async (
    filename: string,
    content: string,
    encoding: 'base64' | 'utf8',
  ): Promise<string> => {
    const uri = `${FileSystem.documentDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(uri, content, {
      encoding:
        encoding === 'base64' ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
    });
    return uri;
  };

  /** Opens the OS share sheet. The file is already saved at this point, so a
   * dismissed share sheet is not a failure — it just means the patient kept
   * the copy on the device. */
  const presentShareSheet = async (uri: string, filename: string, mimeType: string) => {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        setNotice({
          tone: 'success',
          icon: CircleCheck,
          body: t('exportRecords.savedOnly', { filename }),
        });
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType,
        dialogTitle: t('exportRecords.shareTitle'),
        UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'public.json',
      });
      setNotice({
        tone: 'success',
        icon: CircleCheck,
        body: t('exportRecords.exportReady', { filename }),
      });
    } catch {
      setNotice({
        tone: 'success',
        icon: CircleCheck,
        body: t('exportRecords.savedOnly', { filename }),
      });
    }
  };

  const handleExport = async (format: ExportFormat) => {
    if (activeFormat) return;
    setNotice(null);
    setActiveFormat(format);
    try {
      if (format === 'pdf') {
        const result = await exportPdf.mutateAsync();
        const uri = await saveExport(result.filename, result.file_base64, 'base64');
        await presentShareSheet(uri, result.filename, result.mime_type);
      } else {
        // The FHIR endpoint returns the Bundle itself, not a wrapper, so it is
        // written to disk verbatim and stays a valid FHIR document.
        const bundle = await exportFhir.mutateAsync();
        const filename = `medical-record-fhir-${Date.now()}.json`;
        const uri = await saveExport(filename, JSON.stringify(bundle, null, 2), 'utf8');
        await presentShareSheet(uri, filename, 'application/fhir+json');
      }
    } catch (err) {
      setNotice({ tone: 'danger', icon: CircleAlert, body: extractApiErrorMessage(err) });
    } finally {
      setActiveFormat(null);
    }
  };

  return (
    <Screen className="px-0">
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        <RightsHeader
          title={t('exportRecords.title')}
          subtitle={t('exportRecords.subtitle')}
          icon={Download}
        />

        <View className="mt-5">
          <InlineNotice
            tone="brand"
            icon={Scale}
            title={t('exportRecords.rightsTitle')}
            body={t('exportRecords.rightsBody')}
          />
        </View>

        {/* What's included */}
        <SectionTitle label={t('exportRecords.includedTitle')} />
        <View className="rounded-2xl bg-white p-4" style={CARD_SHADOW}>
          <IncludedRow icon={User} label={t('exportRecords.includedProfile')} />
          <IncludedRow icon={AlertTriangle} label={t('exportRecords.includedAllergies')} />
          <IncludedRow icon={Stethoscope} label={t('exportRecords.includedDiagnoses')} />
          <IncludedRow icon={Pill} label={t('exportRecords.includedMedications')} />
          <IncludedRow icon={FlaskConical} label={t('exportRecords.includedLabs')} />
          <IncludedRow icon={Syringe} label={t('exportRecords.includedImmunizations')} isLast />
        </View>

        {/* Format choices */}
        <SectionTitle label={t('exportRecords.formatTitle')} hint={t('exportRecords.formatHint')} />
        <View style={{ gap: 12 }}>
          <FormatCard
            icon={FileText}
            title={t('exportRecords.pdfTitle')}
            body={t('exportRecords.pdfBody')}
            audience={t('exportRecords.pdfAudience')}
            actionLabel={t('exportRecords.pdfAction')}
            loading={activeFormat === 'pdf'}
            disabled={activeFormat !== null}
            onPress={() => handleExport('pdf')}
          />
          <FormatCard
            icon={FileCode}
            title={t('exportRecords.fhirTitle')}
            body={t('exportRecords.fhirBody')}
            audience={t('exportRecords.fhirAudience')}
            actionLabel={t('exportRecords.fhirAction')}
            loading={activeFormat === 'fhir'}
            disabled={activeFormat !== null}
            onPress={() => handleExport('fhir')}
          />
        </View>

        {notice ? (
          <View className="mt-4">
            <InlineNotice tone={notice.tone} icon={notice.icon} body={notice.body} />
          </View>
        ) : null}

        {/* Privacy note — an exported copy leaves OpesCare's protections. */}
        <View className="mt-5">
          <InlineNotice
            tone="warning"
            icon={ShieldCheck}
            title={t('exportRecords.privacyNoteTitle')}
            body={t('exportRecords.privacyNote')}
          />
        </View>

        {/* Where the neighbouring rights live. */}
        <SectionTitle label={t('exportRecords.relatedTitle')} />
        <NavRow
          icon={History}
          title={t('exportRecords.relatedLogsTitle')}
          description={t('exportRecords.relatedLogsBody')}
          onPress={() => router.push('/privacy/access-logs')}
        />
        <View className="h-3" />
        <NavRow
          icon={ShieldCheck}
          title={t('exportRecords.relatedRequestTitle')}
          description={t('exportRecords.relatedRequestBody')}
          onPress={() => router.push('/privacy/export')}
        />
      </ScrollView>
    </Screen>
  );
}

function IncludedRow({
  icon: Icon,
  label,
  isLast,
}: {
  icon: LucideIcon;
  label: string;
  isLast?: boolean;
}) {
  return (
    <View
      className="flex-row items-center py-2.5"
      style={!isLast ? { borderBottomWidth: 1, borderBottomColor: colors.cream[200] } : undefined}
    >
      <View className="h-8 w-8 items-center justify-center rounded-full bg-brand-50">
        <Icon size={15} color={colors.brand[600]} />
      </View>
      <Text className="ml-3 flex-1 text-[13px] text-navy-text">{label}</Text>
      <Check size={15} color={colors.semantic.success} />
    </View>
  );
}

function FormatCard({
  icon: Icon,
  title,
  body,
  audience,
  actionLabel,
  loading,
  disabled,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  audience: string;
  actionLabel: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const isBlocked = disabled && !loading;

  return (
    <View className="rounded-2xl bg-white p-4" style={CARD_SHADOW}>
      <View className="flex-row items-start">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-100">
          <Icon size={19} color={colors.brand[600]} />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-[15px] font-extrabold text-navy-text">{title}</Text>
          <Text className="mt-1 text-[12px] leading-[18px] text-navy-secondary">{body}</Text>
        </View>
      </View>

      <View className="mt-3 flex-row items-center rounded-xl bg-cream-100 px-3 py-2">
        <Text className="text-[11px] leading-4 text-navy-secondary">{audience}</Text>
      </View>

      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        className="mt-3.5 h-12 flex-row items-center justify-center rounded-xl bg-brand-500"
        style={{ opacity: isBlocked ? 0.5 : 1 }}
      >
        {loading ? (
          <>
            <ActivityIndicator color={colors.white} size="small" />
            <Text className="ml-2 text-[13px] font-bold text-white">
              {t('exportRecords.generating')}
            </Text>
          </>
        ) : (
          <>
            <Download size={15} color={colors.white} />
            <Text className="ml-2 text-[13px] font-bold text-white">{actionLabel}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}
