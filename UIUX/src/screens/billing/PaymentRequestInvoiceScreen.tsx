/**
 * BILL-001 — Payment Request / Invoice.
 *
 * `GET /patient/invoices/{id}` renders the whole card: the facility block, the
 * real line items, the payable total and the payment rails the server offers
 * (`payment_methods`, i.e. MTN MoMo / Orange Money / Card / Bank Transfer).
 * "Pay Now" hands the chosen rail to BILL-002, which owns the actual POST.
 */
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchInvoice, type PaymentMethodOption, type PortalInvoiceDetail } from '../../api';
import { Icon, IconName, iconNames, StatusBadge } from '../../components';
import { useTranslation } from '../../i18n';
import { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { currencyLabel, formatDate, formatMoney, formatNumber, formatTime } from '../../utils/format';
import {
  AsyncBoundary,
  Bubble,
  ChatButton,
  ChatHeader,
  DayChip,
  PillActions,
  SecureNote,
  TotalBand,
  useAsync,
} from '../chat/shared';
import { FacilityBlock, DocumentBanner, invoiceStatusBadge, useDayLabel } from './parts';

export function PaymentRequestInvoiceScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'PaymentRequestInvoice'>>();
  const { t } = useTranslation();
  const dayLabel = useDayLabel();
  const invoiceId = params.invoiceId;

  const state = useAsync<PortalInvoiceDetail>(() => fetchInvoice(invoiceId), [invoiceId]);
  const { reload, reloadIfStale } = state;
  const [method, setMethod] = useState<string | null>(null);

  // Coming back from a completed payment must show the settled invoice.
  useFocusEffect(
    useCallback(() => {
      reloadIfStale();
    }, [reloadIfStale])
  );

  const invoice = state.data;
  const selected = method ?? invoice?.payment_methods[0]?.code ?? null;

  return (
    <View style={styles.screen}>
      <ChatHeader
        compact
        name={invoice?.facility.name ?? t('billing.invoice.headerFallback')}
        subtitle={invoice?.facility.address}
        avatarIcon="building"
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Billing'))}
        onMore={() => navigation.navigate('Billing')}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={state.loading && state.data !== null} onRefresh={reload} tintColor={colors.blue} />
        }
      >
        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel={t('billing.invoice.loading')}>
          {(data) => {
            const payable = data.is_payable && data.balance > 0;
            const lastPayment = data.payments[data.payments.length - 1];
            return (
              <>
                <DayChip label={dayLabel(data.issued_at)} />

                <Bubble
                  mine={false}
                  senderName={data.facility.name}
                  body={data.notes ?? t('billing.invoice.bubble')}
                  time={formatTime(data.issued_at)}
                  showAvatar={false}
                />

                <View style={styles.card}>
                  <DocumentBanner
                    icon="document-text"
                    title={t('billing.invoice.banner')}
                    reference={data.invoice_number}
                  />

                  <View style={styles.cardBody}>
                    <FacilityBlock
                      facility={data.facility}
                      left={{
                        label: t('billing.terms.dateIssued'),
                        value: formatDate(data.issued_at, '—'),
                        icon: 'calendar',
                      }}
                      right={{
                        label: t('billing.terms.dueDate'),
                        value: formatDate(data.due_at, '—'),
                        icon: 'calendar',
                        overdue: !!data.due_at && new Date(data.due_at) < new Date() && payable,
                      }}
                    />

                    <View>
                      <View style={styles.tableHead}>
                        <Text style={[styles.th, styles.colDesc]}>{t('billing.invoice.colDescription')}</Text>
                        <Text style={[styles.th, styles.colQty]}>{t('billing.invoice.colQty')}</Text>
                        <Text style={[styles.th, styles.colUnit]}>
                          {t('billing.invoice.colUnit', { currency: currencyLabel() })}
                        </Text>
                        <Text style={[styles.th, styles.colTotal]}>
                          {t('billing.invoice.colTotal', { currency: currencyLabel() })}
                        </Text>
                      </View>
                      {data.items.map((item) => (
                        <View key={item.id} style={styles.tableRow}>
                          <Text style={[styles.td, styles.colDesc]}>{item.description}</Text>
                          <Text style={[styles.td, styles.colQty]}>{item.quantity}</Text>
                          <Text style={[styles.td, styles.colUnit]}>{formatNumber(item.unit_price)}</Text>
                          <Text style={[styles.td, styles.colTotal, styles.tdStrong]}>
                            {formatNumber(item.line_total)}
                          </Text>
                        </View>
                      ))}
                      {data.items.length === 0 && <Text style={styles.emptyItems}>{t('billing.invoice.noItems')}</Text>}
                    </View>

                    <TotalBand label={t('billing.invoice.totalPayable')} value={formatMoney(data.total_amount)} />

                    {data.amount_paid > 0 && (
                      <View style={styles.settledRow}>
                        <Text style={styles.settledLabel}>{t('billing.invoice.alreadyPaid')}</Text>
                        <Text style={styles.settledValue}>{formatMoney(data.amount_paid)}</Text>
                      </View>
                    )}
                    {payable && data.amount_paid > 0 && (
                      <View style={styles.settledRow}>
                        <Text style={styles.settledLabel}>{t('billing.invoice.balanceRemaining')}</Text>
                        <Text style={[styles.settledValue, styles.balance]}>
                          {formatMoney(data.balance)}
                        </Text>
                      </View>
                    )}

                    {!!data.notes && (
                      <View style={styles.noteStrip}>
                        <Icon name="info" size={20} color={colors.link} />
                        <Text style={styles.noteText}>{data.notes}</Text>
                      </View>
                    )}

                    {payable ? (
                      <>
                        <View style={styles.methodsHead}>
                          <Icon name="credit-card" size={18} color={colors.link} />
                          <Text style={styles.methodsTitle}>{t('billing.invoice.paymentMethods')}</Text>
                        </View>
                        <View style={styles.methodsRow}>
                          {data.payment_methods.map((m) => (
                            <MethodTile
                              key={m.code}
                              method={m}
                              selected={selected === m.code}
                              onPress={() => setMethod(m.code)}
                            />
                          ))}
                        </View>
                        <ChatButton
                          label={t('billing.invoice.payNow', { amount: formatMoney(data.balance) })}
                          icon="lock"
                          disabled={!selected}
                          onPress={() =>
                            navigation.navigate('PaymentProcessingStatus', {
                              invoiceId: data.id,
                              methodCode: selected as string,
                            })
                          }
                        />
                        <ChatButton
                          label={t('billing.invoice.viewAllInvoices')}
                          icon="document-text"
                          variant="secondary"
                          onPress={() => navigation.navigate('Billing')}
                        />
                      </>
                    ) : (
                      <>
                        <View style={styles.paidRow}>
                          <StatusBadge
                            status={invoiceStatusBadge(data.status, t).label}
                            tone={invoiceStatusBadge(data.status, t).tone}
                            icon="check-circle"
                          />
                          <Text style={styles.paidText}>
                            {data.status === 'paid'
                              ? t('billing.invoice.settledInFull')
                              : t('billing.invoice.notPayable')}
                          </Text>
                        </View>
                        {!!lastPayment && (
                          <ChatButton
                            label={t('billing.terms.viewReceipt')}
                            icon="receipt"
                            variant="secondary"
                            onPress={() => navigation.navigate('PaymentReceipt', { paymentId: lastPayment.id })}
                          />
                        )}
                      </>
                    )}

                    <SecureNote text={t('billing.terms.secureNote')} />
                  </View>
                </View>

                <PillActions
                  actions={[
                    {
                      icon: 'list',
                      label: t('billing.terms.allInvoices'),
                      onPress: () => navigation.navigate('Billing'),
                    },
                    {
                      icon: 'clock',
                      label: t('billing.terms.paymentHistory'),
                      onPress: () => navigation.navigate('Billing'),
                    },
                    {
                      icon: 'headset',
                      label: t('billing.terms.needHelp'),
                      onPress: () => navigation.navigate('NewMessage'),
                    },
                  ]}
                />
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

/** One selectable payment rail. The glyph comes from the `payment_methods` row. */
function MethodTile({
  method,
  selected,
  onPress,
}: {
  method: PaymentMethodOption;
  selected: boolean;
  onPress: () => void;
}) {
  const glyph = (iconNames as string[]).includes(method.icon ?? '') ? (method.icon as IconName) : 'wallet';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.method, selected && styles.methodSelected]}
    >
      <View style={[styles.methodCircle, selected && styles.methodCircleSelected]}>
        <Icon name={glyph} size={20} color={selected ? colors.textOnBrand : colors.link} />
      </View>
      <Text style={styles.methodLabel} numberOfLines={2}>
        {method.label}
      </Text>
      {!!method.hint && (
        <Text style={styles.methodHint} numberOfLines={1}>
          {method.hint}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm + 4, paddingBottom: spacing.xxl },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardBody: { padding: spacing.md - 2, gap: spacing.sm + 4 },

  tableHead: {
    flexDirection: 'row',
    backgroundColor: colors.primarySoft,
    borderTopLeftRadius: radii.sm,
    borderTopRightRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  th: { fontFamily: typography.fontFamily.semiBold, fontSize: 10, letterSpacing: 0.3, color: colors.link },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  td: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textPrimary },
  tdStrong: { fontFamily: typography.fontFamily.semiBold },
  colDesc: { flex: 1, minWidth: 0 },
  colQty: { width: 34, textAlign: 'center' },
  colUnit: { width: 74, textAlign: 'right' },
  colTotal: { width: 80, textAlign: 'right' },
  emptyItems: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
  },

  settledRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settledLabel: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.sm, color: colors.textSecondary },
  settledValue: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.textPrimary },
  balance: { color: colors.statusCritical },

  noteStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm + 2,
    padding: spacing.sm + 4,
  },
  noteText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.md,
    color: colors.textPrimary,
  },

  methodsHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  methodsTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 13,
    letterSpacing: 0.6,
    color: colors.link,
  },
  methodsRow: { flexDirection: 'row', gap: spacing.sm },
  method: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm + 2,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: 6,
  },
  methodSelected: { borderColor: colors.blue, backgroundColor: colors.primarySoft },
  methodCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.tintBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodCircleSelected: { backgroundColor: colors.blue },
  methodLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  methodHint: { fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.textSecondary },

  paidRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  paidText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
});
