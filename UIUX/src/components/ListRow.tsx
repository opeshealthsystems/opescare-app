import React from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { colors, spacing, Tint, tintMap, typography } from '../theme/theme';
import { a11yJoin } from './a11y';
import { Icon, IconName } from './Icon';

export type ListRowProps = {
  /** Icon shown inside the pastel tint circle. */
  icon?: IconName;
  /** Tint circle palette. Default `blue`. */
  tint?: Tint;
  /** Replace the tint circle entirely (avatar, date block, custom mark). */
  leading?: React.ReactNode;

  title: string;
  /** Second line. Use `meta` for the "Lab Result  •  20 Apr 2024" pattern. */
  subtitle?: string;
  /** Rendered as a middot-joined metadata line. Overrides `subtitle` when set. */
  meta?: (string | undefined | null | false)[];

  /** Right-hand value text, e.g. "Normal" or "View Report". */
  value?: string;
  /** Colour for `value`. Default `colors.link`. */
  valueColor?: string;
  /** Arbitrary right-hand content (a StatusBadge, a dose block). Overrides `value`. */
  trailing?: React.ReactNode;

  /** Show the trailing chevron. Default true when `onPress` is provided. */
  chevron?: boolean;
  onPress?: () => void;
  /** Hairline divider under the row (for stacked rows inside one card). */
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * Overrides the spoken name, which otherwise reads title, subtitle and value
   * as one sentence. Pass this when the visible text is an abbreviation.
   */
  accessibilityLabel?: string;
  /** Where the row goes, when the title does not already say it. */
  accessibilityHint?: string;
};

/**
 * The most reused pattern in the app — see "Recent Records" on CORE-006.
 *
 * [ tint circle icon ]  Title            value  ›
 *                       Subtitle / meta
 */
export function ListRow({
  icon,
  tint = 'blue',
  leading,
  title,
  subtitle,
  meta,
  value,
  valueColor,
  trailing,
  chevron,
  onPress,
  divider = false,
  style,
  accessibilityLabel,
  accessibilityHint,
}: ListRowProps) {
  const showChevron = chevron ?? !!onPress;
  const t = tintMap[tint];
  const metaText = meta ? meta.filter(Boolean).join('  •  ') : undefined;

  const body = (
    <View style={[styles.row, divider && styles.divider, style]}>
      {leading ?? (icon ? (
        <View style={[styles.circle, { backgroundColor: t.bg }]}>
          <Icon name={icon} size={20} color={t.fg} />
        </View>
      ) : null)}

      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {!!(metaText ?? subtitle) && (
          <Text style={styles.subtitle} numberOfLines={2}>
            {metaText ?? subtitle}
          </Text>
        )}
      </View>

      <View style={styles.trailing}>
        {trailing ??
          (value ? (
            <Text style={[styles.value, !!valueColor && { color: valueColor }]} numberOfLines={1}>
              {value}
            </Text>
          ) : null)}
        {showChevron && <Icon name="chevron-right" size={18} color={colors.textMuted} />}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        // One stop, one sentence. Left as three sibling `Text` nodes the row is
        // three swipes that each say a fragment — "Blood test", "20 Apr 2024",
        // "Normal" — and none of them is the thing you can press.
        accessibilityLabel={accessibilityLabel ?? a11yJoin(title, metaText ?? subtitle, value)}
        accessibilityHint={accessibilityHint}
      >
        {body}
      </TouchableOpacity>
    );
  }
  return body;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    gap: 12,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: 2,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '45%',
  },
  value: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.link,
  },
});
