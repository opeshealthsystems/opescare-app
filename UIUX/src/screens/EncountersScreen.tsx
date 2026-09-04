import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EncounterSummary, fetchEncounters } from '../api/clinical';
import { Card, DataListScreen } from '../components/DataListScreen';
import { cacheKeys } from '../lib/offlineCache';
import { StatusBadge } from '../components/StatusBadge';
import { useTranslation } from '../i18n';
import { colors, typography } from '../theme/theme';
import { formatDate, formatLabel } from '../utils/format';

export function EncountersScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  return (
    <DataListScreen<EncounterSummary>
      title={t('records.encounters.title')}
      emptyLabel={t('records.encounters.empty')}
      fetcher={fetchEncounters}
      cacheKey={cacheKeys.encounters}
      keyExtractor={(e) => e.id}
      renderItem={(e) => (
        <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.navigate('EncounterDetail', { id: e.id })}>
          <Card>
            <View style={styles.row}>
              <Text style={styles.type}>{formatLabel(e.encounter_type)}</Text>
              <StatusBadge status={e.status} />
            </View>
            <Text style={styles.date}>{formatDate(e.encounter_date)}</Text>
            {!!e.doctor_name && (
              <Text style={styles.meta}>
                {t('records.encounters.seenBy', { name: e.doctor_name })}
              </Text>
            )}
            {!!e.chief_complaint && <Text style={styles.reason}>{e.chief_complaint}</Text>}
          </Card>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  type: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.textPrimary },
  date: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.blue, marginBottom: 4 },
  meta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary },
  reason: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textMuted, marginTop: 4 },
});
