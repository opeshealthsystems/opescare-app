/**
 * Billing — the invoice list behind the Billing tab entry.
 *
 * This is the way into the BILL-001 → BILL-002 → BILL-003 flow: it reads
 * `GET /patient/invoices` (with `meta.totals` for the outstanding banner) and
 * pushes each row onto the real invoice screen.
 */
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchInvoices, type InvoiceTotals, type PortalInvoice } from '../api';
import { Card, EmptyState, Icon, ListRow, ScreenHeader, SectionHeader, StatusBadge } from '../components';
import { useTranslation } from '../i18n';
import { colors, radii, spacing, typography } from '../theme/theme';
import { cacheKeys } from '../lib/offlineCache';
import { formatDate, formatMoney } from '../utils/format';
import { AsyncBoundary, useAsync } from './chat/shared';
import { invoiceStatusBadge } from './billing/parts';

type BillingData = { invoices: PortalInvoice[]; totals: InvoiceTotals };

async function load(): Promise<BillingData> {
  const page = await fetchInvoices({ scope: 'all' });
  return {
    invoices: page.data,
    totals: page.meta.totals,
  };
}

export function BillingScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const state = useAsync<BillingData>(load, [], { cacheKey: cacheKeys.invoices });
  const { reload, reloadIfStale } = state;

  // Returning from a payment must show the settled invoice.
  useFocusEffect(
    useCallback(() => {
      reloadIfStale();
    }, [reloadIfStale])
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('billing.list.title')}
        subtitle={t('billing.list.subtitle')}
        showBack={navigation.canGoBack()}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={state.loading && state.data !== null} onRefresh={reload} tintColor={colors.blue} />
        }
      >
        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel={t('billing.list.loading')}>
          {(data) => {
            const outstanding = data.invoices.filter((i) => i.is_payable);
            const settled = data.invoices.filter((i) => !i.is_payable);
            return (
              <>
                <View style={styles.banner}>
                  <View style={styles.bannerCircle}>
                    <Icon name="credit-card" size={24} color={colors.textOnBrand} />
                  </View>
                  <View style={styles.bannerBody}>
                    <Text style={styles.bannerLabel}>{t('billing.list.outstandingLabel')}</Text>
                    <Text style={styles.bannerValue}>
                      {formatMoney(data.totals.outstanding_total)}
                    </Text>
                    <Text style={styles.bannerMeta}>
                      {t('billing.list.outstandingMeta', {
                        count: data.totals.outstanding_count,
                        paid: formatMoney(data.totals.paid_total),
                      })}
                    </Text>
                  </View>
                </View>

                {data.invoices.length === 0 && (
                  <Card>
                    <EmptyState
                      icon="document-text"
                      tint="blue"
                      title={t('billing.list.emptyTitle')}
                      message={t('billing.list.emptyBody')}
                    />
                  </Card>
                )}

                {outstanding.length > 0 && (
                  <View>
                    <SectionHeader title={t('billing.list.sectionToPay')} />
                    <Card variant="flush">
                      {outstanding.map((i, idx) => (
                        <InvoiceRow
                          key={i.id}
                          invoice={i}
                          divider={idx < outstanding.length - 1}
                          onPress={() => navigation.navigate('PaymentRequestInvoice', { invoiceId: i.id })}
                        />
                      ))}
                    </Card>
                  </View>
                )}

                {settled.length > 0 && (
                  <View>
                    <SectionHeader title={t('billing.list.sectionHistory')} />
                    <Card variant="flush">
                      {settled.map((i, idx) => (
                        <InvoiceRow
                          key={i.id}
                          invoice={i}
                          divider={idx < settled.length - 1}
                          onPress={() => navigation.navigate('PaymentRequestInvoice', { invoiceId: i.id })}
                        />
                      ))}
                    </Card>
                  </View>
                )}
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

function InvoiceRow({
  invoice,
  divider,
  onPress,
}: {
  invoice: PortalInvoice;
  divider: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const badge = invoiceStatusBadge(invoice.status, t);
  return (
    <ListRow
      icon="document-text"
      tint={invoice.is_payable ? 'amber' : 'green'}
      title={invoice.invoice_number}
      meta={[
        formatDate(invoice.issued_at, '—'),
        invoice.is_payable
          ? t('billing.list.rowDue', { date: formatDate(invoice.due_at, '—') })
          : t('billing.list.rowSettled'),
      ]}
      value={formatMoney(invoice.is_payable ? invoice.balance : invoice.total_amount)}
      valueColor={invoice.is_payable ? colors.statusCritical : colors.textPrimary}
      trailing={<StatusBadge status={badge.label} tone={badge.tone} size="sm" />}
      onPress={onPress}
      divider={divider}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primaryDeep,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  bannerCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerBody: { flex: 1, minWidth: 0 },
  bannerLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textOnBrand,
  },
  bannerValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xl,
    color: colors.textOnBrand,
  },
  bannerMeta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textOnBrand,
    opacity: 0.85,
  },
});
