/**
 * BILL-003 — Payment Receipt.
 *
 * Loads the receipt back from `GET /patient/receipts/{id}` (with the invoice it
 * settled), so the screen is reloadable and deep-linkable rather than showing
 * whatever BILL-002 happened to have in memory.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchReceipt, type PortalReceiptDetail } from '../../api';
import { Icon } from '../../components';
import { useTranslation } from '../../i18n';
import { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { currencyLabel, formatDate, formatMoney, formatTime } from '../../utils/format';
import {
  AsyncBoundary,
  Bubble,
  ChatButton,
  ChatHeader,
  DayChip,
  DetailRow,
  PillActions,
  SecureNote,
  TotalBand,
  useAsync,
} from '../chat/shared';
import { DocumentBanner, FacilityBlock, useDayLabel } from './parts';

export function PaymentReceiptScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'PaymentReceipt'>>();
  const { t } = useTranslation();
  const dayLabel = useDayLabel();
  const paymentId = params.paymentId;

  const state = useAsync<PortalReceiptDetail>(() => fetchReceipt(paymentId), [paymentId]);
  const { reload } = state;
  const receipt = state.data;

  return (
    <View style={styles.screen}>
      <ChatHeader
        compact
        name={receipt?.facility.name ?? t('billing.receipt.headerFallback')}
        subtitle={receipt?.facility.address ?? t('billing.receipt.headerSubtitle')}
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
        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel={t('billing.receipt.loading')}>
          {(data) => {
            const invoice = data.invoice;
            const paidFor = invoice?.items.map((i) => i.description).join(', ');
            return (
              <>
                <DayChip label={dayLabel(data.paid_at)} />

                <Bubble
                  mine={false}
                  senderName={data.facility.name}
                  body={t('billing.receipt.bubble')}
                  time={formatTime(data.paid_at)}
                  showAvatar={false}
                />

                <View style={styles.card}>
                  <DocumentBanner icon="receipt" title={t('billing.receipt.banner')} reference={data.receipt_number} />

                  <View style={styles.cardBody}>
                    <FacilityBlock
                      facility={data.facility}
                      left={{
                        label: t('billing.terms.dateIssued'),
                        value: formatDate(invoice?.issued_at, '—'),
                        icon: 'calendar',
                      }}
                      right={{
                        label: t('billing.terms.paymentDate'),
                        value: formatDate(data.paid_at, '—'),
                        icon: 'calendar',
                      }}
                    />

                    {!!paidFor && (
                      <View>
                        <View style={styles.bandHead}>
                          <Text style={styles.bandHeadText}>{t('billing.receipt.paymentFor')}</Text>
                        </View>
                        <Text style={styles.paidFor}>{paidFor}</Text>
                      </View>
                    )}

                    <View>
                      <View style={styles.bandHead}>
                        <Text style={styles.bandHeadText}>{t('billing.receipt.description')}</Text>
                        <Text style={styles.bandHeadText}>
                          {t('billing.terms.amountColumn', { currency: currencyLabel() })}
                        </Text>
                      </View>
                      {!!invoice && (
                        <DetailRow
                          label={t('billing.terms.totalInvoiceAmount')}
                          value={formatMoney(invoice.total_amount)}
                        />
                      )}
                      <DetailRow label={t('billing.terms.amountPaid')} value={formatMoney(data.amount)} />
                      {!!invoice && invoice.balance > 0 && (
                        <DetailRow
                          label={t('billing.terms.balanceRemaining')}
                          value={formatMoney(invoice.balance)}
                          valueColor={colors.statusCritical}
                        />
                      )}
                      <DetailRow
                        label={t('billing.terms.paymentMethod')}
                        value={data.method_label}
                        divider={!!data.reference}
                      />
                      {!!data.reference && (
                        <DetailRow
                          label={t('billing.receipt.reference')}
                          value={data.reference}
                          divider={false}
                        />
                      )}
                    </View>

                    <TotalBand label={t('billing.receipt.amountPaidBand')} value={formatMoney(data.amount)} />

                    <View style={styles.thanks}>
                      <Icon name="check-circle" size={22} color={colors.link} />
                      <View style={styles.thanksBody}>
                        <Text style={styles.thanksTitle}>{t('billing.receipt.thanksTitle')}</Text>
                        <Text style={styles.thanksText}>{t('billing.receipt.thanksLine1')}</Text>
                        <Text style={styles.thanksText}>{t('billing.receipt.thanksLine2')}</Text>
                      </View>
                    </View>

                    <View style={styles.validStrip}>
                      <Icon name="shield-check" size={22} color={colors.link} />
                      <View style={styles.validBody}>
                        <Text style={styles.validTitle}>{t('billing.receipt.validTitle')}</Text>
                        <Text style={styles.validText}>{t('billing.receipt.validBody')}</Text>
                      </View>
                    </View>

                    {!!invoice && (
                      <ChatButton
                        label={t('billing.terms.viewInvoice')}
                        icon="document-text"
                        variant="secondary"
                        onPress={() => navigation.navigate('PaymentRequestInvoice', { invoiceId: invoice.id })}
                      />
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

  bandHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.sm - 2,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 8,
  },
  bandHeadText: { fontFamily: typography.fontFamily.semiBold, fontSize: 12, letterSpacing: 0.5, color: colors.link },
  paidFor: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.md,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm + 2,
    paddingTop: spacing.sm,
  },

  thanks: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm + 2,
    padding: spacing.sm + 4,
  },
  thanksBody: { flex: 1, minWidth: 0 },
  thanksTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  thanksText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.md,
    color: colors.textSecondary,
  },

  validStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.sm + 2,
    padding: spacing.sm + 4,
  },
  validBody: { flex: 1, minWidth: 0 },
  validTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  validText: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: colors.textSecondary },
});
