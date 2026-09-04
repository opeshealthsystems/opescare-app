import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fetchImmunizations, Immunization } from '../api/clinical';
import { Card, DataListScreen } from '../components/DataListScreen';
import { cacheKeys } from '../lib/offlineCache';
import { useTranslation } from '../i18n';
import { colors, typography } from '../theme/theme';
import { formatDate } from '../utils/format';

export function ImmunizationsScreen() {
  const { t } = useTranslation();
  return (
    <DataListScreen<Immunization>
      title={t('records.immunizations.title')}
      emptyLabel={t('records.immunizations.empty')}
      fetcher={fetchImmunizations}
      cacheKey={cacheKeys.immunizations}
      keyExtractor={(i) => String(i.id)}
      renderItem={(i) => (
        <Card>
          <View style={styles.row}>
            <Text style={styles.name}>{i.vaccine_name}</Text>
            {i.dose_number != null && (
              <Text style={styles.dose}>
                {t('records.immunizations.dose', { number: i.dose_number })}
              </Text>
            )}
          </View>
          <Text style={styles.date}>
            {t('records.immunizations.given', { date: formatDate(i.given_date) })}
          </Text>
          {!!i.next_due_date && (
            <Text style={styles.next}>
              {t('records.immunizations.nextDue', { date: formatDate(i.next_due_date) })}
            </Text>
          )}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  name: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.textPrimary },
  dose: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: colors.blue },
  date: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary },
  next: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.warning, marginTop: 2 },
});
