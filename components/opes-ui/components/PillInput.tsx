import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path, Polygon } from 'react-native-svg';
import { useTranslation } from '../i18n';
import { radii, spacing, typography, type Palette } from '../theme';
import { useTheme } from '../ThemeProvider';
import { decorative } from './a11y';

type Props = TextInputProps & {
  icon?: React.ReactNode;
  isPassword?: boolean;
  error?: string;
};

/** Hexagon badge wrapping an icon, matching the login/signup screen inputs. */
function HexBadge({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.hexWrap}>
      <Svg width={36} height={36} viewBox="0 0 36 36" style={StyleSheet.absoluteFill}>
        <Polygon points="18,2 32,10 32,26 18,34 4,26 4,10" fill="none" stroke={colors.blue} strokeWidth={1.4} />
      </Svg>
      <View style={styles.hexIcon}>{children}</View>
    </View>
  );
}

function EyeIcon({ visible }: { visible: boolean }) {
  const { colors } = useTheme();
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Polygon points="1,12 23,12" fill="none" />
      {visible ? (
        <>
          <Ellipse cx={12} cy={12} rx={9} ry={5.5} fill="none" stroke={colors.blue} strokeWidth={1.6} />
          <Circle cx={12} cy={12} r={2.4} fill={colors.blue} />
        </>
      ) : (
        <>
          <Path
            d="M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12z"
            fill="none"
            stroke={colors.textMuted}
            strokeWidth={1.6}
          />
          <Line x1={4} y1={4} x2={20} y2={20} stroke={colors.textMuted} strokeWidth={1.6} />
        </>
      )}
    </Svg>
  );
}

export function PillInput({ icon, isPassword, error, style, ...rest }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [secure, setSecure] = useState(!!isPassword);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.container, focused && styles.containerFocused, !!error && styles.containerError]}>
        {icon && (
          <View {...decorative}>
            <HexBadge>{icon}</HexBadge>
          </View>
        )}
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secure}
          aria-invalid={!!error}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
        />
        {isPassword && (
          <TouchableOpacity
            onPress={() => setSecure((s) => !s)}
            hitSlop={10}
            accessibilityRole="button"
            // The label names the OUTCOME, not the glyph. "Eye" tells a blind
            // user nothing; "Show password" tells them what happens.
            accessibilityLabel={secure ? t('components.showPassword') : t('components.hidePassword')}
            accessibilityState={{ checked: !secure }}
          >
            <EyeIcon visible={!secure} />
          </TouchableOpacity>
        )}
      </View>
      {!!error && (
        // Validation text appears after a submit the user made but not at the
        // point they are focused, so it has to announce itself.
        <Text style={styles.errorText} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}

/**
 * WHY EVERY BOX HERE CARRIES `minWidth: 0`.
 *
 * On web a `<TextInput>` is an `<input>`, and an `<input>` in a flex row keeps
 * a content-based minimum width (roughly 20 characters) unless it is told
 * otherwise — `flex: 1` cannot shrink past it. Two of these pills side by side
 * therefore refused to go below ~210px each: on a 375px phone the prescribing
 * form's Dose/Frequency and Duration/Quantity rows measured 369px of content
 * in a 310px card, the right-hand field was clipped off the card, and focusing
 * it scrolled the left field's own label out of view ("Duration (days)"
 * rendered as "ation (days)").
 *
 * `minWidth: 0` on the wrapper, the pill and the input restores the ordinary
 * flex behaviour — the field shrinks to the space it is given. Yoga already
 * treats a flex item's minimum as 0, so this changes nothing on iOS/Android.
 */
const makeStyles = (colors: Palette) => StyleSheet.create({
  wrapper: {
    marginBottom: spacing.md,
    minWidth: 0,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.4,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    gap: spacing.sm,
    minWidth: 0,
  },
  containerFocused: {
    borderColor: colors.borderFocus,
  },
  containerError: {
    borderColor: colors.danger,
  },
  hexWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hexIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.md,
    color: colors.textPrimary,
    paddingVertical: 12,
  },
  errorText: {
    color: colors.danger,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    marginTop: 4,
    marginLeft: spacing.md,
  },
});
