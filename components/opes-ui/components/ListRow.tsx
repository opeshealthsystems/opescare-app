import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle, useWindowDimensions } from 'react-native';
import { spacing, Tint, typography, type Palette } from '../theme';
import { useTheme } from '../ThemeProvider';
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
  /**
   * How many lines the title may take before it is truncated. Default 2 — on a
   * 375px phone a one-line cap clips ordinary labels ("Unread patient
   * messages", "Hôpital Central de Yaoundé") a few pixels from the end. Pass 1
   * where a row must stay exactly one line tall.
   */
  titleLines?: number;
  /** Second line. Use `meta` for the "Lab Result  •  20 Apr 2024" pattern. */
  subtitle?: string;
  /**
   * How many lines the subtitle may take. Default 2; `0` means "as many as it
   * needs" — for a row whose subtitle is a sentence the reader must finish,
   * not a metadata line they can skim.
   */
  subtitleLines?: number;
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
  titleLines = 2,
  subtitle,
  subtitleLines = 2,
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
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const showChevron = chevron ?? !!onPress;
  const t = tintMap[tint];
  const metaText = meta ? meta.filter(Boolean).join('  •  ') : undefined;
  // Below 380dp a trailing badge/value beside the title squeezed it to one or
  // two words a line ("Demo / Grand…", "Lipid / Panel"). There the trailing
  // content moves under the text and only the chevron stays on the right.
  const narrow = useWindowDimensions().width < 380;
  const trailingContent =
    trailing ??
    (value ? (
      <Text style={[styles.value, !!valueColor && { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
    ) : null);
  const stackTrailing = narrow && trailingContent != null;

  const body = (
    <View style={[styles.row, divider && styles.divider, style]}>
      {leading ?? (icon ? (
        <View style={[styles.circle, { backgroundColor: t.bg }]}>
          <Icon name={icon} size={24} color={t.fg} />
        </View>
      ) : null)}

      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={titleLines > 0 ? titleLines : undefined}>
          {title}
        </Text>
        {!!(metaText ?? subtitle) && (
          <Text
            style={styles.subtitle}
            numberOfLines={subtitleLines > 0 ? subtitleLines : undefined}
          >
            {metaText ?? subtitle}
          </Text>
        )}
        {stackTrailing ? <View style={styles.trailingStacked}>{trailingContent}</View> : null}
      </View>

      {stackTrailing ? (
        showChevron ? <Icon name="chevron-right" size={18} color={colors.textMuted} /> : null
      ) : (
        <View style={styles.trailing}>
          {trailingContent}
          {showChevron && <Icon name="chevron-right" size={18} color={colors.textMuted} />}
        </View>
      )}
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

const makeStyles = (colors: Palette) => StyleSheet.create({
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
    justifyContent: 'flex-end',
    gap: 6,
    maxWidth: '45%',
    // `maxWidth` alone only CLIPS: a trailing badge wider than 45% of the row
    // kept its natural width and ran off the right edge of the screen ("Cannot
    // receive messages" on the recipient picker). Shrinking lets the badge
    // give its own text a narrower box to wrap in instead.
    flexShrink: 1,
  },
  trailingStacked: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  value: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.link,
  },
});
