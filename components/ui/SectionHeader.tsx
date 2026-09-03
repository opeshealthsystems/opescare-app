import { Pressable, Text, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { colors, radii, sizing, spacing, typography } from '../../theme/tokens';
import { toneOf, type Tone } from './tone';

interface SectionHeaderProps {
  title: string;
  /** One short line under the title. Skip it if the title already says enough. */
  subtitle?: string;
  /** Rendered in a tinted rounded-square tile to the left of the title. */
  icon?: LucideIcon;
  /** Tints the icon tile and the count pill. */
  tone?: Tone;
  /** Shown as a pill after the title — "WHAT NEEDS ATTENTION (2)". */
  count?: number;
  /** Right-hand link, e.g. "See all". Requires `onAction` to render. */
  actionLabel?: string;
  onAction?: () => void;
  /**
   * `title` (default) — 18px bold navy. Heads a Card or a screen block.
   * `overline`        — 12px uppercase tracked gold. Heads a *group of cards*,
   *                     sitting directly on the cream page background.
   */
  variant?: 'title' | 'overline';
  className?: string;
}

/**
 * The label above a block of content.
 *
 * Use this when: you are writing a bold `<Text>` immediately followed by a list
 * or a grid. Every reference screen heads its blocks this way, and the two
 * variants are the difference between "a heading inside a card" and "a heading
 * that groups cards" — pick deliberately.
 *
 * @example Inside a Card
 * <SectionHeader title={t('home.vitals')} icon={HeartPulse}
 *                actionLabel={t('common.seeAll')} onAction={() => router.push('/vitals')} />
 *
 * @example Over a group of cards
 * <SectionHeader variant="overline" title={t('home.needsAttention')} count={2} />
 */
export function SectionHeader({
  title,
  subtitle,
  icon: Icon,
  tone = 'gold',
  count,
  actionLabel,
  onAction,
  variant = 'title',
  className,
}: SectionHeaderProps) {
  const palette = toneOf(tone);
  const isOverline = variant === 'overline';

  return (
    <View
      className={className}
      style={{
        flexDirection: 'row',
        alignItems: subtitle ? 'flex-start' : 'center',
        marginBottom: isOverline ? spacing.md : spacing.lg,
      }}
    >
      {Icon ? (
        <View
          style={{
            width: isOverline ? sizing.tile.sm : sizing.tile.md,
            height: isOverline ? sizing.tile.sm : sizing.tile.md,
            borderRadius: radii.tile,
            backgroundColor: palette.surface,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: spacing.md,
          }}
        >
          <Icon color={palette.fg} size={isOverline ? sizing.icon.md : sizing.icon.lg} />
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            numberOfLines={1}
            style={
              isOverline
                ? {
                    flexShrink: 1,
                    fontSize: typography.size.xs,
                    lineHeight: typography.lineHeight.xs,
                    fontWeight: typography.weight.bold,
                    letterSpacing: typography.tracking.overline,
                    textTransform: 'uppercase',
                    color: colors.brand[600],
                  }
                : {
                    flexShrink: 1,
                    fontSize: typography.size.lg,
                    lineHeight: typography.lineHeight.lg,
                    fontWeight: typography.weight.bold,
                    letterSpacing: typography.tracking.tight,
                    color: colors.navy.text,
                  }
            }
          >
            {title}
          </Text>

          {typeof count === 'number' ? (
            <View
              style={{
                marginLeft: spacing.sm,
                minWidth: 22,
                height: 22,
                paddingHorizontal: 7,
                borderRadius: radii.pill,
                backgroundColor: palette.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: typography.size.xs,
                  lineHeight: 16,
                  fontWeight: typography.weight.bold,
                  color: palette.fg,
                }}
              >
                {count}
              </Text>
            </View>
          ) : null}
        </View>

        {subtitle ? (
          <Text
            style={{
              marginTop: 3,
              fontSize: typography.size.sm,
              lineHeight: typography.lineHeight.sm,
              color: colors.navy.secondary,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            marginLeft: spacing.md,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text
            style={{
              fontSize: typography.size.sm,
              lineHeight: typography.lineHeight.sm,
              fontWeight: typography.weight.semibold,
              color: colors.brand[600],
            }}
          >
            {actionLabel}
          </Text>
          <ChevronRight color={colors.brand[600]} size={sizing.icon.sm} style={{ marginLeft: 2 }} />
        </Pressable>
      ) : null}
    </View>
  );
}
