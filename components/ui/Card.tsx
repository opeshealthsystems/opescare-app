import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, elevation, gradients, radii, spacing } from '../../theme/tokens';

export type CardVariant = 'elevated' | 'flat' | 'outlined' | 'sunken' | 'gold' | 'inverse';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps {
  children: ReactNode;
  /**
   * `elevated` (default) — white card, hairline border, soft warm shadow. The
   *   workhorse: use it for every content block on a cream page.
   * `flat`     — same surface, no shadow. Use when cards are stacked densely.
   * `outlined` — transparent fill, hairline border. Secondary/optional content.
   * `sunken`   — inset well (search bars, totals rows, code blocks).
   * `gold`     — brand gradient. At most ONE per screen (the Health ID / hero).
   * `inverse`  — deep navy. The other hero treatment; also never more than one.
   */
  variant?: CardVariant;
  /** `md` (16) is the reference default; `lg` (20) for hero cards. */
  padding?: CardPadding;
  /** Makes the whole card a tap target, with a press-down state. */
  onPress?: () => void;
  disabled?: boolean;
  /** Extra NativeWind classes — layout only (`mb-4`, `flex-1`). */
  className?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

const PADDING: Record<CardPadding, number> = {
  none: 0,
  sm: spacing.md,
  md: spacing.lg,
  lg: spacing.xl,
};

/**
 * The container every screen is built from.
 *
 * Use this when: you are about to write `<View className="rounded-2xl bg-white p-4">`.
 * That is a Card, and hand-rolling it is how eight screens end up with eight
 * different radii. Compose it with `SectionHeader` above and `ListRow`s inside.
 *
 * @example
 * <Card className="mb-4">
 *   <SectionHeader title={t('home.vitals')} actionLabel={t('common.seeAll')} onAction={...} />
 *   <ListRow icon={HeartPulse} title="Heart rate" value="72 bpm" />
 * </Card>
 *
 * @example Hero
 * <Card variant="gold" padding="lg">…Health ID…</Card>
 */
export function Card({
  children,
  variant = 'elevated',
  padding = 'md',
  onPress,
  disabled = false,
  className,
  style,
  accessibilityLabel,
  testID,
}: CardProps) {
  const pad = PADDING[padding];

  const base: ViewStyle = {
    borderRadius: radii.card,
    padding: pad,
    overflow: 'hidden',
  };

  const byVariant: Record<CardVariant, ViewStyle> = {
    elevated: {
      backgroundColor: colors.surface.card,
      borderWidth: 1,
      borderColor: colors.line.subtle,
      ...elevation.md,
    },
    flat: {
      backgroundColor: colors.surface.card,
      borderWidth: 1,
      borderColor: colors.line.default,
    },
    outlined: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.line.default,
    },
    sunken: {
      backgroundColor: colors.surface.sunken,
      borderWidth: 1,
      borderColor: colors.line.subtle,
    },
    gold: { ...elevation.brand },
    inverse: { backgroundColor: colors.surface.inverse, ...elevation.navy },
  };

  const body =
    variant === 'gold' ? (
      // NativeWind does not register cssInterop for LinearGradient, so
      // `className` silently no-ops on it — inline style only.
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: radii.card, padding: pad }}
      >
        {children}
      </LinearGradient>
    ) : (
      children
    );

  const composed: StyleProp<ViewStyle> = [
    base,
    byVariant[variant],
    // The gradient child already carries the padding.
    variant === 'gold' ? { padding: 0 } : null,
    disabled ? { opacity: 0.55 } : null,
    style,
  ];

  if (!onPress) {
    return (
      <View
        className={className}
        style={composed}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      className={className}
      style={({ pressed }) => [
        composed,
        pressed ? { opacity: 0.9, transform: [{ scale: 0.994 }] } : null,
      ]}
    >
      {body}
    </Pressable>
  );
}
