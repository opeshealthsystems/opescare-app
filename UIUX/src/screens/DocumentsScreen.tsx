import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchDocuments, PatientDocument } from '../api/clinical';
import { Card, DataListScreen } from '../components/DataListScreen';
import { cacheKeys } from '../lib/offlineCache';
import { useTranslation } from '../i18n';
import { colors, typography } from '../theme/theme';
import { formatDateTime, formatLabel } from '../utils/format';

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  return (
    <DataListScreen<PatientDocument>
      title={t('records.documents.title')}
      emptyLabel={t('records.documents.empty')}
      fetcher={fetchDocuments}
      cacheKey={cacheKeys.documents}
      keyExtractor={(d) => String(d.id)}
      renderItem={(d) => (
        <TouchableOpacity
          activeOpacity={0.7}
          accessibilityRole="button"
          onPress={() => navigation.navigate('DocumentPreview', { documentId: String(d.id) })}
        >
          <Card>
            <Text style={styles.label}>{d.label || d.document_type}</Text>
            <View style={styles.row}>
              <Text style={styles.meta}>{formatLabel(d.document_type)}</Text>
              {!!d.file_size && <Text style={styles.meta}>{formatBytes(d.file_size)}</Text>}
            </View>
            <Text style={styles.date}>{formatDateTime(d.created_at)}</Text>
          </Card>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.textPrimary, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  meta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textSecondary },
  date: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted },
});
