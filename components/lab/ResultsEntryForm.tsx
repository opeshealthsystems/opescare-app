/**
 * Results entry — the form behind "Enter results" on one lab order.
 *
 * Rows are added parameter by parameter. The laboratory's own reference
 * intervals for this test (`reference_ranges` on the order detail) are offered
 * as one-tap suggestions that pre-fill the parameter name, its unit and its
 * printed interval; anything can still be typed by hand. Each row carries a
 * value, an optional unit, an optional reference range, an optional flag
 * (H / L / N / C) and optional notes.
 *
 * THE FLAG IS THE TECHNICIAN'S CALL. This form never derives one from the
 * value: a reference interval is a suggestion for the printed range, not a
 * threshold the phone applies. A row saved without a flag is saved without a
 * flag, and the results table then says "no flag" rather than "normal".
 *
 * Submitting posts ONLY what was entered here (`onSubmit(rows)`); the parent
 * owns the request and the failure dialog. Nothing is saved until the parent
 * says so.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Card,
  Chip,
  Icon,
  PillInput,
  SectionHeader,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { CareButton } from '@/components/care/shared';
import {
  LAB_FLAGS,
  formatReferenceRange,
  type LabFlag,
  type LabReferenceRange,
  type LabResultInput,
} from '@/lib/api/labDeskQueries';
import { FieldLabel, flagLabel, useLabT } from './shared';

/** Field caps — generous for a lab value, tight enough to refuse a pasted report. */
export const RESULT_LIMITS = {
  parameter: 120,
  value: 60,
  unit: 30,
  range: 60,
  notes: 500,
  rows: 40,
} as const;

type DraftRow = {
  key: number;
  parameter_name: string;
  value: string;
  unit: string;
  reference_range: string;
  flag: LabFlag | null;
  notes: string;
};

type RowError = { parameter?: string; value?: string };

let nextKey = 1;
const blankRow = (seed?: Partial<DraftRow>): DraftRow => ({
  key: nextKey++,
  parameter_name: '',
  value: '',
  unit: '',
  reference_range: '',
  flag: null,
  notes: '',
  ...seed,
});

export function ResultsEntryForm({
  referenceRanges,
  existingParameters,
  busy,
  onSubmit,
  onCancel,
}: {
  referenceRanges: LabReferenceRange[];
  /** Parameters already resulted on this order — not suggested again. */
  existingParameters: string[];
  busy?: boolean;
  onSubmit: (rows: LabResultInput[]) => Promise<void> | void;
  onCancel: () => void;
}) {
  const tx = useLabT();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [rows, setRows] = useState<DraftRow[]>(() => [blankRow()]);
  const [errors, setErrors] = useState<Record<number, RowError>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const taken = useMemo(() => {
    const set = new Set(existingParameters.map((p) => p.trim().toLowerCase()));
    for (const r of rows) if (r.parameter_name.trim()) set.add(r.parameter_name.trim().toLowerCase());
    return set;
  }, [existingParameters, rows]);

  const suggestions = referenceRanges.filter(
    (r) => r.parameter_name && !taken.has(r.parameter_name.trim().toLowerCase())
  );

  function update(key: number, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: {} }));
    if (formError) setFormError(null);
  }

  function remove(key: number) {
    setRows((prev) => (prev.length === 1 ? [blankRow()] : prev.filter((r) => r.key !== key)));
  }

  function addBlank() {
    if (rows.length >= RESULT_LIMITS.rows) return;
    setRows((prev) => [...prev, blankRow()]);
  }

  /** A suggestion fills the FIRST empty row if there is one, else appends. */
  function addSuggested(range: LabReferenceRange) {
    if (rows.length >= RESULT_LIMITS.rows) return;
    const seed = {
      parameter_name: range.parameter_name,
      unit: range.unit ?? '',
      reference_range: formatReferenceRange(range) ?? '',
    };
    setRows((prev) => {
      const empty = prev.find((r) => !r.parameter_name.trim() && !r.value.trim());
      if (empty) return prev.map((r) => (r.key === empty.key ? { ...r, ...seed } : r));
      return [...prev, blankRow(seed)];
    });
  }

  async function submit() {
    const nextErrors: Record<number, RowError> = {};
    const payload: LabResultInput[] = [];
    for (const r of rows) {
      const parameter = r.parameter_name.trim();
      const value = r.value.trim();
      const e: RowError = {};
      if (!parameter) e.parameter = tx('entry.parameterRequired');
      if (!value) e.value = tx('entry.valueRequired');
      if (e.parameter || e.value) {
        nextErrors[r.key] = e;
        continue;
      }
      payload.push({
        parameter_name: parameter,
        value,
        ...(r.unit.trim() ? { unit: r.unit.trim() } : {}),
        ...(r.reference_range.trim() ? { reference_range: r.reference_range.trim() } : {}),
        ...(r.flag ? { flag: r.flag } : {}),
        ...(r.notes.trim() ? { notes: r.notes.trim() } : {}),
      });
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setFormError(tx('entry.fixRows'));
      return;
    }
    if (payload.length === 0) {
      setFormError(tx('entry.nothingToSave'));
      return;
    }
    setErrors({});
    setFormError(null);
    await onSubmit(payload);
  }

  return (
    <View style={styles.wrap}>
      <SectionHeader title={tx('entry.title')} />

      {suggestions.length > 0 && (
        <Card>
          <FieldLabel>{tx('entry.suggestedLabel')}</FieldLabel>
          <View style={styles.chips}>
            {suggestions.map((r) => (
              <Chip
                key={r.parameter_name}
                label={r.parameter_name}
                icon="plus"
                onPress={() => addSuggested(r)}
                accessibilityHint={tx('entry.suggestedHint')}
              />
            ))}
          </View>
          <Text style={styles.hint}>{tx('entry.suggestedHint')}</Text>
        </Card>
      )}

      {rows.map((row, index) => (
        <Card key={row.key}>
          <View style={styles.rowHead}>
            <Text style={styles.rowTitle}>{tx('entry.rowTitle', { n: index + 1 })}</Text>
            <TouchableOpacity
              onPress={() => remove(row.key)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={tx('entry.removeRow', { n: index + 1 })}
            >
              <Icon name="trash" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <FieldLabel>{tx('entry.parameterLabel')}</FieldLabel>
          <PillInput
            icon={<Icon name="flask" size={18} color={colors.blue} />}
            value={row.parameter_name}
            onChangeText={(v) => update(row.key, { parameter_name: v })}
            placeholder={tx('entry.parameterPlaceholder')}
            error={errors[row.key]?.parameter}
            maxLength={RESULT_LIMITS.parameter}
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
            accessibilityLabel={tx('entry.parameterLabel')}
          />

          <View style={styles.pair}>
            <View style={styles.pairItem}>
              <FieldLabel>{tx('entry.valueLabel')}</FieldLabel>
              <PillInput
                value={row.value}
                onChangeText={(v) => update(row.key, { value: v })}
                placeholder={tx('entry.valuePlaceholder')}
                error={errors[row.key]?.value}
                maxLength={RESULT_LIMITS.value}
                autoCorrect={false}
                autoComplete="off"
                textContentType="none"
                accessibilityLabel={tx('entry.valueLabel')}
              />
            </View>
            <View style={styles.pairItem}>
              <FieldLabel>{tx('entry.unitLabel')}</FieldLabel>
              <PillInput
                value={row.unit}
                onChangeText={(v) => update(row.key, { unit: v })}
                placeholder={tx('entry.unitPlaceholder')}
                maxLength={RESULT_LIMITS.unit}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                textContentType="none"
                accessibilityLabel={tx('entry.unitLabel')}
              />
            </View>
          </View>

          <FieldLabel>{tx('entry.rangeLabel')}</FieldLabel>
          <PillInput
            icon={<Icon name="ruler" size={18} color={colors.blue} />}
            value={row.reference_range}
            onChangeText={(v) => update(row.key, { reference_range: v })}
            placeholder={tx('entry.rangePlaceholder')}
            maxLength={RESULT_LIMITS.range}
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
            accessibilityLabel={tx('entry.rangeLabel')}
          />

          <FieldLabel>{tx('entry.flagLabel')}</FieldLabel>
          <View style={styles.chips}>
            {LAB_FLAGS.map((f) => (
              <Chip
                key={f}
                label={`${f} · ${flagLabel(tx, f)}`}
                selected={row.flag === f}
                onPress={() => update(row.key, { flag: row.flag === f ? null : f })}
                accessibilityLabel={flagLabel(tx, f)}
              />
            ))}
          </View>
          <Text style={styles.hint}>{tx('entry.flagHint')}</Text>

          <FieldLabel>{tx('entry.notesLabel')}</FieldLabel>
          <PillInput
            icon={<Icon name="document-text" size={18} color={colors.blue} />}
            value={row.notes}
            onChangeText={(v) => update(row.key, { notes: v })}
            placeholder={tx('entry.notesPlaceholder')}
            multiline
            maxLength={RESULT_LIMITS.notes}
            style={styles.multiline}
            accessibilityLabel={tx('entry.notesLabel')}
          />
        </Card>
      ))}

      {rows.length < RESULT_LIMITS.rows && (
        <CareButton
          label={tx('entry.addRow')}
          icon="plus"
          variant="secondary"
          onPress={addBlank}
          disabled={busy}
        />
      )}

      {!!formError && (
        <Text style={styles.formError} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {formError}
        </Text>
      )}

      <View style={styles.actions}>
        <CareButton
          label={tx('entry.save')}
          icon="check"
          style={styles.action}
          onPress={() => void submit()}
          loading={busy}
          disabled={busy}
        />
        <CareButton
          label={tx('entry.cancel')}
          variant="secondary"
          style={styles.action}
          onPress={onCancel}
          disabled={busy}
        />
      </View>
      <Text style={styles.hint}>{tx('entry.saveHint')}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    wrap: { gap: spacing.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
    hint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
      marginBottom: spacing.sm,
    },
    rowHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    rowTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    pair: { flexDirection: 'row', gap: spacing.sm },
    pairItem: { flex: 1, minWidth: 0 },
    multiline: { minHeight: 64, textAlignVertical: 'top' },
    formError: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.danger,
    },
    actions: { flexDirection: 'row', gap: spacing.sm },
    action: { flex: 1 },
  });
