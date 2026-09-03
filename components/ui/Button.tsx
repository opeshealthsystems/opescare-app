import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, type LucideIcon } from 'lucide-react-native';
import { colors, elevation, gradients, radii, sizing, spacing, typography } from '../../theme/tokens';

type ButtonVariant = 'primary' | 'outline';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: LucideIcon;
  showChevron?: boolean;
  /**
   * Added, optional. `false` drops the circular left icon badge for a plain
   * centred label — the cleaner CTA used in empty states and dialogs.
   * Defaults to `true`, i.e. the existing appearance is unchanged.
   */
  showLeftIcon?: boolean;
}

/** Primary CTA — gold gradient, circular left icon badge, chevron right. Matches
 * the "Get Started" / "Sign In" buttons across the onboarding + login references.
 *
 * Use this when: it is the action the screen exists for. One `primary` per
 * view; everything else is `outline`, a `Chip`, or a `SectionHeader` action.
 *
 * The gradient carries a warm gold glow (`elevation.brand`) and presses down;
 * disabled swaps to a flat cream fill rather than a washed-out gradient, so a
 * blocked CTA reads as blocked instead of half-rendered. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  leftIcon: LeftIcon = ArrowRight,
  showChevron = true,
  showLeftIcon = true,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  if (variant === 'outline') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        accessibilityLabel={label}
        className="h-14 flex-row items-center justify-center rounded-2xl border border-brand-500 bg-transparent px-4"
        style={({ pressed }) => [
          {
            // 1.5px reads as a deliberate outline at @3x; 1px disappears.
            borderWidth: 1.5,
            borderColor: isDisabled ? colors.line.strong : colors.brand[500],
            // The references never leave an outline button fully transparent on
            // cream — there is always a faint warm fill behind the label.
            backgroundColor: pressed ? colors.brand[50] : colors.surface.card,
          },
          isDisabled ? { opacity: 0.55 } : elevation.sm,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.brand[600]} size="small" style={{ marginRight: spacing.sm }} />
        ) : null}
        <Text
          numberOfLines={1}
          style={{
            fontSize: typography.size.md,
            lineHeight: typography.lineHeight.md,
            fontWeight: typography.weight.bold,
            letterSpacing: typography.tracking.wide,
            color: isDisabled ? colors.navy.muted : colors.brand[600],
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        { borderRadius: radii.lg },
        isDisabled ? { opacity: 0.6 } : elevation.brand,
        pressed && !isDisabled ? { transform: [{ scale: 0.985 }], shadowOpacity: 0.16 } : null,
      ]}
    >
      <LinearGradient
        // Disabled gets a flat cream fill; a faded gradient looks like a bug.
        colors={isDisabled ? [colors.cream[300], colors.cream[300]] : gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          borderRadius: radii.lg,
          height: sizing.control.lg,
          alignItems: 'center',
          // NativeWind's className→style transform does not apply to
          // third-party components like expo-linear-gradient's LinearGradient
          // (it's not registered via cssInterop), so it silently no-ops here —
          // confirmed by a wave-2 fidelity review: every primary button's icon
          // was rendering stacked above its label instead of beside it. Plain
          // inline style is the reliable fix.
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.sm,
        }}
      >
        {showLeftIcon ? (
          <View
            style={{
              height: 40,
              width: 40,
              borderRadius: radii.pill,
              alignItems: 'center',
              justifyContent: 'center',
              // A translucent white disc lets the gradient read through, which
              // is what makes the badge look inset rather than pasted on.
              backgroundColor: 'rgba(255,255,255,0.92)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.55)',
            }}
          >
            {loading ? (
              <ActivityIndicator color={colors.brand[600]} size="small" />
            ) : (
              <LeftIcon color={isDisabled ? colors.navy.muted : colors.brand[600]} size={sizing.icon.md} />
            )}
          </View>
        ) : (
          <View style={{ width: showChevron ? 40 : 0 }}>
            {loading ? <ActivityIndicator color={colors.white} size="small" /> : null}
          </View>
        )}

        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: typography.size.md,
            lineHeight: 20,
            fontWeight: typography.weight.bold,
            letterSpacing: typography.tracking.wide,
            color: isDisabled ? colors.navy.secondary : colors.white,
          }}
        >
          {label}
        </Text>

        {showChevron ? (
          <View style={{ height: 40, width: 40, alignItems: 'center', justifyContent: 'center' }}>
            <ArrowRight
              color={isDisabled ? colors.navy.secondary : colors.white}
              size={sizing.icon.md}
            />
          </View>
        ) : (
          <View style={{ height: 40, width: showLeftIcon ? 40 : 0 }} />
        )}
      </LinearGradient>
    </Pressable>
  );
}
