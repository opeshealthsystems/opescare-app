import React from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, View, ViewProps, ViewStyle } from 'react-native';
import { colors, radii, shadow, spacing } from '../theme/theme';

export type CardProps = ViewProps & {
  children?: React.ReactNode;
  /** `padded` (default) applies 16px inset. Use `flush` for full-bleed list cards. */
  variant?: 'padded' | 'flush';
  /** Left accent bar colour (MED-001 prescription rows). */
  accentColor?: string;
  /** Makes the whole card pressable. */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /**
   * Required in practice whenever `onPress` is set: a card's content is a
   * layout, not a name, so without this a screen reader announces a button
   * with no name at all.
   */
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/**
 * The standard white card container.
 *
 * Recipe (from the reference renders): white surface, 1px #E9EEF6 hairline
 * border, 14px radius, very subtle shadow, 16px padding.
 */
export function Card({
  children,
  variant = 'padded',
  accentColor,
  onPress,
  style,
  accessibilityLabel,
  accessibilityHint,
  ...rest
}: CardProps) {
  const content = (
    <View
      {...rest}
      style={[styles.card, variant === 'padded' && styles.padded, !!accentColor && styles.withAccent, style]}
    >
      {!!accentColor && <View style={[styles.accent, { backgroundColor: accentColor }]} />}
      {children}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  padded: { padding: spacing.md },
  withAccent: { paddingLeft: spacing.md + 4 },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
});
