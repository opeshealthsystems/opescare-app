/**
 * The stock adjustment sheet — a signed delta and a reason, for ONE shelf line.
 *
 * `POST /mobile/pharmacy/stock/{id}/adjust { delta, reason }` writes a
 * StockMovement on the server; the returned row is the truth and replaces the
 * list's copy (`useAdjustStock`). Nothing here recomputes a quantity — the
 * "after" figure shown is a preview, labelled as such, and the row on the
 * shelf only changes when the server answers.
 *
 * The delta is a stepper plus a typed field so a count of 120 does not need
 * 120 taps; the sign is explicit (Add / Remove) because "−12" typed into a
 * bare field is the mistake this sheet exists to prevent. A reason is
 * required: a movement nobody can explain is a movement nobody can audit.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  Chip,
  Icon,
  PillInput,
  formatNumber,
  radii,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { CareButton } from '@/components/care/shared';
import { toNum, type AdjustStockBody, type StockItem } from '@/lib/api/pharmacyDeskQueries';
import { DeskSheet, Fact, deskMoney, medicineLabel } from './shared';

type Direction = 'add' | 'remove';

const REASON_MAX = 200;
const AMOUNT_MAX = 6; // digits

export function AdjustStockSheet({
  item,
  visible,
  busy,
  problem,
  onClose,
  onSubmit,
}: {
  item: StockItem | null;
  visible: boolean;
  /** True while the POST is in flight — the sheet locks. */
  busy: boolean;
  /** A refusal from the last attempt, shown under the form until the next edit. */
  problem: string | null;
  onClose: () => void;
  onSubmit: (item: StockItem, body: AdjustStockBody) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [direction, setDirection] = useState<Direction>('add');
  const [amount, setAmount] = useState('1');
  const [reason, setReason] = useState('');
  const [localProblem, setLocalProblem] = useState<string | null>(null);

  // A fresh item gets a fresh form.
  useEffect(() => {
    if (!visible) return;
    setDirection('add');
    setAmount('1');
    setReason('');
    setLocalProblem(null);
  }, [visible, item?.id]);

  const n = /^\d+$/.test(amount.trim()) ? Number(amount.trim()) : null;
  const delta = n === null ? null : direction === 'add' ? n : -n;
  const current = item ? toNum(item.quantity) : null;
  const preview = current !== null && delta !== null ? current + delta : null;
  const wouldGoNegative = preview !== null && preview < 0;

  const step = useCallback((by: number) => {
    setAmount((raw) => {
      const cur = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : 0;
      return String(Math.max(0, cur + by));
    });
    setLocalProblem(null);
  }, []);

  const submit = useCallback(() => {
    if (!item) return;
    if (n === null || n <= 0) {
      setLocalProblem(t('pharmacyDesk.adjust.amountRequired'));
      return;
    }
    if (wouldGoNegative) {
      setLocalProblem(t('pharmacyDesk.adjust.belowZero'));
      return;
    }
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setLocalProblem(t('pharmacyDesk.adjust.reasonRequired'));
      return;
    }
    setLocalProblem(null);
    onSubmit(item, { delta: delta as number, reason: trimmed });
  }, [delta, item, n, onSubmit, reason, t, wouldGoNegative]);

  const shownProblem = localProblem ?? problem;

  return (
    <DeskSheet
      visible={visible && !!item}
      title={t('pharmacyDesk.adjust.title')}
      onClose={onClose}
      busy={busy}
    >
      {item && (
        <>
          <View style={styles.head}>
            <Text style={styles.name}>{medicineLabel(item)}</Text>
            {!!item.form && <Text style={styles.form}>{item.form}</Text>}
          </View>

          <View style={styles.facts}>
            <Fact
              label={t('pharmacyDesk.adjust.onShelf')}
              value={current === null ? t('pharmacyDesk.stock.qtyUnknown') : formatNumber(current)}
              strong
            />
            <Fact
              label={t('pharmacyDesk.stock.reorderLevel')}
              value={
                toNum(item.reorder_level) === null
                  ? t('opesCore.common.notRecorded')
                  : formatNumber(toNum(item.reorder_level) as number)
              }
            />
            {!!deskMoney(item.unit_price, item.currency) && (
              <Fact
                label={t('pharmacyDesk.stock.unitPriceLabel')}
                value={deskMoney(item.unit_price, item.currency) as string}
              />
            )}
          </View>

          <Text style={styles.fieldLabel}>{t('pharmacyDesk.adjust.direction')}</Text>
          <View style={styles.chips}>
            <Chip
              label={t('pharmacyDesk.adjust.add')}
              icon="plus"
              selected={direction === 'add'}
              onPress={() => {
                setDirection('add');
                setLocalProblem(null);
              }}
            />
            <Chip
              label={t('pharmacyDesk.adjust.remove')}
              icon="minus"
              selected={direction === 'remove'}
              onPress={() => {
                setDirection('remove');
                setLocalProblem(null);
              }}
            />
          </View>

          <Text style={styles.fieldLabel}>{t('pharmacyDesk.adjust.amount')}</Text>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => step(-1)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('pharmacyDesk.adjust.stepDown')}
              style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
            >
              <Icon name="minus" size={20} color={colors.blue} />
            </Pressable>
            <View style={styles.stepField}>
              <PillInput
                value={amount}
                onChangeText={(v) => {
                  setAmount(v.replace(/[^\d]/g, '').slice(0, AMOUNT_MAX));
                  setLocalProblem(null);
                }}
                keyboardType="number-pad"
                maxLength={AMOUNT_MAX}
                accessibilityLabel={t('pharmacyDesk.adjust.amount')}
                style={styles.amountInput}
              />
            </View>
            <Pressable
              onPress={() => step(1)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('pharmacyDesk.adjust.stepUp')}
              style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]}
            >
              <Icon name="plus" size={20} color={colors.blue} />
            </Pressable>
          </View>

          <View style={styles.previewRow}>
            <Text style={styles.previewLabel}>{t('pharmacyDesk.adjust.preview')}</Text>
            <Text style={[styles.previewValue, wouldGoNegative && { color: colors.danger }]}>
              {preview === null
                ? '—'
                : `${formatNumber(current as number)} → ${formatNumber(preview)}`}
            </Text>
          </View>

          <Text style={styles.fieldLabel}>{t('pharmacyDesk.adjust.reasonLabel')}</Text>
          <PillInput
            icon={<Icon name="document-text" size={18} color={colors.blue} />}
            value={reason}
            onChangeText={(v) => {
              setReason(v);
              setLocalProblem(null);
            }}
            placeholder={t('pharmacyDesk.adjust.reasonPlaceholder')}
            multiline
            maxLength={REASON_MAX}
            style={styles.multiline}
            accessibilityLabel={t('pharmacyDesk.adjust.reasonLabel')}
          />

          {!!shownProblem && (
            <Text style={styles.problem} accessibilityRole="alert">
              {shownProblem}
            </Text>
          )}

          <Text style={styles.note}>{t('pharmacyDesk.adjust.audit')}</Text>

          <View style={styles.actions}>
            <CareButton
              label={t('pharmacyDesk.adjust.save')}
              icon="check"
              style={styles.action}
              onPress={submit}
              loading={busy}
              disabled={busy}
            />
            <CareButton
              label={t('opesCore.common.cancel')}
              variant="secondary"
              style={styles.action}
              onPress={onClose}
              disabled={busy}
            />
          </View>
        </>
      )}
    </DeskSheet>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    head: { gap: 2 },
    name: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    form: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    facts: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    fieldLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    chips: { flexDirection: 'row', gap: spacing.sm },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    stepButton: {
      width: 48,
      height: 48,
      borderRadius: radii.pill,
      borderWidth: 1.4,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.7 },
    stepField: { flex: 1, minWidth: 0, marginBottom: -spacing.md },
    amountInput: { textAlign: 'center', fontFamily: typography.fontFamily.bold, fontSize: typography.size.lg },
    previewRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: spacing.sm,
    },
    previewLabel: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    previewValue: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    multiline: { minHeight: 56, textAlignVertical: 'top' },
    problem: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.danger,
    },
    note: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    actions: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.xs },
    action: { flex: 1 },
  });
