import { useEffect, useRef } from 'react';
import { Animated, Easing, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, sizing, spacing } from '../../theme/tokens';

interface SkeletonProps {
  /** Number (px) or percentage string. Defaults to full width. */
  width?: DimensionValue;
  height?: number;
  /** Corner radius. Ignored when `circle`. */
  radius?: number;
  /** Forces a 1:1 circle of `height` — avatars, icon tiles. */
  circle?: boolean;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

/** Shared opacity pulse so a screenful of skeletons breathes in sync. */
function usePulse() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 750,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
}

/**
 * A single shimmering placeholder block.
 *
 * Use this when: a screen is loading and you know roughly what shape the
 * content will be. Skeletons that mirror the real layout read as "loading";
 * a lone centred spinner reads as "stuck". Reach for `SkeletonList` /
 * `SkeletonCard` first — they already match the reference layouts.
 *
 * @example
 * if (query.isLoading) return <SkeletonList count={4} className="px-6" />;
 */
export function Skeleton({ width = '100%', height = 14, radius, circle = false, style, className }: SkeletonProps) {
  const opacity = usePulse();

  return (
    <Animated.View
      className={className}
      accessibilityRole="progressbar"
      style={[
        {
          width: circle ? height : width,
          height,
          borderRadius: circle ? height / 2 : (radius ?? radii.sm),
          backgroundColor: colors.cream[200],
          opacity,
        },
        style,
      ]}
    />
  );
}

/**
 * A paragraph placeholder. The last line is short, like real text.
 */
export function SkeletonText({
  lines = 3,
  gap = spacing.sm,
  lineHeight = 12,
  lastLineWidth = '60%',
  className,
  style,
}: {
  lines?: number;
  gap?: number;
  lineHeight?: number;
  lastLineWidth?: DimensionValue;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View className={className} style={style}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={lineHeight}
          width={i === lines - 1 ? lastLineWidth : '100%'}
          style={i === 0 ? undefined : { marginTop: gap }}
        />
      ))}
    </View>
  );
}

/**
 * A `ListRow`-shaped placeholder: icon tile + two text lines + trailing meta.
 */
export function SkeletonRow({
  showIcon = true,
  className,
  style,
}: {
  showIcon?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      className={className}
      style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md + 2 }, style]}
    >
      {showIcon ? <Skeleton height={sizing.tile.lg} width={sizing.tile.lg} radius={radii.tile} /> : null}
      <View style={{ flex: 1, marginLeft: showIcon ? spacing.md : 0 }}>
        <Skeleton height={14} width="65%" />
        <Skeleton height={11} width="42%" style={{ marginTop: spacing.sm }} />
      </View>
      <Skeleton height={11} width={48} style={{ marginLeft: spacing.md }} />
    </View>
  );
}

/**
 * A `Card`-shaped placeholder — the whole white block, not just its contents.
 */
export function SkeletonCard({
  rows = 3,
  showHeader = true,
  className,
  style,
}: {
  rows?: number;
  showHeader?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      className={className}
      style={[
        {
          borderRadius: radii.card,
          backgroundColor: colors.surface.card,
          borderWidth: 1,
          borderColor: colors.line.subtle,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.xs,
        },
        style,
      ]}
    >
      {showHeader ? (
        <View style={{ paddingTop: spacing.md, paddingBottom: spacing.sm }}>
          <Skeleton height={16} width="45%" />
        </View>
      ) : null}
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}

/**
 * The default loading state for any list screen.
 */
export function SkeletonList({
  count = 4,
  gap = spacing.md,
  className,
  style,
}: {
  count?: number;
  gap?: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View className={className} style={style}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard
          key={i}
          rows={1}
          showHeader={false}
          style={i === 0 ? undefined : { marginTop: gap }}
        />
      ))}
    </View>
  );
}
