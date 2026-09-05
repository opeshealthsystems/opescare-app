import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  Card,
  EmptyState,
  Icon,
  ListRow,
  ScreenHeader,
  SegmentedTabs,
  StatusBadge,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { Screen } from '../../components/ui/Screen';
import { DemoBanner, PAYMENT_TONE } from '../../components/payments/shared';
import {
  formatMinor,
  isSettled,
  usePaymentCapability,
  useInvoices,
  type Invoice,
} from '../../lib/api/paymentQueries';

/**
 * Payments — the bills a facility has raised against this patient.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS SCREEN EXISTS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The pay flow (`payments/[invoiceId]`) has been shipped and reachable by URL
 * only — which on a phone means not reachable at all. A patient could be sent
 * a deep link to one invoice and pay it, but could not ask the simplest
 * question a person asks about money: *what do I owe?* This is that list, and
 * it is the only thing that was missing between a built payment rail and a
 * usable one.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IT REFUSES TO IMPLY
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `GET /mobile/payments/methods` reports `simulated` — whether this host holds
 * real merchant credentials or is standing in for them. When it is simulated,
 * that is said once at the top, in the patient's language, before any amount
 * is shown. A screen that lists sums of money in FCFA and takes a phone number
 * looks exactly the same whether or not the money is real; the only honest
 * difference is saying so.
 *
 * The filter defaults to what is **outstanding**, because that is the question
 * being asked. It never hides anything: the count on every tab comes from the
 * same fetched list, so "Unpaid 0" is a visible, trustworthy zero rather than
 * an empty screen that might just be broken.
 */

type Filter = 'outstanding' | 'paid' | 'all';

export default function PaymentsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<Filter>('outstanding');

  const capability = usePaymentCapability();
  // Unfiltered on purpose: every tab's count comes from one list, so a zero is
  // a fact about the account rather than a fact about the current request.
  const invoices = useInvoices();

  const all = invoices.data ?? [];
  const outstanding = useMemo(() => all.filter((i) => !isSettled(i.status)), [all]);
  const settled = useMemo(() => all.filter((i) => isSettled(i.status)), [all]);

  const shown = filter === 'outstanding' ? outstanding : filter === 'paid' ? settled : all;

  const totalDueMinor = useMemo(
    () => outstanding.reduce((sum, i) => sum + i.amount_minor, 0),
    [outstanding],
  );

  const symbol = capability.data?.currency_symbol ?? 'FCFA';

  const onRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['payments'] });
  }, [queryClient]);

  const renderItem = useCallback(
    ({ item }: { item: Invoice }) => (
      <Card variant="flush" style={styles.rowCard}>
        <ListRow
          icon="receipt"
          tint={isSettled(item.status) ? 'green' : 'amber'}
          title={item.description}
          meta={[
            item.reference,
            // `expires_at` is when an UNPAID bill lapses; on a settled one the
            // date that matters is when it was paid.
            item.paid_at
              ? t('payments.successPaidAt', { date: fmtDate(item.paid_at) })
              : item.expires_at
                ? t('payments.dueBy', { date: fmtDate(item.expires_at) })
                : null,
          ]}
          trailing={
            <View style={styles.trailing}>
              {/* Pre-formatted by the server ("5 000 FCFA"). Its own contract
                  says render it, do not recompute it — a second money
                  formatter is a second set of rounding rules. */}
              <Text style={styles.amount}>{item.amount_display}</Text>
              {/* `status_label` arrives already in the patient's language. */}
              <StatusBadge
                status={item.status}
                tone={PAYMENT_TONE[item.status]}
                label={item.status_label}
                size="sm"
              />
            </View>
          }
          onPress={() => router.push(`/payments/${item.id}`)}
          accessibilityHint={t('payments.list.rowHint', {
            defaultValue: 'Opens this bill so you can pay it.',
          })}
        />
      </Card>
    ),
    [colors, router, styles, symbol, t],
  );

  // The host cannot take money at all — say that instead of an empty list.
  if (capability.isSuccess && !capability.data.available) {
    return (
      <Screen>
        <ScreenHeader title={t('payments.title')} onBack={() => router.back()} />
        <EmptyState
          icon="alert-circle"
          tint="amber"
          title={t('payments.unavailableTitle')}
          message={t('payments.unavailableBody')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={t('payments.title')} onBack={() => router.back()} />

      <FlatList
        data={shown}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={invoices.isFetching} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Said before any amount is shown, not after. */}
            {capability.data?.simulated ? <DemoBanner /> : null}

            {outstanding.length > 0 ? (
              <Card style={styles.hero}>
                <Text style={styles.heroLabel}>
                  {t('payments.list.outstandingLabel', { defaultValue: 'Outstanding' })}
                </Text>
                <Text style={styles.heroAmount}>{formatMinor(totalDueMinor, symbol)}</Text>
                <Text style={styles.heroMeta}>
                  {t('payments.list.outstandingCount', {
                    count: outstanding.length,
                    defaultValue: '{{count}} unpaid bill',
                  })}
                </Text>
              </Card>
            ) : null}

            <SegmentedTabs
              value={filter}
              onChange={(k) => setFilter(k as Filter)}
              options={[
                {
                  key: 'outstanding',
                  label: `${t('payments.list.tabOutstanding', { defaultValue: 'Unpaid' })} (${outstanding.length})`,
                },
                {
                  key: 'paid',
                  label: `${t('payments.list.tabSettled', { defaultValue: 'Settled' })} (${settled.length})`,
                },
                { key: 'all', label: `${t('payments.list.tabAll', { defaultValue: 'All' })} (${all.length})` },
              ]}
              scrollable
              style={styles.tabs}
            />
          </View>
        }
        ListEmptyComponent={
          invoices.isLoading ? (
            <View style={styles.centre}>
              <Icon name="receipt" size={28} color={colors.textMuted} />
              <Text style={styles.muted}>{t('payments.loading')}</Text>
            </View>
          ) : invoices.isError ? (
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={t('payments.loadError')}
              actionLabel={t('payments.retry')}
              onAction={onRefresh}
            />
          ) : (
            <EmptyState
              icon="receipt"
              tint="green"
              title={
                filter === 'outstanding'
                  ? t('payments.list.emptyOutstandingTitle', { defaultValue: 'Nothing to pay' })
                  : t('payments.list.emptyTitle', { defaultValue: 'No bills yet' })
              }
              message={
                filter === 'outstanding'
                  ? t('payments.list.emptyOutstandingBody', {
                      defaultValue: 'You have no unpaid bills. Anything a facility charges you will appear here.',
                    })
                  : t('payments.list.emptyBody', {
                      defaultValue: 'When a facility charges you for care, the bill appears here so you can pay it from your phone.',
                    })
              }
            />
          )
        }
      />
    </Screen>
  );
}

/** Short, locale-neutral day — the list needs a date, not a sentence. */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
    header: { gap: spacing.md, marginBottom: spacing.xs },
    hero: { gap: 2 },
    heroLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    heroAmount: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xxl,
      lineHeight: typography.lineHeight.xxl,
      color: colors.textPrimary,
      // Digits line up between the hero and the rows beneath it.
      fontVariant: ['tabular-nums'],
    },
    heroMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    tabs: { marginTop: spacing.xs },
    rowCard: { marginBottom: spacing.xs },
    // Amount over status, so a long description in the middle column keeps its
    // width on a 375px phone rather than being squeezed by a wide trailing.
    trailing: { alignItems: 'flex-end', gap: 4, minWidth: 0 },
    amount: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    centre: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
    muted: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textMuted,
    },
  });
