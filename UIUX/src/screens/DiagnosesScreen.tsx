import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Diagnosis, fetchDiagnoses } from '../api/clinical';
import { Card, DataListScreen } from '../components/DataListScreen';
import { cacheKeys } from '../lib/offlineCache';
import { useTranslation } from '../i18n';
import { colors, typography } from '../theme/theme';
import { formatLabel } from '../utils/format';

export function DiagnosesScreen() {
  const { t } = useTranslation();
  return (
    <DataListScreen<Diagnosis>
      title={t('records.diagnoses.title')}
      emptyLabel={t('records.diagnoses.empty')}
      fetcher={fetchDiagnoses}
      cacheKey={cacheKeys.diagnoses}
      keyExtractor={(d) => String(d.id)}
      renderItem={(d) => (
        <Card>
          <View style={styles.row}>
            <Text style={styles.name}>
              {d.icd10_description || t('records.diagnoses.codeOnly', { code: d.icd10_code })}
            </Text>
            <Text style={styles.type}>{formatLabel(d.diagnosis_type)}</Text>
          </View>
          {!!d.notes && <Text style={styles.notes}>{d.notes}</Text>}
          {!!d.icd10_code && !!d.icd10_description && <Text style={styles.code}>{t('records.diagnoses.icdCode', { code: d.icd10_code })}</Text>}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  name: { flex: 1, fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.textPrimary },
  type: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: colors.textMuted },
  notes: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary, marginTop: 2 },
  code: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted, marginTop: 6 },
});
