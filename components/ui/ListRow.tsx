import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { colors, radii, sizing, spacing, typography } from '../../theme/tokens';
import { toneOf, type Tone } from './tone';

interface ListRowProps {
  title: string;
  /** Second line — the "who / where / when" detail. Wraps to 2 lines. */
  subtitle?: string;
  /** Right-hand emphasised value, e.g. "72 bpm", "XAF 15,000", "O+". */
  value?: string;
  /** Right-hand de-emphasised text, e.g. "9:45 AM", "2.4 km". Sits under `value`. */
  meta?: string;
  /** Leading icon, drawn inside a tinted rounded-square tile. */
  icon?: LucideIcon;
  /** Tints the icon tile (and the unread dot). */
  tone?: Tone;
  /** Replaces the icon tile entirely — avatar image, initials, date block. */
  leading?: ReactNode;
  /** Replaces `value`/`meta`/chevron — a `Chip`, a Switch, a small button. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Chevron shows by default whenever the row is pressable. */
  showChevron?: boolean;
  /** Hairline under the row. Set `false` on the last row of a group. */
  divider?: boolean;
  /** Renders the title in danger red — "Delete account", "Cancel request". */
  destructive?: boolean;
  /** Bolder title + a tone dot on the right. The notification-centre pattern. */
  unread?: boolean;
  disabled?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * One line item in a list. This is the single most repeated shape in the
 * references — notifications, settings, vitals, related actions, payment lines
 * are all the same anatomy: [icon tile] title / subtitle … value / meta [›].
 *
 * Use this when: you are laying out a row inside a `Card`. Put `divider` on
 * every row except the last so the group reads as one block.
 *
 * @example
 * <Card padding="none" className="mb-4">
 *   {items.map((it, i) => (
 *     <ListRow key={it.id} icon={FileText} tone="gold"
 *              title={it.name} subtitle={it.facility} meta={it.date}
 *              onPress={() => router.push(`/documents/${it.id}`)}
 *              divider={i < items.length - 1} className="px-4" />
 *   ))}
 * </Card>
 */
export function ListRow({
  title,
  subtitle,
  value,
  meta,
  icon: Icon,
  tone = 'gold',
  leading,
  trailing,
  onPress,
  showChevron,
  divider = false,
  destructive = false,
  unread = false,
  disabled = false,
  className,
  style,
  accessibilityLabel,
  testID,
}: ListRowProps) {
  const palette = toneOf(destructive ? 'danger' : tone);
  const chevron = showChevron ?? Boolean(onPress);
  const titleColor = destructive ? colors.semantic.danger : colors.navy.text;

  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.md + 2,
        borderBottomWidth: divider ? sizing.hairline : 0,
        borderBottomColor: colors.line.subtle,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {leading ?? null}

      {!leading && Icon ? (
        <View
          style={{
            width: sizing.tile.lg,
            height: sizing.tile.lg,
            borderRadius: radii.tile,
            backgroundColor: palette.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon color={palette.fg} size={sizing.icon.xl} />
        </View>
      ) : null}

      <View style={{ flex: 1, marginLeft: leading || Icon ? spacing.md : 0 }}>
        <Text
          numberOfLines={2}
          style={{
            fontSize: typography.size.md,
            lineHeight: typography.lineHeight.md,
            fontWeight: unread ? typography.weight.bold : typography.weight.semibold,
            color: titleColor,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={2}
            style={{
              marginTop: 2,
              fontSize: typography.size.sm,
              lineHeight: typography.lineHeight.sm,
              color: colors.navy.secondary,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailing ? (
        <View style={{ marginLeft: spacing.md }}>{trailing}</View>
      ) : value || meta ? (
        <View style={{ marginLeft: spacing.md, alignItems: 'flex-end', maxWidth: 132 }}>
          {value ? (
            <Text
              numberOfLines={1}
              style={{
                fontSize: typography.size.md,
                lineHeight: typography.lineHeight.md,
                fontWeight: typography.weight.semibold,
                color: colors.navy.text,
              }}
            >
              {value}
            </Text>
          ) : null}
          {meta ? (
            <Text
              numberOfLines={1}
              style={{
                marginTop: value ? 2 : 0,
                fontSize: typography.size.xs,
                lineHeight: typography.lineHeight.xs,
                color: colors.navy.muted,
              }}
            >
              {meta}
            </Text>
          ) : null}
        </View>
      ) : null}

      {unread ? (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: radii.pill,
            backgroundColor: palette.solid,
            marginLeft: spacing.sm,
          }}
        />
      ) : null}

      {chevron ? (
        <ChevronRight
          color={colors.navy.muted}
          size={sizing.icon.lg}
          style={{ marginLeft: spacing.sm }}
        />
      ) : null}
    </View>
  );

  if (!onPress) {
    return (
      <View className={className} style={style} testID={testID}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      testID={testID}
      className={className}
      style={({ pressed }) => [pressed ? { backgroundColor: colors.surface.scrim } : null, style]}
    >
      {body}
    </Pressable>
  );
}
