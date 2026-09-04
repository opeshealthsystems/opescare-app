import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Polygon } from 'react-native-svg';
import { radii, shadow, spacing, typography, type Palette } from '../theme';
import { useTheme } from '../ThemeProvider';

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: 'arrow' | 'none';
  style?: ViewStyle;
  /**
   * What the button DOES, when the label alone does not say it. A label of
   * "Continue" on the last step of a booking is worth a hint; "Cancel
   * Appointment" is not — a hint on every button is noise that trains people
   * to ignore hints.
   */
  accessibilityHint?: string;
  /** Override the spoken name when the visible label is not a full sentence. */
  accessibilityLabel?: string;
};

export function GradientButton({
  label,
  onPress,
  loading,
  disabled,
  icon = 'arrow',
  style,
  accessibilityHint,
  accessibilityLabel,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      // `busy` is what makes a spinner audible: the label is replaced by an
      // ActivityIndicator while loading, so without this the control simply
      // goes silent mid-submission.
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      style={[shadow.button, style]}
    >
      <LinearGradient
        colors={isDisabled ? [colors.border, colors.border] : [colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.button}
      >
        {loading ? (
          <ActivityIndicator color={colors.textOnBrand} />
        ) : (
          <>
            <Text style={[styles.label, isDisabled && styles.labelDisabled]}>{label}</Text>
            {icon === 'arrow' && (
              <Svg width={22} height={22} viewBox="0 0 24 24">
                <Polygon
                  points="12,2 21,7 21,17 12,22 3,17 3,7"
                  fill="none"
                  stroke={isDisabled ? colors.textMuted : colors.textOnBrand}
                  strokeWidth={1.4}
                />
                <Path
                  d="M9 12h6M13 9l3 3-3 3"
                  stroke={isDisabled ? colors.textMuted : colors.textOnBrand}
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
            )}
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 18,
    borderRadius: radii.pill,
  },
  label: {
    color: colors.textOnBrand,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
  },
  labelDisabled: {
    color: colors.textMuted,
  },
});
