import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardStack,
  EmptyState,
  Icon,
  ListRow,
  PillInput,
  SectionHeader,
  StatusBadge,
  formatDate,
  spacing,
  typography,
  useTheme,
} from '@/components/opes-ui';
import { usePharmacyStock, type PharmacyStockLine } from '@/lib/api/pharmacyQueries';
import { money, stockTone } from '@/components/pharmacy/medicine/helpers';
import '@/lib/i18n/pharmacyDetailStrings';

/**
 * "Drugs available" on a pharmacy's detail page (app/facility/[id].tsx).
 *
 * Reads GET /mobile/pharmacy/pharmacies/{id}/stock, which publishes ONLY rows
 * whose source_system is on the availability allow-list. An empty list is a
 * correct answer and is shown as such — never padded with catalogue entries.
 * Each row opens the medicine detail screen, searched from this pharmacy.
 */
export function PharmacyStockSection({
  pharmacyId,
  latitude,
  longitude,
}: {
  pharmacyId: string;
  latitude: number | null;
  longitude: number | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(handle);
  }, [term]);

  const stock = usePharmacyStock(pharmacyId, debounced);
  const rows = stock.data ?? [];
  const searching = debounced !== '';
  const showSearch = searching || rows.length > 0;

  const openMedicine = (line: PharmacyStockLine) =>
    router.push({
      pathname: '/pharmacy/[medicineId]',
      params: {
        medicineId: line.medicine_id,
        ...(latitude !== null && longitude !== null ? { lat: String(latitude), lng: String(longitude) } : {}),
      },
    });

  const title =
    !searching && rows.length > 0
      ? t('pharmacyDetail.drugsTitleCount', { count: rows.length })
      : t('pharmacyDetail.drugsTitle');

  return (
    <View>
      <SectionHeader title={title} variant="overline" />

      {showSearch ? (
        <PillInput
          icon={<Icon name="search" size={18} color={colors.textMuted} />}
          value={term}
          onChangeText={setTerm}
          placeholder={t('pharmacyDetail.searchPlaceholder')}
          accessibilityLabel={t('pharmacyDetail.searchLabel')}
          autoCorrect={false}
          returnKeyType="search"
          style={styles.search}
        />
      ) : null}

      {stock.isLoading ? (
        <Card>
          <ActivityIndicator color={colors.blue} />
        </Card>
      ) : stock.isError && rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="info"
            title={t('pharmacyDetail.loadError')}
            actionLabel={t('pharmacyDetail.retry')}
            onAction={() => stock.refetch()}
          />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          {searching ? (
            <EmptyState
              icon="search"
              title={t('pharmacyDetail.noMatchTitle')}
              message={t('pharmacyDetail.noMatchMessage', { term: debounced })}
            />
          ) : (
            <EmptyState icon="pill" title={t('pharmacyDetail.emptyTitle')} message={t('pharmacyDetail.emptyMessage')} />
          )}
        </Card>
      ) : (
        <>
          <CardStack spacing="sm">
            {rows.map((line) => {
              const price = money(line.unit_price, line.currency);
              const reported = line.last_reported_at
                ? t('pharmacyDetail.reported', {
                    when: formatDate(line.last_reported_at),
                  })
                : t('pharmacyDetail.notDated');
              return (
                <Card key={line.medicine_id} variant="flush">
                  <ListRow
                    icon="pill"
                    title={line.name}
                    meta={[
                      line.generic_name && line.generic_name !== line.name ? line.generic_name : null,
                      price,
                      line.prescription_required ? t('pharmacyDetail.rxRequired') : null,
                      reported,
                    ]}
                    trailing={
                      <StatusBadge
                        size="sm"
                        status={line.status}
                        tone={stockTone(line.status as never)}
                        label={t(`pharmacyDetail.status.${line.status}`, {
                          defaultValue: line.status_label,
                        })}
                      />
                    }
                    onPress={() => openMedicine(line)}
                    accessibilityHint={t('pharmacyDetail.openHint')}
                  />
                </Card>
              );
            })}
          </CardStack>
          <Text style={[styles.note, { color: colors.textMuted }]}>{t('pharmacyDetail.note')}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  search: { marginBottom: spacing.sm },
  note: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    marginTop: spacing.xs,
  },
});
