import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import {
  Card,
  CardStack,
  GradientButton,
  Icon,
  ListRow,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
  type Tint,
} from '@/components/opes-ui';
import { extractApiErrorMessage } from '../lib/api/queries';
import {
  IMPORT_MAX_BYTES,
  useImportRecords,
  type ImportKind,
  type ImportSummary,
} from '../lib/api/importRecordsQueries';

/**
 * Import Records — the patient brings records from another provider into
 * their own OpesCare record: a FHIR R4 Bundle (.json) or a PDF / photo.
 *
 * Everything imported is patient-provided and UNVERIFIED, and this screen says
 * so before the patient picks anything and again on the summary. The record
 * the items land in is the bearer token's patient — nothing here names one.
 *
 * Sister of app/export-records.tsx (same kit: ScreenHeader, Card + ListRow,
 * GradientButton, kit Dialog), cross-linked both ways.
 */

interface KindSpec {
  key: ImportKind;
  icon: IconName;
  tint: Tint;
  titleKey: string;
  bodyKey: string;
  types: string[];
}

const KINDS: KindSpec[] = [
  {
    key: 'fhir',
    icon: 'columns',
    tint: 'blue',
    titleKey: 'importRecords.fhirTitle',
    bodyKey: 'importRecords.fhirBody',
    types: ['application/json', 'application/fhir+json', 'text/plain'],
  },
  {
    key: 'document',
    icon: 'document-text',
    tint: 'green',
    titleKey: 'importRecords.documentTitle',
    bodyKey: 'importRecords.documentBody',
    types: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  },
];

export default function ImportRecordsScreen() {
  usePrivateScreen();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const importRecords = useImportRecords();

  const [kind, setKind] = useState<ImportKind>('fhir');
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const selected = KINDS.find((k) => k.key === kind) ?? KINDS[0]!;
  const warn = statusMap.warning;

  const handlePick = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: selected.types,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    if (asset.size != null && asset.size > IMPORT_MAX_BYTES) {
      dialog.alert(t('importRecords.title'), t('importRecords.tooLarge'), 'critical');
      return;
    }

    try {
      const out = await importRecords.mutateAsync({
        kind,
        file: {
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType,
          size: asset.size,
          file: (asset as { file?: File }).file ?? null,
        },
      });
      setSummary(out);
      dialog.alert(
        t('importRecords.done'),
        out.totals.imported > 0
          ? t('importRecords.importedCount', { count: out.totals.imported })
          : t('importRecords.nothingImported'),
        out.totals.imported > 0 ? 'success' : 'warning',
      );
    } catch (err) {
      dialog.alert(t('importRecords.title'), extractApiErrorMessage(err), 'critical');
    }
  };

  const typeRows = summary ? Object.entries(summary.by_type) : [];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScreenHeader
        title={t('importRecords.title')}
        subtitle={t('importRecords.subtitle')}
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Said before anything is picked: patient-provided, never clinician-verified. */}
        <View style={[styles.notice, { backgroundColor: warn.bg }]} accessibilityRole="text">
          <View style={styles.noticeIcon}>
            <Icon name="info" size={20} color={warn.fg} />
          </View>
          <View style={styles.noticeBody}>
            <Text style={[styles.noticeTitle, { color: warn.fg }]}>{t('importRecords.unverifiedTitle')}</Text>
            <Text style={styles.noticeText}>{t('importRecords.unverifiedBody')}</Text>
          </View>
        </View>

        <View>
          <SectionHeader title={t('importRecords.chooseTitle')} variant="overline" />
          <CardStack spacing="sm">
            {KINDS.map((entry) => (
              <Card key={entry.key} variant="flush">
                <ListRow
                  icon={entry.icon}
                  tint={entry.tint}
                  title={t(entry.titleKey)}
                  subtitle={t(entry.bodyKey)}
                  onPress={() => setKind(entry.key)}
                  chevron={false}
                  accessibilityLabel={`${t(entry.titleKey)}. ${t(entry.bodyKey)}`}
                  trailing={
                    <View style={[styles.radio, kind === entry.key && styles.radioOn]}>
                      {kind === entry.key ? <Icon name="check" size={13} color={colors.textOnBrand} /> : null}
                    </View>
                  }
                />
              </Card>
            ))}
          </CardStack>
          <Text style={styles.caption}>{t('importRecords.limits')}</Text>

          <GradientButton
            label={importRecords.isPending ? t('importRecords.uploading') : t('importRecords.pick')}
            onPress={() => void handlePick()}
            loading={importRecords.isPending}
            icon="none"
            style={styles.button}
            accessibilityHint={t(selected.bodyKey)}
          />
        </View>

        {summary ? (
          <View>
            <SectionHeader title={t('importRecords.summaryTitle')} variant="overline" />
            <CardStack spacing="sm">
              <Card variant="flush">
                <ListRow
                  icon="upload"
                  tint="blue"
                  title={`${t('importRecords.importedCount', { count: summary.totals.imported })} · ${t('importRecords.skippedCount', { count: summary.totals.skipped })}`}
                  chevron={false}
                  trailing={<StatusBadge status="pending" tone="warning" label={summary.label} icon="info" size="sm" />}
                />
              </Card>
              {typeRows.map(([type, counts]) => (
                <Card key={type} variant="flush">
                  <ListRow
                    icon="document-text"
                    tint="green"
                    title={type}
                    meta={[
                      `${t('importRecords.imported')}: ${counts.imported}`,
                      `${t('importRecords.skipped')}: ${counts.skipped}`,
                    ]}
                    chevron={false}
                  />
                </Card>
              ))}
            </CardStack>
            {summary.skipped.map((s) => (
              <Text key={`${s.resource_type}-${s.reason}`} style={styles.caption}>
                {`${s.resource_type}: ${s.reason_label} (${s.count})`}
              </Text>
            ))}
          </View>
        ) : null}

        <Card variant="flush">
          <ListRow
            icon="download"
            tint="green"
            title={t('importRecords.exportLink')}
            subtitle={t('importRecords.exportLinkBody')}
            onPress={() => router.push('/export-records')}
          />
        </Card>
      </ScrollView>
      {dialog.element}
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: {
      padding: spacing.md,
      paddingTop: 0,
      gap: spacing.md,
      paddingBottom: spacing.xxl,
    },
    caption: {
      marginTop: spacing.sm,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
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
    button: { marginTop: spacing.md },
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
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noticeBody: { flex: 1, minWidth: 0, gap: 2 },
    noticeTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
    },
    noticeText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
  });
