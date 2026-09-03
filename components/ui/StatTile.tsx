import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, radii, sizing, spacing, typography } from '../../theme/tokens';
import { toneOf, type Tone } from './tone';

interface StatTileProps {
  /** What is being measured — "Heart Rate", "Emergency Contacts". */
  label: string;
  /** The number. Keep it short; long strings shrink to one line. */
  value: string;
  /** Trailing unit, rendered smaller and lighter — "bpm", "mmHg", "%". */
  unit?: string;
  icon?: LucideIcon;
  /** Tints the icon. Defaults to `gold`. */
  tone?: Tone;
  /** Optional qualifier under the value — "Normal", "On track", "Low stock". */
  status?: string;
  /** Colours `status` and its dot. Defaults to `success`. */
  statusTone?: Tone;
  /** `center` (default) matches the divided-row references; `left` for cards. */
  align?: 'center' | 'left';
  onPress?: () => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * One number, labelled. The "Health Summary" / "You're Prepared" pattern.
 *
 * Use this when: you want to surface a measurement or a count. Never for
 * free text — if there is no number, you want a `ListRow`.
 *
 * Almost always wrapped in `StatTileGroup` inside a `Card`.
 *
 * @example
 * <Card>
 *   <StatTileGroup>
 *     <StatTile icon={HeartPulse} label={t('vitals.heartRate')} value="72" unit="bpm" status={t('vitals.normal')} />
 *     <StatTile icon={Droplet}    label={t('vitals.bp')}        value="120/80" unit="mmHg" status={t('vitals.normal')} />
 *   </StatTileGroup>
 * </Card>
 */
export function StatTile({
  label,
  value,
  unit,
  icon: Icon,
  tone = 'gold',
  status,
  statusTone = 'success',
  align = 'center',
  onPress,
  className,
  style,
  testID,
}: StatTileProps) {
  const palette = toneOf(tone);
  const statusPalette = toneOf(statusTone);
  const items = align === 'center' ? 'center' : 'flex-start';

  const body = (
    <View style={{ alignItems: items, paddingVertical: spacing.xs }}>
      {Icon ? (
        <View
          style={{
            width: sizing.tile.md,
            height: sizing.tile.md,
            borderRadius: radii.tile,
            backgroundColor: palette.surface,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: spacing.sm,
          }}
        >
          <Icon color={palette.fg} size={sizing.icon.xl} />
        </View>
      ) : null}

      <Text
        numberOfLines={1}
        style={{
          fontSize: typography.size.sm,
          lineHeight: typography.lineHeight.sm,
          color: colors.navy.secondary,
          textAlign: align,
        }}
      >
        {label}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: typography.size.xl,
            lineHeight: typography.lineHeight.xl,
            fontWeight: typography.weight.extrabold,
            letterSpacing: typography.tracking.tight,
            color: colors.navy.text,
          }}
        >
          {value}
        </Text>
        {unit ? (
          <Text
            style={{
              marginLeft: 3,
              fontSize: typography.size.sm,
              lineHeight: typography.lineHeight.sm,
              fontWeight: typography.weight.medium,
              color: colors.navy.secondary,
            }}
          >
            {unit}
          </Text>
        ) : null}
      </View>

      {status ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: radii.pill,
              backgroundColor: statusPalette.solid,
              marginRight: 5,
            }}
          />
          <Text
            numberOfLines={1}
            style={{
              fontSize: typography.size.xs,
              lineHeight: typography.lineHeight.xs,
              fontWeight: typography.weight.semibold,
              color: statusPalette.fg,
            }}
          >
            {status}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (!onPress) {
    return (
      <View className={className} style={[{ flex: 1 }, style]} testID={testID}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`}
      testID={testID}
      className={className}
      style={({ pressed }) => [{ flex: 1 }, pressed ? { opacity: 0.65 } : null, style]}
    >
      {body}
    </Pressable>
  );
}

/**
 * Lays 2-4 `StatTile`s in a row with the hairline separators the references use.
 * Anything past 4 gets cramped — split into two groups instead.
 */
export function StatTileGroup({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const items = Array.isArray(children) ? children : [children];

  return (
    <View className={className} style={[{ flexDirection: 'row', alignItems: 'stretch' }, style]}>
      {items.map((child, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <View
          key={i}
          style={{
            flex: 1,
            borderLeftWidth: i === 0 ? 0 : sizing.hairline,
            borderLeftColor: colors.line.subtle,
            paddingLeft: i === 0 ? 0 : spacing.sm,
            paddingRight: i === items.length - 1 ? 0 : spacing.sm,
          }}
        >
          {child}
        </View>
      ))}
    </View>
  );
}
