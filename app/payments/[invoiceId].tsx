import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import i18n from '../../lib/i18n';
import {
  Card,
  EmptyState,
  GradientButton,
  Icon,
  PillInput,
  ScreenHeader,
  StatusBadge,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
  type StatusTone,
} from '@/components/opes-ui';
import { Screen } from '../../components/ui/Screen';
import {
  formatNationalNumber,
  looksLikeOperator,
  normaliseMsisdn,
  paymentError,
  useChargeStatus,
  useElapsedSeconds,
  useIdempotencyKey,
  useInvoice,
  usePaymentCapability,
  useStartPayment,
  type Charge,
  type PaymentMethod,
  type PaymentStatus,
} from '../../lib/api/paymentQueries';
import en from '../../lib/i18n/pending/payments.en.json';
import fr from '../../lib/i18n/pending/payments.fr.json';

/**
 * Pay an invoice with MTN Mobile Money or Orange Money.
 *
 * ── The four states this screen has, and why ───────────────────────────────
 *   choose  — pick a rail, type the wallet number, see the amount in FCFA
 *   confirm — the amount, the number and the rail, all on one line, once
 *   pending — "check your phone", polling, with a visible elapsed timer
 *   result  — paid (a receipt) / failed / expired, each with the right next step
 *
 * The confirm step is not ceremony. A mobile money PIN prompt arrives on the
 * handset with the amount already committed; the last chance a patient has to
 * notice they typed 50 000 instead of 5 000 is *before* the prompt is sent, and
 * the number they are paying from is worth showing back to them in full at that
 * moment too. So the confirm step restates all three facts and nothing else.
 *
 * ── What this screen deliberately does NOT do ──────────────────────────────
 *  - It never computes a currency. `amount_display` ("5 000 FCFA") is rendered
 *    exactly as the server sent it. A client that divides an amount by 100 is
 *    how a 5 000 franc bill becomes "50.00" — XAF has no minor unit.
 *  - It never invents an error message. `failure_reason` arrives already
 *    translated, because the server knows the patient's language and the real
 *    reason; a telco's own English string is never shown.
 *  - It never regenerates its idempotency key on a retry of the same attempt.
 *    The key is minted once, held in the hook, and reset ONLY when the patient
 *    starts a genuinely new attempt. That is the difference between "retry" and
 *    "charge them twice".
 *  - It never hides that this is a demo. When the server reports `simulated`,
 *    a banner says so on every step including the receipt.
 *
 * ── i18n ───────────────────────────────────────────────────────────────────
 * Strings live in `lib/i18n/pending/payments.{en,fr}.json` and are registered
 * into the running i18next instance below. They are "pending" a merge into
 * `lib/i18n/locales/{en,fr}.json`, which is owned elsewhere; registering them
 * here means the screen is fully bilingual today and the merge is a pure move
 * with no code change.
 *
 * ── UI ─────────────────────────────────────────────────────────────────────
 * OPES kit only: `<Icon>` for every glyph (Lucide is not used in this app), the
 * brand `#0F4C81` via palette tokens, no emoji, no hardcoded colour.
 */

// Register the pending bundles once, at module load, before the first render.
// `deep: false, overwrite: false` so a later merge into locales/*.json wins and
// this becomes a no-op rather than a conflict.
for (const [lng, bundle] of [['en', en], ['fr', fr]] as const) {
  i18n.addResourceBundle(lng, 'translation', bundle, true, false);
}

type Step = 'choose' | 'confirm' | 'pending' | 'result';

/** Kit glyphs for each rail. `wallet` and `phone` both exist in the kit. */
const METHOD_ICON: Record<PaymentMethod, IconName> = {
  mtn_momo: 'wallet',
  orange_money: 'phone',
};

const STATUS_TONE: Record<PaymentStatus, StatusTone> = {
  pending: 'pending',
  paid: 'normal',
  failed: 'critical',
  expired: 'critical',
  refunded: 'info',
};

export default function PayInvoiceScreen() {
  const { invoiceId } = useLocalSearchParams<{ invoiceId: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const invoiceQuery = useInvoice(invoiceId);
  const capability = usePaymentCapability();
  const startPayment = useStartPayment();
  const { key: idempotencyKey, reset: resetKey } = useIdempotencyKey();

  const [step, setStep] = useState<Step>('choose');
  const [method, setMethod] = useState<PaymentMethod>('mtn_momo');
  const [numberInput, setNumberInput] = useState('');
  const [numberError, setNumberError] = useState<string | null>(null);
  const [chargeId, setChargeId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const chargeQuery = useChargeStatus(chargeId ?? undefined);

  const invoice = invoiceQuery.data;
  const liveCharge = chargeQuery.data?.charge ?? null;
  const simulated = liveCharge?.simulated ?? invoice?.is_demo ?? capability.data?.simulated ?? false;

  const { national, valid } = normaliseMsisdn(numberInput);
  const prefixMismatch = valid && !looksLikeOperator(method, national);

  // Elapsed time on the prompt. Only ticks while genuinely waiting.
  const waiting = step === 'pending' && liveCharge?.status === 'pending';
  const elapsed = useElapsedSeconds(liveCharge?.requested_at, waiting);

  // A charge that has settled moves the screen on by itself — the patient may
  // be looking at their MoMo PIN prompt rather than at this screen when it
  // resolves, and coming back to a spinner would be wrong.
  useEffect(() => {
    if (liveCharge && liveCharge.status !== 'pending' && step === 'pending') {
      setStep('result');
    }
  }, [liveCharge, step]);

  // An invoice that was already paid (by another device, or before this screen
  // opened) goes straight to the receipt. Nothing is owed and nothing should be
  // payable.
  const alreadyPaid = invoice?.status === 'paid' || invoice?.status === 'refunded';

  const settledCharge: Charge | null =
    liveCharge ?? invoice?.charges?.find((c) => c.status === 'paid') ?? null;

  const submit = useCallback(() => {
    if (!invoice) return;

    setStartError(null);

    startPayment.mutate(
      {
        invoiceId: invoice.id,
        method,
        msisdn: national,
        // Echo the amount THIS SCREEN DISPLAYED. The server refuses the payment
        // if it is not the invoice's amount — a patient authorises an amount,
        // not an id.
        amountMinor: invoice.amount_minor,
        idempotencyKey,
      },
      {
        onSuccess: (charge) => {
          setChargeId(charge.id);
          setStep(charge.status === 'pending' ? 'pending' : 'result');
        },
        onError: (e) => {
          const { message, charge } = paymentError(e);

          // 409 payment_in_progress carries the in-flight charge, so the app
          // joins that payment rather than starting a second one.
          if (charge) {
            setChargeId(charge.id);
            setStep(charge.status === 'pending' ? 'pending' : 'result');

            return;
          }

          setStartError(message ?? t('payments.errors.generic'));
          setStep('choose');
        },
      },
    );
  }, [invoice, method, national, idempotencyKey, startPayment, t]);

  /** A genuinely new attempt: new key, back to the number entry. */
  const startOver = useCallback(() => {
    resetKey();
    setChargeId(null);
    setStartError(null);
    setStep('choose');
    void invoiceQuery.refetch();
  }, [resetKey, invoiceQuery]);

  // ── Loading / not found ───────────────────────────────────────────────────

  if (invoiceQuery.isLoading) {
    return (
      <Screen>
        <ScreenHeader title={t('payments.title')} onBack={() => router.back()} />
        <View style={styles.centred}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>{t('payments.loading')}</Text>
        </View>
      </Screen>
    );
  }

  if (invoiceQuery.isError || !invoice) {
    // A 404 here is the correct answer for another patient's invoice — the API
    // scopes every lookup to the bearer token — so it is presented as "not
    // found", not as a permission error.
    return (
      <Screen>
        <ScreenHeader title={t('payments.title')} onBack={() => router.back()} />
        <EmptyState
          icon="receipt"
          title={t('payments.notFound')}
          message={t('payments.notFoundBody')}
          actionLabel={t('payments.retry')}
          onAction={() => void invoiceQuery.refetch()}
        />
      </Screen>
    );
  }

  // ── Screen ────────────────────────────────────────────────────────────────

  return (
    <Screen className="px-0">
      <ScreenHeader
        title={step === 'result' && settledCharge?.status === 'paid' ? t('payments.successTitle') : t('payments.title')}
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {simulated ? <DemoBanner /> : null}

        <AmountCard invoice={invoice} />

        {alreadyPaid && step !== 'result' ? (
          <Card style={styles.block}>
            <View style={styles.rowCentre}>
              <Icon name="check-circle" size={20} color={colors.statusNormal} />
              <Text style={styles.blockTitle}>{t('payments.alreadyPaidTitle')}</Text>
            </View>
            <Text style={styles.muted}>
              {t('payments.alreadyPaidBody', { date: formatDateTime(invoice.paid_at) })}
            </Text>
          </Card>
        ) : null}

        {capability.data && !capability.data.available ? (
          <Card style={styles.block}>
            <View style={styles.rowCentre}>
              <Icon name="alert-triangle" size={20} color={colors.statusCritical} />
              <Text style={styles.blockTitle}>{t('payments.unavailableTitle')}</Text>
            </View>
            <Text style={styles.muted}>{t('payments.unavailableBody')}</Text>
          </Card>
        ) : null}

        {step === 'choose' && !alreadyPaid && capability.data?.available !== false ? (
          <ChooseStep
            method={method}
            onMethod={(m) => {
              setMethod(m);
              setNumberError(null);
            }}
            methodLabels={capability.data?.methods}
            value={numberInput}
            onChange={(v) => {
              setNumberInput(v);
              setNumberError(null);
              setStartError(null);
            }}
            error={numberError ?? startError}
            prefixMismatch={prefixMismatch}
            valid={valid}
            onContinue={() => {
              if (!valid) {
                setNumberError(t('payments.numberInvalid'));

                return;
              }
              setStep('confirm');
            }}
          />
        ) : null}

        {step === 'confirm' ? (
          <ConfirmStep
            amountDisplay={invoice.amount_display}
            method={method}
            methodLabel={labelForMethod(method, capability.data?.methods)}
            national={national}
            busy={startPayment.isPending}
            onBack={() => setStep('choose')}
            onPay={submit}
          />
        ) : null}

        {step === 'pending' ? (
          <PendingStep
            amountDisplay={invoice.amount_display}
            methodLabel={labelForMethod(method, capability.data?.methods)}
            masked={liveCharge?.payer_masked ?? `+237${national}`}
            elapsed={elapsed}
          />
        ) : null}

        {step === 'result' ? (
          <ResultStep
            charge={settledCharge}
            invoice={invoice}
            onRetry={startOver}
            onDone={() => router.back()}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/**
 * The demo banner.
 *
 * Present on every step, including the receipt. A simulated payment that looks
 * like a real one is worse than no payment screen at all: it ends up in a
 * screenshot, in a demo to a facility, or in a patient's memory as "I paid".
 */
function DemoBanner() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.demoBanner} accessibilityRole="alert">
      <Icon name="alert-triangle" size={18} color={colors.statusWarning} />
      <View style={styles.flex1}>
        <Text style={styles.demoTitle}>{t('payments.demoBanner')}</Text>
        <Text style={styles.demoBody}>{t('payments.demoBannerBody')}</Text>
      </View>
    </View>
  );
}

function AmountCard({ invoice }: { invoice: { amount_display: string; description: string; reference: string; status: PaymentStatus; status_label: string; expires_at: string | null } }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Card style={styles.amountCard}>
      <Text style={styles.amountLabel}>{t('payments.amountLabel')}</Text>
      {/* Rendered exactly as the server sent it. Never recomputed here. */}
      <Text style={styles.amount} accessibilityRole="header">
        {invoice.amount_display}
      </Text>
      <Text style={styles.description}>{invoice.description}</Text>
      <View style={styles.amountMeta}>
        <Text style={styles.reference}>{t('payments.reference', { reference: invoice.reference })}</Text>
        <StatusBadge
          status={invoice.status}
          tone={STATUS_TONE[invoice.status]}
          label={invoice.status_label}
          size="sm"
        />
      </View>
    </Card>
  );
}

function ChooseStep(props: {
  method: PaymentMethod;
  onMethod: (m: PaymentMethod) => void;
  methodLabels?: { value: PaymentMethod; label: string }[];
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  prefixMismatch: boolean;
  valid: boolean;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const methodLabel = labelForMethod(props.method, props.methodLabels);

  return (
    <View style={styles.block}>
      <Text style={styles.sectionTitle}>{t('payments.chooseMethod')}</Text>
      <Text style={styles.muted}>{t('payments.methodHint')}</Text>

      <View style={styles.methodRow}>
        {(['mtn_momo', 'orange_money'] as const).map((m) => {
          const selected = props.method === m;

          return (
            <TouchableOpacity
              key={m}
              style={[styles.methodTile, selected && styles.methodTileOn]}
              onPress={() => props.onMethod(m)}
              activeOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={labelForMethod(m, props.methodLabels)}
            >
              <Icon
                name={METHOD_ICON[m]}
                size={22}
                color={selected ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.methodLabel, selected && styles.methodLabelOn]} numberOfLines={2}>
                {labelForMethod(m, props.methodLabels)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.fieldLabel}>{t('payments.numberLabel')}</Text>
      <PillInput
        icon={<Icon name="phone" size={18} color={colors.blue} />}
        value={props.value}
        onChangeText={props.onChange}
        placeholder={t('payments.numberPlaceholder')}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        maxLength={20}
        error={props.error ?? undefined}
      />
      <Text style={styles.help}>{t('payments.numberHelp', { method: methodLabel })}</Text>

      {/* A prefix mismatch is a WARNING, never a block: number portability
          means a prefix is a hint, and a patient who ported their number must
          still be able to pay. */}
      {props.prefixMismatch ? (
        <View style={styles.warnRow} accessibilityRole="alert">
          <Icon name="info" size={16} color={colors.statusWarning} />
          <Text style={styles.warnText}>{t('payments.prefixWarning', { method: methodLabel })}</Text>
        </View>
      ) : null}

      <GradientButton
        label={t('payments.confirmTitle')}
        onPress={props.onContinue}
        disabled={!props.valid}
        style={styles.cta}
      />
    </View>
  );
}

function ConfirmStep(props: {
  amountDisplay: string;
  method: PaymentMethod;
  methodLabel: string;
  national: string;
  busy: boolean;
  onBack: () => void;
  onPay: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.block}>
      <Text style={styles.sectionTitle}>{t('payments.confirmTitle')}</Text>

      <Card style={styles.confirmCard}>
        {/* All three facts the patient is authorising, on one card, once. */}
        <ConfirmLine icon="wallet" label={t('payments.receiptMethod')} value={props.methodLabel} />
        <ConfirmLine icon="phone" label={t('payments.receiptNumber')} value={`+237 ${formatNationalNumber(props.national)}`} />
        <ConfirmLine icon="receipt" label={t('payments.amountLabel')} value={props.amountDisplay} emphasis />
      </Card>

      <Text style={styles.muted}>
        {t('payments.confirmBody', {
          amount: props.amountDisplay,
          number: `+237 ${formatNationalNumber(props.national)}`,
          method: props.methodLabel,
        })}
      </Text>

      <GradientButton
        label={t('payments.payAction', { amount: props.amountDisplay })}
        onPress={props.onPay}
        loading={props.busy}
        style={styles.cta}
        accessibilityHint={t('payments.methodHint')}
      />
      <TouchableOpacity onPress={props.onBack} style={styles.linkBtn} accessibilityRole="button">
        <Text style={styles.link}>{t('payments.back')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function ConfirmLine({ icon, label, value, emphasis }: { icon: IconName; label: string; value: string; emphasis?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.confirmLine}>
      <Icon name={icon} size={18} color={colors.textSecondary} />
      <Text style={styles.confirmLabel}>{label}</Text>
      <Text style={[styles.confirmValue, emphasis && styles.confirmValueStrong]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function PendingStep(props: { amountDisplay: string; methodLabel: string; masked: string; elapsed: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.block}>
      <Card style={styles.pendingCard}>
        <View style={styles.pendingIcon}>
          <Icon name="phone" size={30} color={colors.primary} />
        </View>
        <Text style={styles.resultTitle} accessibilityRole="header">
          {t('payments.pendingTitle')}
        </Text>
        <Text style={styles.resultBody}>
          {t('payments.pendingBody', {
            amount: props.amountDisplay,
            number: props.masked,
            method: props.methodLabel,
          })}
        </Text>

        <View style={styles.waitRow} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.waitText}>{t('payments.pendingWaiting')}</Text>
          {/* An unmoving spinner and a 90-second-old prompt look identical.
              The counter is what tells a patient to go check their handset. */}
          <Text style={styles.waitClock}>{t('payments.pendingElapsed', { seconds: props.elapsed })}</Text>
        </View>
      </Card>

      <Text style={styles.help}>{t('payments.pendingLeaveHint')}</Text>
    </View>
  );
}

function ResultStep(props: {
  charge: Charge | null;
  invoice: { amount_display: string; description: string; reference: string; paid_at: string | null };
  onRetry: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const status = props.charge?.status ?? 'failed';
  const paid = status === 'paid' || status === 'refunded';
  const expired = status === 'expired';

  return (
    <View style={styles.block}>
      <Card style={styles.pendingCard}>
        <View style={[styles.pendingIcon, paid ? styles.iconOk : styles.iconBad]}>
          <Icon
            name={paid ? 'check-circle' : expired ? 'clock' : 'x-circle'}
            size={30}
            color={paid ? colors.statusNormal : colors.statusCritical}
          />
        </View>

        <Text style={styles.resultTitle} accessibilityRole="header">
          {paid
            ? t('payments.successTitle')
            : expired
              ? t('payments.expiredTitle')
              : t('payments.failedTitle')}
        </Text>

        <Text style={styles.resultBody}>
          {paid
            ? t('payments.successBody', {
                amount: props.charge?.amount_display ?? props.invoice.amount_display,
                description: props.invoice.description,
              })
            : expired
              ? t('payments.expiredBody')
              : // Already translated by the server. Never a telco string.
                (props.charge?.failure_reason ?? t('payments.errors.generic'))}
        </Text>

        {paid && props.charge ? (
          <View style={styles.receipt}>
            <ConfirmLine icon="wallet" label={t('payments.receiptMethod')} value={props.charge.method_label} />
            <ConfirmLine icon="phone" label={t('payments.receiptNumber')} value={props.charge.payer_masked} />
            <ConfirmLine icon="receipt" label={t('payments.receiptReference')} value={props.invoice.reference} />
            <Text style={styles.paidAt}>
              {t('payments.successPaidAt', {
                date: formatDateTime(props.charge.settled_at ?? props.invoice.paid_at),
              })}
            </Text>
          </View>
        ) : null}
      </Card>

      {paid ? (
        <GradientButton label={t('payments.done')} onPress={props.onDone} icon="none" style={styles.cta} />
      ) : (
        <>
          {/* A new attempt, with a NEW idempotency key — this is the only place
              the key is allowed to change. */}
          <GradientButton label={t('payments.tryAgain')} onPress={props.onRetry} style={styles.cta} />
          <TouchableOpacity onPress={props.onDone} style={styles.linkBtn} accessibilityRole="button">
            <Text style={styles.link}>{t('payments.cancel')}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** The server's own label wins; the local fallback keeps the UI honest offline. */
function labelForMethod(method: PaymentMethod, options?: { value: PaymentMethod; label: string }[]): string {
  const fromServer = options?.find((o) => o.value === method)?.label;

  return fromServer ?? (method === 'mtn_momo' ? 'MTN Mobile Money' : 'Orange Money');
}

/** Locale-aware date+time, or an em dash when there is genuinely none. */
function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';

  return d.toLocaleString(i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
    centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    flex1: { flex: 1 },
    block: { gap: spacing.sm },
    rowCentre: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

    demoBanner: {
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.statusWarningBg,
      borderWidth: 1,
      borderColor: colors.statusWarning,
    },
    demoTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.statusWarning,
    },
    demoBody: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },

    amountCard: { alignItems: 'center', gap: 4, paddingVertical: spacing.lg },
    amountLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    amount: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xxl,
      color: colors.primary,
    },
    description: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    amountMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
    reference: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },

    sectionTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    blockTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    muted: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    help: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },

    methodRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
    methodTile: {
      flex: 1,
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.md,
      borderWidth: 1.4,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    methodTileOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    methodLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    methodLabelOn: { color: colors.primary, fontFamily: typography.fontFamily.semiBold },

    fieldLabel: {
      marginTop: spacing.sm,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },

    warnRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
      padding: spacing.sm,
      borderRadius: radii.sm,
      backgroundColor: colors.statusWarningBg,
    },
    warnText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },

    cta: { marginTop: spacing.md },
    linkBtn: { alignSelf: 'center', paddingVertical: spacing.sm },
    link: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.link,
    },

    confirmCard: { gap: spacing.sm },
    confirmLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    confirmLabel: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    confirmValue: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
      maxWidth: '55%',
      textAlign: 'right',
    },
    confirmValueStrong: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: colors.primary,
    },

    pendingCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
    pendingIcon: {
      width: 62,
      height: 62,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    iconOk: { backgroundColor: colors.statusNormalBg },
    iconBad: { backgroundColor: colors.statusCriticalBg },
    resultTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    resultBody: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    waitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.pill,
      backgroundColor: colors.surfaceMuted,
    },
    waitText: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    waitClock: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.primary,
    },

    receipt: {
      alignSelf: 'stretch',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      gap: spacing.sm,
    },
    paidAt: {
      marginTop: spacing.xs,
      textAlign: 'center',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
  });
