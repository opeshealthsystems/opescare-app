import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fetchTimeline, TimelineEvent } from '../api/clinical';
import { Card, DataListScreen } from '../components/DataListScreen';
import { cacheKeys } from '../lib/offlineCache';
import { useTranslation } from '../i18n';
import { colors, typography } from '../theme/theme';
import { formatDateTime, formatLabel } from '../utils/format';

export function TimelineScreen() {
  const { t } = useTranslation();
  return (
    <DataListScreen<TimelineEvent>
      title={t('records.timeline.title')}
      emptyLabel={t('records.timeline.empty')}
      fetcher={fetchTimeline}
      cacheKey={cacheKeys.timeline}
      keyExtractor={(e) => `${e.type}-${e.id}`}
      renderItem={(e) => (
        <Card>
          <View style={styles.row}>
            <Text style={styles.title}>{e.title}</Text>
            <Text style={styles.type}>{formatLabel(e.type)}</Text>
          </View>
          {!!e.occurred_at && <Text style={styles.date}>{formatDateTime(e.occurred_at)}</Text>}
          {!!e.description && <Text style={styles.description}>{e.description}</Text>}
          {e.is_abnormal && <Text style={styles.flag}>{t('records.timeline.abnormal')}</Text>}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 2 },
  title: { flex: 1, fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.md, color: colors.textPrimary },
  type: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: colors.textMuted },
  date: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.sm, color: colors.link, marginTop: 2 },
  description: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary, marginTop: 4 },
  flag: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: colors.statusWarning, marginTop: 4 },
});
