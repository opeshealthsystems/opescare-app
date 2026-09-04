/**
 * Shared pieces for the auth / enrolment screens — the OPES kit's
 * `screens/enrol/shared.tsx`, ported onto `@/components/opes-ui`.
 *
 * Composition over the kit only: no new primitives, no hardcoded colours.
 * Every colour is read at render through `useTheme()`, so the pieces follow
 * the palette switch like the rest of the kit.
 *
 * `Bullet`, `Step`, `Note`, `FieldLabel`, `FormError` and `clock` are the
 * kit's exports, unchanged in signature. `SecondaryButton` is the one addition:
 * the kit ships only `GradientButton`, and the auth flows need an outline
 * counterpart ("Resend code", "I already have an account", "Skip for now").
 */
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import {
  Icon,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';

/** One line of a "what to bring" / "what happens next" list. */
export function Bullet({ icon, text }: { icon: IconName; text: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.bullet}>
      <View style={styles.bulletMark}>
        <Icon name={icon} size={16} color={colors.blue} />
      </View>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

/** A numbered step, for a sequence the patient will go through. */
export function Step({ index, text }: { index: number; text: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.bullet}>
      <View style={styles.bulletMark}>
        <Text style={styles.stepNumber}>{index}</Text>
      </View>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

/** Soft brand-tinted note strip — the same treatment the Health ID security band uses. */
export function Note({ icon = 'info', text }: { icon?: IconName; text: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.note}>
      <Icon name={icon} size={18} color={colors.blue} />
      <Text style={styles.noteText}>{text}</Text>
    </View>
  );
}

/** A form field label above an input. */
export function FieldLabel({ text }: { text: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <Text style={styles.fieldLabel}>{text}</Text>;
}

/** Failure text under a form. Never rendered from a raw library string. */
export function FormError({ message }: { message: string | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!message) return null;
  return (
    // Assertive: this is a submission the patient just made coming back
    // refused, and everything they do next depends on hearing it. It replaces
    // nothing — it appears — so a polite region could sit unspoken behind the
    // rest of the form.
    <View style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <Icon name="alert-circle" size={18} color={colors.statusCritical} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

/** `seconds` as m:ss — a clock, so it belongs in code, not the catalogue. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export type SecondaryButtonProps = {
  label: string;
  onPress: () => void;
  /** Leading glyph. */
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** Small right-hand text, e.g. a resend countdown "(0:45)". */
  trailing?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/**
 * Outline pill button — the secondary action beside a `GradientButton`.
 * Same height and radius as the primary so the two stack as one system.
 */
export function SecondaryButton({
  label,
  onPress,
  icon,
  loading,
  disabled,
  trailing,
  style,
  accessibilityLabel,
  accessibilityHint,
}: SecondaryButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isDisabled = !!disabled || !!loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      style={[styles.secondary, isDisabled && styles.secondaryDisabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={colors.blue} />
      ) : (
        <>
          {!!icon && <Icon name={icon} size={18} color={colors.blue} />}
          <Text style={styles.secondaryLabel} numberOfLines={1}>
            {label}
          </Text>
          {!!trailing && <Text style={styles.secondaryTrailing}>{trailing}</Text>}
        </>
      )}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
    bulletMark: {
      width: 28,
      height: 28,
      borderRadius: radii.pill,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumber: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.blue,
    },
    bulletText: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
      paddingTop: 4,
    },

    note: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      backgroundColor: colors.primarySoft,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    noteText: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },

    fieldLabel: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
      marginBottom: 6,
      marginLeft: spacing.sm,
    },

    error: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      backgroundColor: colors.statusCriticalBg,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    errorText: {
      flex: 1,
      minWidth: 0,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },

    secondary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: 16,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      borderWidth: 1.4,
      borderColor: colors.blue,
      backgroundColor: colors.surface,
    },
    secondaryDisabled: { opacity: 0.55 },
    secondaryLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.blue,
    },
    secondaryTrailing: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.blue,
    },
  });
