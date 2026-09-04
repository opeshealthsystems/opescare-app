import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radii, StatusTone, statusMap, typography } from '../theme/theme';
import { formatLabel } from '../utils/format';
import { Icon, IconName } from './Icon';

const NORMAL = ['completed', 'confirmed', 'active', 'paid', 'success', 'dispensed', 'normal', 'verified', 'taken', 'resolved', 'approved'];
const CRITICAL = ['cancelled', 'canceled', 'failed', 'overdue', 'expired', 'critical', 'abnormal', 'high', 'declined', 'missed'];
const WARNING = ['pending_payment', 'partial', 'due', 'low', 'warning', 'refill', 'attention', 'draft'];
const PENDING = ['scheduled', 'pending', 'upcoming', 'in_progress', 'ordered', 'issued', 'processing', 'requested'];
const INFO = ['rescheduled', 'referred', 'archived', 'info'];

/** Map a raw domain status string onto a semantic tone. */
export function toneForStatus(status: string): StatusTone {
  const s = status.toLowerCase().replace(/[\s-]/g, '_');
  if (NORMAL.includes(s)) return 'normal';
  if (CRITICAL.includes(s)) return 'critical';
  if (WARNING.includes(s)) return 'warning';
  if (PENDING.includes(s)) return 'pending';
  if (INFO.includes(s)) return 'info';
  return 'neutral';
}

export type StatusBadgeProps = {
  /** Raw status string; mapped to a tone unless `tone` is given. */
  status: string;
  /** Force a tone, bypassing the keyword map. */
  tone?: StatusTone;
  /**
   * Display text override. `status` still drives the tone; this replaces the
   * shown label — used to render a localized enum (e.g. an encounter status)
   * without changing the value the tone map keys on. Falls back to
   * formatLabel(status) when absent.
   */
  label?: string;
  /** Optional leading icon (CARE-001 "Taken ✓", "Upcoming ⏱"). */
  icon?: IconName;
  /** `sm` for dense table cells, `md` (default) elsewhere. */
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
};

/**
 * Pill-style status badge.
 *
 * Recipe: pill radius, tinted background, same-hue bold-ish label at 12px,
 * 10px horizontal / 5px vertical padding. See CARE-001 and MED-001.
 */
export function StatusBadge({ status, tone, icon, size = 'md', style, label }: StatusBadgeProps) {
  const resolved = tone ?? toneForStatus(status);
  const { bg, fg } = statusMap[resolved];

  return (
    <View
      style={[styles.badge, size === 'sm' ? styles.sm : styles.md, { backgroundColor: bg }, style]}
    >
      {!!icon && <Icon name={icon} size={size === 'sm' ? 11 : 13} color={fg} strokeWidth={2} />}
      <Text style={[styles.text, size === 'sm' && styles.textSm, { color: fg }]}>
        {label ?? formatLabel(status)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    gap: 4,
  },
  md: { paddingHorizontal: 10, paddingVertical: 5 },
  sm: { paddingHorizontal: 8, paddingVertical: 3 },
  text: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    // No textTransform: 'capitalize' — CSS capitalises EVERY word, which is
    // wrong for French sentence case ("Compte Rendu À Lire"). formatLabel()
    // upper-cases only the first character, correct in both languages, and
    // leaves an already-cased translated label untouched.
    color: colors.textSecondary,
  },
  textSm: { fontSize: 11 },
});
