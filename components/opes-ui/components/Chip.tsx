import React, { useMemo } from 'react';
import { ScrollView, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { radii, spacing, typography, type Palette } from '../theme';
import { useTheme } from '../ThemeProvider';
import { a11yJoin } from './a11y';
import { Icon, IconName } from './Icon';

// ---------------------------------------------------------------------------
// Chip
// ---------------------------------------------------------------------------

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  /** Trailing count, e.g. "Active 3". */
  count?: number;
  style?: StyleProp<ViewStyle>;
  /** Spoken name, when "Active" alone does not say what pressing it does. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/** Pill filter chip — see the filter rows on CARE-001 / MED-001. */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
  count,
  style,
  accessibilityLabel,
  accessibilityHint,
}: ChipProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fg = selected ? colors.textOnBrand : colors.textSecondary;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      disabled={!onPress}
      // A chip is a filter toggle, not a link: `selected` is the whole point of
      // it, and sighted users read it from the fill colour alone.
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel ?? a11yJoin(label, count)}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected, disabled: !onPress }}
      style={[styles.chip, selected ? styles.chipOn : styles.chipOff, style]}
    >
      {!!icon && <Icon name={icon} size={14} color={fg} />}
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
      {count != null && <Text style={[styles.chipCount, { color: fg }]}>{count}</Text>}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// SegmentedTabs
// ---------------------------------------------------------------------------

export type SegmentedOption = { key: string; label: string };

export type SegmentedTabsProps = {
  options: SegmentedOption[];
  value: string;
  onChange: (key: string) => void;
  /**
   * `underline` (default) matches MED-001 "Active / Recent / All" — the active
   * item gets a tinted pill plus an underline. `pill` is a filled-pill group.
   */
  variant?: 'underline' | 'pill';
  /** Horizontally scroll when options overflow. */
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function SegmentedTabs({
  options,
  value,
  onChange,
  variant = 'underline',
  scrollable = false,
  style,
}: SegmentedTabsProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const items = options.map((o) => {
    const on = o.key === value;
    if (variant === 'pill') {
      return <Chip key={o.key} label={o.label} selected={on} onPress={() => onChange(o.key)} />;
    }
    return (
      <TouchableOpacity
        key={o.key}
        onPress={() => onChange(o.key)}
        activeOpacity={0.75}
        accessibilityRole="tab"
        accessibilityLabel={o.label}
        accessibilityState={{ selected: on }}
        style={[styles.seg, on && styles.segOn]}
      >
        <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
      </TouchableOpacity>
    );
  });

  if (scrollable) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        contentContainerStyle={[styles.group, style]}
      >
        {items}
      </ScrollView>
    );
  }
  return (
    <View accessibilityRole="tablist" style={[styles.group, style]}>
      {items}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipOff: { backgroundColor: colors.surface, borderColor: colors.border },
  chipText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
  },
  chipCount: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    opacity: 0.85,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  seg: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  segOn: {
    backgroundColor: colors.statusNormalBg,
    borderBottomColor: colors.statusNormal,
  },
  segText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  segTextOn: {
    fontFamily: typography.fontFamily.semiBold,
    color: colors.statusNormal,
  },
});
