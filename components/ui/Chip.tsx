import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, radii, sizing, spacing, typography } from '../../theme/tokens';
import { toneOf, type Tone } from './tone';

export type ChipSize = 'sm' | 'md';
export type ChipVariant = 'soft' | 'solid' | 'outline';

interface ChipProps {
  label: string;
  /** Semantic colour. See `Tone` — pick by meaning, not by hue. */
  tone?: Tone;
  /**
   * `soft` (default) — tinted fill, coloured text. Status badges.
   * `solid`          — saturated fill, white text. Use sparingly, for the one
   *                    status that must dominate (e.g. "Cancelled").
   * `outline`        — white fill + hairline. Unselected filter chips.
   */
  variant?: ChipVariant;
  /** `sm` (24h) for inline badges, `md` (32h) for filter rows. */
  size?: ChipSize;
  icon?: LucideIcon;
  /** Leading status dot instead of an icon — the "Open / Closed" pharmacy pattern. */
  dot?: boolean;
  /** Trailing count, e.g. `Appointments (2)`. */
  count?: number;
  /**
   * Filter-chip selection. When `true` the chip renders in its tone's `soft`
   * treatment with a coloured border, regardless of `variant`.
   */
  selected?: boolean;
  /** Makes the chip a filter button. Omit for a read-only status badge. */
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const METRICS: Record<ChipSize, { height: number; px: number; font: number; icon: number }> = {
  sm: { height: 24, px: spacing.sm + 2, font: typography.size.xs, icon: sizing.icon.xs },
  md: { height: 34, px: spacing.md + 2, font: typography.size.sm, icon: sizing.icon.sm },
};

/**
 * A pill. Two jobs, one component: read-only status badge, and tappable filter.
 *
 * Use this when: you need to say "Verified", "In stock", "Cancelled", "In 3
 * days" next to something — or you are building the horizontal filter row that
 * sits under a screen title. Do NOT use it as a button; that is `Button`.
 *
 * @example Status
 * <Chip label={t('status.verified')} tone="success" icon={BadgeCheck} />
 *
 * @example Filter row
 * <Chip label={t('filters.upcoming')} count={5} selected={filter === 'upcoming'}
 *       onPress={() => setFilter('upcoming')} size="md" variant="outline" />
 */
export function Chip({
  label,
  tone = 'neutral',
  variant = 'soft',
  size = 'sm',
  icon: Icon,
  dot = false,
  count,
  selected = false,
  onPress,
  disabled = false,
  className,
  style,
  testID,
}: ChipProps) {
  const palette = toneOf(tone);
  const m = METRICS[size];
  const effective: ChipVariant = selected ? 'soft' : variant;

  const fill =
    effective === 'solid'
      ? palette.solid
      : effective === 'outline'
        ? colors.surface.card
        : palette.surface;

  const fg = effective === 'solid' ? palette.onSolid : palette.fg;
  const border = selected ? palette.fg : effective === 'solid' ? fill : palette.border;

  const box: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    height: m.height,
    paddingHorizontal: m.px,
    borderRadius: radii.pill,
    backgroundColor: fill,
    borderWidth: 1,
    borderColor: border,
    opacity: disabled ? 0.5 : 1,
  };

  const content = (
    <>
      {dot ? (
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: radii.pill,
            backgroundColor: effective === 'solid' ? palette.onSolid : palette.solid,
            marginRight: 6,
          }}
        />
      ) : null}
      {Icon ? <Icon color={fg} size={m.icon} style={{ marginRight: 5 }} /> : null}
      <Text
        numberOfLines={1}
        style={{
          fontSize: m.font,
          lineHeight: m.font + 4,
          fontWeight: typography.weight.semibold,
          color: fg,
        }}
      >
        {label}
      </Text>
      {typeof count === 'number' ? (
        <Text
          style={{
            marginLeft: 6,
            fontSize: m.font,
            lineHeight: m.font + 4,
            fontWeight: typography.weight.bold,
            color: fg,
            opacity: 0.75,
          }}
        >
          {count}
        </Text>
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View className={className} style={[box, style]} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      testID={testID}
      className={className}
      style={({ pressed }) => [box, pressed ? { opacity: 0.7 } : null, style]}
    >
      {content}
    </Pressable>
  );
}
