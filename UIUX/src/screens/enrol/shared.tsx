/**
 * Shared pieces for the enrolment slice (P8.2 / P8.3).
 *
 * Composition over `src/components` and `src/theme/theme` only — no new
 * primitives, no new colours.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Icon, IconName } from '../../components';
import { colors, radii, spacing, typography } from '../../theme/theme';

/** One line of a "what to bring" / "what happens next" list. */
export function Bullet({ icon, text }: { icon: IconName; text: string }) {
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
  return (
    <View style={styles.bullet}>
      <View style={styles.bulletMark}>
        <Text style={styles.stepNumber}>{index}</Text>
      </View>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

/** Soft blue note strip — the same treatment the Health ID security band uses. */
export function Note({ icon = 'info', text }: { icon?: IconName; text: string }) {
  return (
    <View style={styles.note}>
      <Icon name={icon} size={18} color={colors.blue} />
      <Text style={styles.noteText}>{text}</Text>
    </View>
  );
}

/** A form field label above an input. */
export function FieldLabel({ text }: { text: string }) {
  return <Text style={styles.fieldLabel}>{text}</Text>;
}

/** Failure text under a form. Never rendered from a raw library string. */
export function FormError({ message }: { message: string | null }) {
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

const styles = StyleSheet.create({
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
});
