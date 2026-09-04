/**
 * BILL-002 — Payment Processing Status.
 *
 * This screen owns the `POST /patient/invoices/{id}/pay` call, so "Processing"
 * is literally the request being in flight — there is no timed animation. When
 * the API answers the screen swaps to the completed status card the reference
 * shows; when it refuses (already paid, cancelled, amount too large) it shows
 * the real problem detail with a retry.
 *
 * Opened with `{ paymentId }` instead, it simply loads a completed payment.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  fetchReceipt,
  payInvoice,
  type PortalInvoiceDetail,
  type PortalReceiptDetail,
} from '../../api';
import { Icon, StatusBadge } from '../../components';
import { useTranslation } from '../../i18n';
import { isOutcomeUnknown, patientErrorMessage } from '../../lib/errors';
import { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { formatDate, formatDateTime, formatMoney, formatTime } from '../../utils/format';
import {
  Bubble,
  ChatButton,
  ChatHeader,
  DayChip,
  DetailRow,
  PillActions,
  SecureNote,
} from '../chat/shared';
import { DocumentBanner, FacilityBlock, useDayLabel } from './parts';

/** What the screen shows, derived only from the request lifecycle. */
type Phase = 'processing' | 'completed' | 'failed';

type Settled = {
  receiptId: string;
  receiptNumber: string;
  amount: number;
  currency: string;
  methodLabel: string;
  reference: string | null;
  paidAt: string | null;
  invoice: PortalInvoiceDetail | null;
  facility: { name: string; address: string; phone: string | null; email: string | null } | null;
};

export function PaymentProcessingStatusScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'PaymentProcessingStatus'>>();
  const { t } = useTranslation();
  const dayLabel = useDayLabel();

  const [phase, setPhase] = useState<Phase>('processing');
  const [settled, setSettled] = useState<Settled | null>(null);
  const [error, setError] = useState<string | null>(null);
  // True only when the request left the phone but no outcome came back (a
  // timeout / 5xx): the banner must then assert neither failure nor success.
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // A payment must never be submitted twice by a re-render or a double tap.
  const inFlight = useRef(false);

  // The idempotency key is generated ONCE per payment attempt and reused on
  // every Retry, so the server dedupes a re-POST after a lost response instead
  // of charging twice. It is held in a ref (not state) so it survives the
  // re-renders a retry triggers, and is only regenerated for a genuinely
  // different payment (a different invoice or rail) — never on Retry.
  const idemKeyRef = useRef<string | null>(null);
  const idemSigRef = useRef<string | null>(null);
  const paymentKey = useCallback((invoiceId: string, methodCode: string) => {
    const sig = `${invoiceId}:${methodCode}`;
    if (idemKeyRef.current === null || idemSigRef.current !== sig) {
      idemSigRef.current = sig;
      idemKeyRef.current = `pay_${invoiceId}_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;
    }
    return idemKeyRef.current;
  }, []);

  const run = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase('processing');
    setError(null);
    setOutcomeUnknown(false);
    try {
      if (params.paymentId) {
        const receipt: PortalReceiptDetail = await fetchReceipt(params.paymentId);
        setSettled({
          receiptId: receipt.id,
          receiptNumber: receipt.receipt_number,
          amount: receipt.amount,
          currency: receipt.currency,
          methodLabel: receipt.method_label,
          reference: receipt.reference,
          paidAt: receipt.paid_at,
          invoice: receipt.invoice,
          facility: receipt.facility,
        });
      } else if (params.invoiceId && params.methodCode) {
        const result = await payInvoice(
          params.invoiceId,
          { method: params.methodCode },
          paymentKey(params.invoiceId, params.methodCode)
        );
        setSettled({
          receiptId: result.receipt.id,
          receiptNumber: result.receipt.receipt_number,
          amount: result.receipt.amount,
          currency: result.receipt.currency,
          methodLabel: result.receipt.method_label,
          reference: result.receipt.reference,
          paidAt: result.receipt.paid_at,
          invoice: result.invoice,
          facility: result.invoice.facility,
        });
      } else {
        throw new Error(t('billing.status.missingInvoice'));
      }
      setPhase('completed');
    } catch (e) {
      // The old copy asserted "No money has left your account" on every
      // failure. On a timeout the payment may well have gone through, so the
      // app says what it actually knows and where the patient can check.
      //
      // `writeFailureMessage` composes its own English sentence around the
      // hint, which would render half-French; the unknown-outcome copy is
      // therefore one whole translated string here. It must keep saying that
      // the outcome could NOT be confirmed — never that the money is safe.
      const unknown = isOutcomeUnknown(e);
      setOutcomeUnknown(unknown);
      setError(unknown ? t('billing.status.unconfirmed') : patientErrorMessage(e, t('billing.status.fallback')));
      setPhase('failed');
    } finally {
      inFlight.current = false;
    }
  }, [params.paymentId, params.invoiceId, params.methodCode, paymentKey, t]);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const invoice = settled?.invoice ?? null;
  const facility = settled?.facility ?? null;

  return (
    <View style={styles.screen}>
      <ChatHeader
        compact
        name={facility?.name ?? t('billing.status.headerFallback')}
        subtitle={facility?.address ?? t('billing.status.headerSubtitle')}
        avatarIcon="building"
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Billing'))}
        onMore={() => navigation.navigate('Billing')}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <DayChip label={dayLabel(settled?.paidAt ?? new Date().toISOString())} />

        <Bubble
          mine={false}
          senderName={facility?.name ?? 'OPES EMR'}
          body={
            phase === 'processing'
              ? t('billing.status.bubbleProcessing')
              : phase === 'failed'
                ? t('billing.status.bubbleFailed')
                : t('billing.status.bubbleCompleted')
          }
          time={formatTime(settled?.paidAt ?? new Date().toISOString())}
          showAvatar={false}
        />

        {phase === 'processing' && (
          <View style={styles.card}>
            <DocumentBanner
              icon="clock"
              title={t('billing.status.banner')}
              reference={t('billing.status.refProcessing')}
            />
            <View style={styles.cardBody}>
              <View style={styles.processing}>
                <ActivityIndicator size="large" color={colors.blue} />
                <Text style={styles.processingTitle}>{t('billing.status.processingTitle')}</Text>
                <Text style={styles.processingText}>{t('billing.status.processingBody')}</Text>
              </View>
              <SecureNote />
            </View>
          </View>
        )}

        {phase === 'failed' && (
          <View style={styles.card}>
            <DocumentBanner
              icon={outcomeUnknown ? 'alert-triangle' : 'alert-circle'}
              title={t('billing.status.banner')}
              reference={
                outcomeUnknown
                  ? t('billing.status.refUnconfirmed')
                  : t('billing.status.refNotCompleted')
              }
            />
            <View style={styles.cardBody}>
              <View
                style={[
                  styles.statusBanner,
                  outcomeUnknown ? styles.statusBannerUnknown : styles.statusBannerFailed,
                ]}
              >
                <View
                  style={[
                    styles.statusCircle,
                    outcomeUnknown ? styles.statusCircleUnknown : styles.statusCircleFailed,
                  ]}
                >
                  <Icon
                    name={outcomeUnknown ? 'alert-triangle' : 'close'}
                    size={22}
                    color={colors.textOnBrand}
                    strokeWidth={2.4}
                  />
                </View>
                <View style={styles.statusBody}>
                  <Text
                    style={[
                      styles.statusTitle,
                      outcomeUnknown ? styles.statusTitleUnknown : styles.statusTitleFailed,
                    ]}
                  >
                    {outcomeUnknown
                      ? t('billing.status.unconfirmedTitle')
                      : t('billing.status.failedTitle')}
                  </Text>
                  <Text style={styles.statusText}>{error}</Text>
                </View>
              </View>
              <ChatButton
                label={t('common.retry')}
                icon="refresh"
                onPress={() => setAttempt((a) => a + 1)}
              />
              <ChatButton
                label={t('billing.status.backToInvoice')}
                icon="document-text"
                variant="secondary"
                onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Billing'))}
              />
              <SecureNote />
            </View>
          </View>
        )}

        {phase === 'completed' && !!settled && (
          <>
            <View style={styles.card}>
              <DocumentBanner
                icon="clipboard"
                title={t('billing.status.banner')}
                reference={settled.receiptNumber}
              />
              <View style={styles.cardBody}>
                {!!facility && (
                  <FacilityBlock
                    facility={facility}
                    left={{
                      label: t('billing.terms.paymentDate'),
                      value: formatDate(settled.paidAt, '—'),
                      icon: 'calendar',
                    }}
                    right={
                      settled.reference
                        ? {
                            label: t('billing.terms.paymentReference'),
                            value: settled.reference,
                            icon: 'document-text',
                          }
                        : undefined
                    }
                  />
                )}

                <View style={styles.statusBanner}>
                  <View style={styles.statusCircle}>
                    <Icon name="check" size={22} color={colors.textOnBrand} strokeWidth={2.4} />
                  </View>
                  <View style={styles.statusBody}>
                    <Text style={styles.statusTitle}>{t('billing.status.successTitle')}</Text>
                    <Text style={styles.statusText}>{t('billing.status.successBody')}</Text>
                  </View>
                  <StatusBadge status={t('billing.status.completed')} tone="normal" size="sm" />
                </View>

                <View>
                  {!!invoice && (
                    <DetailRow
                      label={t('billing.terms.totalInvoiceAmount')}
                      value={formatMoney(invoice.total_amount)}
                      bold
                    />
                  )}
                  <DetailRow label={t('billing.terms.amountPaid')} value={formatMoney(settled.amount)} bold />
                  {!!invoice && (
                    <DetailRow
                      label={t('billing.terms.balanceRemaining')}
                      value={formatMoney(invoice.balance)}
                      valueColor={invoice.balance > 0 ? colors.statusCritical : colors.statusNormal}
                      bold
                    />
                  )}
                  <DetailRow
                    label={t('billing.terms.paymentMethod')}
                    value={settled.methodLabel}
                    divider={false}
                  />
                </View>

                <View style={styles.paidBand}>
                  <Text style={styles.paidBandLabel}>{t('billing.status.paymentStatus')}</Text>
                  <View style={styles.paidBandRight}>
                    <Text style={styles.paidBandValue}>
                      {invoice && invoice.balance > 0
                        ? t('billing.status.partiallyPaid')
                        : t('billing.status.paidInFull')}
                    </Text>
                    <Icon name="check-circle" size={18} color={colors.statusNormal} />
                  </View>
                </View>

                <View style={styles.transaction}>
                  <Text style={styles.transactionTitle}>{t('billing.status.transactionDetails')}</Text>
                  <DetailRow label={t('billing.status.transactionId')} value={settled.receiptId} />
                  <DetailRow
                    label={t('billing.status.paymentDateTime')}
                    value={formatDateTime(settled.paidAt, '—')}
                  />
                  <DetailRow label={t('billing.status.paymentChannel')} value={settled.methodLabel} />
                  <DetailRow label={t('billing.status.receiptNumber')} value={settled.receiptNumber} />
                  {!!invoice && (
                    <DetailRow label={t('billing.status.invoiceLabel')} value={invoice.invoice_number} />
                  )}
                  <DetailRow
                    label={t('billing.status.statusLabel')}
                    value={t('billing.status.completed')}
                    valueColor={colors.statusNormal}
                    divider={false}
                  />
                </View>

                <View style={styles.help}>
                  <View style={styles.helpCircle}>
                    <Icon name="headset" size={20} color={colors.link} />
                  </View>
                  <View style={styles.helpBody}>
                    <Text style={styles.helpTitle}>{t('billing.status.helpTitle')}</Text>
                    <Text style={styles.helpText}>
                      {t('billing.status.helpBody', {
                        facility: facility?.name ?? t('billing.status.helpFacilityFallback'),
                      })}
                    </Text>
                  </View>
                </View>

                <ChatButton
                  label={t('billing.terms.viewReceipt')}
                  icon="receipt"
                  variant="secondary"
                  onPress={() => navigation.navigate('PaymentReceipt', { paymentId: settled.receiptId })}
                />
                <SecureNote text={t('billing.terms.secureNote')} />
              </View>
            </View>

            <PillActions
              actions={[
                {
                  icon: 'document-text',
                  label: t('billing.terms.viewInvoice'),
                  onPress: () =>
                    invoice
                      ? navigation.navigate('PaymentRequestInvoice', { invoiceId: invoice.id })
                      : navigation.navigate('Billing'),
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
        )}
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

  processing: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  processingTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  processingText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.md,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },

  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    backgroundColor: colors.statusNormalBg,
    borderRadius: radii.sm + 2,
    padding: spacing.sm + 4,
  },
  statusBannerFailed: { backgroundColor: colors.statusCriticalBg },
  statusBannerUnknown: { backgroundColor: colors.statusWarningBg },
  statusCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.statusNormal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCircleFailed: { backgroundColor: colors.statusCritical },
  statusCircleUnknown: { backgroundColor: colors.statusWarning },
  statusBody: { flex: 1, minWidth: 0 },
  statusTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.md,
    letterSpacing: 0.3,
    color: colors.statusNormal,
  },
  statusTitleFailed: { color: colors.statusCritical },
  statusTitleUnknown: { color: colors.statusWarning },
  statusText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
    marginTop: 1,
  },

  paidBand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.statusNormal,
    borderRadius: radii.sm + 2,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm + 4,
  },
  paidBandLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  paidBandRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  paidBandValue: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.statusNormal,
  },

  transaction: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm + 2,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
  },
  transactionTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 13,
    letterSpacing: 0.6,
    color: colors.link,
    marginBottom: 2,
  },

  help: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.sm + 2,
    padding: spacing.sm + 4,
  },
  helpCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpBody: { flex: 1, minWidth: 0 },
  helpTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  helpText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },
});
