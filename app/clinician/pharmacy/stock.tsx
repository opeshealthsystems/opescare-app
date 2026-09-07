/**
 * Pharmacy desk — the shelf (`/clinician/pharmacy/stock`).
 *
 * `GET /mobile/pharmacy/stock?q=&low=1` — this facility's own inventory, with
 * quantity against reorder level and a unit price, searchable by medicine
 * name and filterable to the lines at or under their reorder level. Tapping a
 * line opens the adjustment sheet (`POST …/stock/{id}/adjust { delta, reason }`),
 * which writes a StockMovement the server keeps.
 *
 * Gated on `pharmacy_stock`: pharmacists AND the `medicine_stock` role hold it
 * (`lib/staffCapabilities.ts`, mirror of config/staff_capabilities.php); the
 * server refuses everyone else with 403 `role_forbidden`. `?low=1` opens the
 * screen on the low-stock filter — the desk's low-stock tile lands here.
 *
 * Searching the shelf is a search over MEDICINES the pharmacy stocks, not
 * over people; the no-enumeration rule is about patients and does not apply.
 *
 * i18n: `pharmacyDesk.*`, present in both locales.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Chip,
  EmptyState,
  ResultList,
  ScreenHeader,
  StaleNotice,
  spacing,
  typography,
  useDialog,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { LoadingBlock, SearchField, describeFailure } from '@/components/care/shared';
import { RoleGate } from '@/components/doctor/RoleGate';
import {
  isLowStock,
  useAdjustStock,
  useStock,
  type AdjustStockBody,
  type StockItem,
} from '@/lib/api/pharmacyDeskQueries';
import { DeskFailureState, StockRow, describeWriteFailure, medicineLabel } from '@/components/pharmacy/shared';
import { AdjustStockSheet } from '@/components/pharmacy/AdjustStockSheet';

const DEBOUNCE_MS = 350;

export default function StockScreen() {
  return (
    <RoleGate need={['pharmacy_stock']}>
      <StockScreenBody />
    </RoleGate>
  );
}

function StockScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const params = useLocalSearchParams<{ low?: string }>();

  const [low, setLow] = useState(params.low === '1' || params.low === 'true');
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');

  // Debounced: the query key is the settled term, so a keystroke does not
  // fire a request per character on a slow link.
  useEffect(() => {
    const handle = setTimeout(() => setQ(typed.trim()), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [typed]);

  const stock = useStock(q, low);
  const adjust = useAdjustStock();

  // ── Adjustment sheet ─────────────────────────────────────────────────
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const open = useCallback((item: StockItem) => {
    setProblem(null);
    setEditing(item);
  }, []);

  const close = useCallback(() => {
    if (adjust.isPending) return;
    setEditing(null);
    setProblem(null);
  }, [adjust.isPending]);

  const submit = useCallback(
    async (item: StockItem, body: AdjustStockBody) => {
      try {
        const updated = await adjust.mutateAsync({ id: item.id, body });
        setEditing(null);
        setProblem(null);
        dialog.alert(
          t('pharmacyDesk.adjust.doneTitle'),
          t('pharmacyDesk.adjust.doneBody', {
            medicine: medicineLabel(updated),
            delta: body.delta > 0 ? `+${body.delta}` : String(body.delta),
          }),
          'success',
        );
      } catch (e) {
        const f = describeWriteFailure(e, t('pharmacyDesk.adjust.checkHint'));
        if (f.kind === 'refused') {
          // Keep the sheet open: the pharmacist can fix what was refused.
          setProblem(f.message);
          return;
        }
        setEditing(null);
        dialog.alert(f.title, f.message, f.kind === 'unknownOutcome' ? 'warning' : 'critical');
        void stock.refetch();
      }
    },
    [adjust, dialog, stock, t],
  );

  const rows = stock.data ?? [];
  const lowCount = rows.filter((r) => isLowStock(r) === true).length;
  const refreshing = stock.isFetching && !stock.isPending;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      {/* Pushed from the desk for a pharmacist; a TAB ROOT for the stock-only
          `medicine_stock` role (the layout gives it a slot). Only the former
          has anywhere to go back to. */}
      <ScreenHeader
        title={t('pharmacyDesk.stock.title')}
        subtitle={t('pharmacyDesk.stock.subtitle')}
        showBack={router.canGoBack()}
        onBack={() => router.back()}
      />

      <View style={styles.controls}>
        <SearchField
          value={typed}
          onChangeText={setTyped}
          placeholder={t('pharmacyDesk.stock.searchPlaceholder')}
          accessibilityLabel={t('pharmacyDesk.stock.searchLabel')}
        />
        <View style={styles.chips}>
          <Chip
            label={t('pharmacyDesk.stock.filterAll')}
            selected={!low}
            onPress={() => setLow(false)}
          />
          <Chip
            label={t('pharmacyDesk.stock.filterLow')}
            icon="alert-triangle"
            selected={low}
            onPress={() => setLow(true)}
            count={low && stock.data ? rows.length : undefined}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void stock.refetch()} tintColor={colors.blue} />
        }
      >
        {stock.isError && stock.data !== undefined && (
          <StaleNotice
            message={describeFailure(stock.error).message}
            loadedAt={stock.dataUpdatedAt ? new Date(stock.dataUpdatedAt) : null}
            onRetry={() => void stock.refetch()}
            retrying={stock.isFetching}
          />
        )}

        {stock.isPending ? (
          <LoadingBlock label={t('pharmacyDesk.stock.loading')} />
        ) : stock.isError && stock.data === undefined ? (
          <Card variant="flush">
            <DeskFailureState error={stock.error} onRetry={() => void stock.refetch()} icon="archive" />
          </Card>
        ) : rows.length === 0 ? (
          <Card variant="flush">
            <EmptyState
              icon="archive"
              tint={low ? 'green' : 'blue'}
              title={
                low
                  ? t('pharmacyDesk.stock.emptyLowTitle')
                  : q
                    ? t('pharmacyDesk.stock.emptySearchTitle')
                    : t('pharmacyDesk.stock.emptyTitle')
              }
              message={
                low
                  ? t('pharmacyDesk.stock.emptyLowBody')
                  : q
                    ? t('pharmacyDesk.stock.emptySearchBody', { q })
                    : t('pharmacyDesk.stock.emptyBody')
              }
            />
          </Card>
        ) : (
          <>
            <Text style={styles.summary}>
              {low
                ? t('pharmacyDesk.stock.summaryLow', { count: rows.length })
                : lowCount > 0
                  ? t('pharmacyDesk.stock.summaryWithLow', { count: rows.length, low: lowCount })
                  : t('pharmacyDesk.stock.summary', { count: rows.length })}
            </Text>
            <ResultList>
              {rows.map((item) => (
                <Card key={item.id} variant="flush">
                  <StockRow item={item} divider={false} onPress={() => open(item)} />
                </Card>
              ))}
            </ResultList>
          </>
        )}

        <Text style={styles.footer}>{t('pharmacyDesk.stock.footer')}</Text>
      </ScrollView>

      <AdjustStockSheet
        item={editing}
        visible={editing !== null}
        busy={adjust.isPending}
        problem={problem}
        onClose={close}
        onSubmit={(item, body) => void submit(item, body)}
      />
      {dialog.element}
    </SafeAreaView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    controls: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingBottom: spacing.sm },
    chips: { flexDirection: 'row', gap: spacing.sm },
    content: { padding: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.md },
    summary: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    footer: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: spacing.md,
    },
  });
