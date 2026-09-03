import { Text, View } from 'react-native';
import { colors, elevation, radii, typography } from '../../theme/tokens';
import { toneOf, type Tone } from './tone';

interface UnreadBadgeProps {
  count: number;
  /** Counts above this render as "N+" so the pill can't grow unbounded. */
  max?: number;
  /** Accessibility label, e.g. "3 unread notifications". */
  label?: string;
  /**
   * Added, optional. Defaults to `danger` — the red dot on a bell icon. Use
   * `gold` for a brand-toned count that is informational rather than urgent.
   */
  tone?: Tone;
  /**
   * Added, optional. `true` removes the absolute positioning so the badge can
   * sit inline — next to a tab label, a section title, a filter chip. Defaults
   * to `false`, i.e. the existing overlay-on-an-icon behaviour is unchanged.
   */
  standalone?: boolean;
}

/**
 * Small count pill for notification entry points. Renders nothing at 0, so
 * callers can pass a count straight through without a guard — including the
 * 0 that `useUnreadNotificationCount` returns while loading or on error.
 *
 * By default it positions itself absolutely over its parent's top-right corner,
 * so the parent needs `relative` (View's default) and the icon needs no extra
 * wrapper. The cream ring around the pill is what keeps it legible when it
 * overlaps a dark glyph.
 *
 * @example
 * <View>
 *   <Bell color={colors.navy.text} size={22} />
 *   <UnreadBadge count={unreadCount} label={t('a11y.unreadNotifications', { count: unreadCount })} />
 * </View>
 */
export function UnreadBadge({
  count,
  max = 99,
  label,
  tone = 'danger',
  standalone = false,
}: UnreadBadgeProps) {
  if (count <= 0) return null;

  const text = count > max ? `${max}+` : String(count);
  const palette = toneOf(tone);
  // Two digits need more room than one; without this the pill goes oval.
  const minWidth = text.length > 1 ? 22 : 18;

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="text"
      className={
        standalone
          ? 'items-center justify-center'
          : 'absolute -right-2 -top-1.5 items-center justify-center'
      }
      style={{
        height: 18,
        minWidth,
        paddingHorizontal: 5,
        borderRadius: radii.pill,
        backgroundColor: palette.solid,
        // The ring reads as a cut-out from the page, which is why it uses the
        // page cream rather than white.
        borderWidth: standalone ? 0 : 1.5,
        borderColor: colors.cream[100],
        ...(standalone ? {} : elevation.sm),
      }}
    >
      <Text
        style={{
          fontSize: 10,
          lineHeight: 12,
          fontWeight: typography.weight.extrabold,
          letterSpacing: -0.2,
          color: palette.onSolid,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
