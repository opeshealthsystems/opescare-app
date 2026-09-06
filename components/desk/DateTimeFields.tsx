/**
 * Date and time entry for the front desk — without a picker dependency this
 * app does not carry.
 *
 * The receptionist types digits; the field shapes them into `YYYY-MM-DD` and
 * `HH:MM` as they go (the same masking the sign-up form uses for a date of
 * birth). Beside the time field, `SlotGrid` offers the clinic day in 30-minute
 * steps as one-tap chips. THE GRID CLAIMS NOTHING ABOUT AVAILABILITY: the
 * contract publishes no facility slot endpoint, so a chip is a time, not a
 * free time, and the caption says so.
 *
 * Composition only: kit `PillInput`, `Chip`, `Icon`, tokens.
 */
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Chip, Icon, PillInput, radii, spacing, typography, useTheme, type Palette } from '@/components/opes-ui';
import { fmtTime } from '@/components/care/shared';
import { deskDay, isValidDeskDay, shiftDeskDay } from '@/lib/api/deskQueries';
import { FieldLabel } from './shared';

// ── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Raw entry → `YYYY-MM-DD` as the user types. Slices the DIGIT run rather than
 * relying on `maxLength`, so a pasted "12 May 1990" is not truncated before
 * its non-digits are stripped.
 */
export function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  return [y, m, d].filter(Boolean).join('-');
}

/** Raw entry → `HH:MM` (24-hour) as the user types. */
export function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  const h = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  return m ? `${h}:${m}` : h;
}

/** Strict `HH:MM`, 00–23 / 00–59. */
export function isValidTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [h, m] = value.split(':').map(Number) as [number, number];
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/** A local `Date` from a valid day + time, else null. */
export function composeLocal(day: string, time: string): Date | null {
  if (!isValidDeskDay(day) || !isValidTime(time)) return null;
  const [y, mo, d] = day.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `HH:MM` of an ISO instant in local time, or `''`. */
export function timeOfIso(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** A calendar date strictly before today — what a date of birth must be. */
export function isPastDay(value: string): boolean {
  if (!isValidDeskDay(value)) return false;
  return value < deskDay();
}

// ── Fields ─────────────────────────────────────────────────────────────────

export function DateField({
  label,
  hint,
  value,
  onChange,
  error,
  placeholder,
  accessibilityLabel,
}: {
  label?: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  error?: string | null;
  placeholder?: string;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <View>
      {!!label && <FieldLabel text={label} hint={hint} />}
      <PillInput
        icon={<Icon name="calendar" size={18} color={colors.blue} />}
        value={value}
        onChangeText={(raw) => onChange(formatDateInput(raw))}
        placeholder={placeholder ?? 'YYYY-MM-DD'}
        keyboardType="number-pad"
        autoCorrect={false}
        error={error ?? undefined}
        accessibilityLabel={accessibilityLabel ?? label}
      />
    </View>
  );
}

export function TimeField({
  label,
  hint,
  value,
  onChange,
  error,
  accessibilityLabel,
}: {
  label?: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  error?: string | null;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <View>
      {!!label && <FieldLabel text={label} hint={hint} />}
      <PillInput
        icon={<Icon name="clock" size={18} color={colors.blue} />}
        value={value}
        onChangeText={(raw) => onChange(formatTimeInput(raw))}
        placeholder="HH:MM"
        keyboardType="number-pad"
        autoCorrect={false}
        error={error ?? undefined}
        accessibilityLabel={accessibilityLabel ?? label}
      />
    </View>
  );
}

// ── Day chips: yesterday / today / tomorrow ────────────────────────────────

/**
 * The three days a desk actually flips between, as chips. A day outside them
 * (typed in the date field) leaves all three unselected — nothing pretends.
 */
export function DayChips({ value, onChange }: { value: string; onChange: (day: string) => void }) {
  const { t } = useTranslation();
  const today = deskDay();
  const days: { key: string; label: string }[] = [
    { key: shiftDeskDay(today, -1), label: t('desk.day.yesterday') },
    { key: today, label: t('desk.day.today') },
    { key: shiftDeskDay(today, 1), label: t('desk.day.tomorrow') },
  ];
  return (
    <View style={dayStyles.row} accessibilityRole="tablist">
      {days.map((d) => (
        <Chip key={d.key} label={d.label} selected={value === d.key} onPress={() => onChange(d.key)} />
      ))}
    </View>
  );
}

const dayStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
});

// ── Slot grid ──────────────────────────────────────────────────────────────

const GRID_START_HOUR = 8;
const GRID_END_HOUR = 18;
const GRID_STEP_MIN = 30;

/**
 * The clinic day in 30-minute chips. Times already past (for today) are
 * disabled. `taken` marks times the caller KNOWS are booked (a real read of
 * the book) — nothing else is presented as free, and the caption under the
 * grid says so.
 */
export function SlotGrid({
  day,
  value,
  onPick,
  taken,
  disabled,
}: {
  /** `YYYY-MM-DD` the chips belong to — decides which are already past. */
  day: string;
  /** The selected `HH:MM`, if any. */
  value: string;
  onPick: (time: string) => void;
  /** `HH:MM` values already booked on this day, from a real read. */
  taken?: ReadonlySet<string>;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const slots = useMemo(() => {
    const out: string[] = [];
    for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h += 1) {
      for (let m = 0; m < 60; m += GRID_STEP_MIN) {
        out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    return out;
  }, []);

  const now = Date.now();

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {slots.map((time) => {
          const at = composeLocal(day, time);
          const past = at ? at.getTime() < now : false;
          const isTaken = taken?.has(time) ?? false;
          const off = disabled || past || isTaken;
          const on = value === time;
          const label = at ? fmtTime(at.toISOString()) : time;
          return (
            <TouchableOpacity
              key={time}
              disabled={off}
              onPress={() => onPick(time)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ disabled: off, selected: on }}
              accessibilityLabel={isTaken ? `${label}, ${t('desk.slots.booked')}` : label}
              style={[styles.slot, on && styles.slotOn, off && styles.slotOff]}
            >
              <Text style={[styles.slotText, on && styles.slotTextOn, off && styles.slotTextOff]}>{label}</Text>
              {isTaken && <Text style={styles.slotNote}>{t('desk.slots.booked')}</Text>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <Text style={styles.caption}>{taken ? t('desk.slots.captionWithBook') : t('desk.slots.caption')}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    strip: { gap: spacing.sm, paddingVertical: spacing.xs },
    slot: {
      minWidth: 84,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm + 2,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    slotOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    slotOff: { backgroundColor: colors.divider, borderColor: colors.divider },
    slotText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.link,
    },
    slotTextOn: { color: colors.textOnBrand },
    slotTextOff: { color: colors.textMuted },
    slotNote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      color: colors.textMuted,
    },
    caption: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
  });
