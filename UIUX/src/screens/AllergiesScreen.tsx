import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Allergy, fetchAllergies } from '../api/clinical';
import { Card, DataListScreen } from '../components/DataListScreen';
import { cacheKeys } from '../lib/offlineCache';
import { useTranslation } from '../i18n';
import { colors, typography } from '../theme/theme';
import { formatDate, formatLabel } from '../utils/format';

export function AllergiesScreen() {
  const { t } = useTranslation();
  return (
    <DataListScreen<Allergy>
      title={t('records.allergies.title')}
      emptyLabel={t('records.allergies.empty')}
      fetcher={fetchAllergies}
      cacheKey={cacheKeys.allergies}
      keyExtractor={(a) => String(a.id)}
      renderItem={(a) => (
        <Card>
          <View style={styles.row}>
            <Text style={styles.name}>{a.allergen}</Text>
            {!!a.severity && <Text style={styles.severity}>{formatLabel(a.severity)}</Text>}
          </View>
          {!!a.allergy_type && <Text style={styles.type}>{formatLabel(a.allergy_type)}</Text>}
          {!!a.reaction && (
            <Text style={styles.notes}>{t('records.allergies.reaction', { reaction: a.reaction })}</Text>
          )}
          {!!a.onset_date && (
            <Text style={styles.meta}>{t('records.allergies.onset', { date: formatDate(a.onset_date) })}</Text>
          )}
          {!!a.notes && <Text style={styles.notes}>{a.notes}</Text>}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 2 },
  name: { flex: 1, fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.textPrimary },
  severity: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: colors.statusWarning },
  type: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: colors.textMuted },
  notes: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary, marginTop: 4 },
  meta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textMuted, marginTop: 4 },
});
