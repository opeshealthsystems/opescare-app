import React from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { colors, radii, spacing, Tint, tintMap, typography } from '../theme/theme';
import { Icon, IconName } from './Icon';

export type EmptyStateProps = {
  icon?: IconName;
  tint?: Tint;
  title: string;
  message?: string;
  /** Primary action button. */
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  /** What the action button leads to, when its label does not say. */
  actionHint?: string;
};

/** Centred empty / zero-data state with a tint circle, copy, and optional CTA. */
export function EmptyState({
  icon = 'folder',
  tint = 'blue',
  title,
  message,
  actionLabel,
  onAction,
  style,
  actionHint,
}: EmptyStateProps) {
  const t = tintMap[tint];
  return (
    // An empty state is almost always the end of a load that started without
    // the user doing anything — "no upcoming appointments" replacing a
    // spinner. Polite, so it waits its turn rather than cutting off whatever
    // the screen reader is mid-sentence on.
    <View style={[styles.wrap, style]} accessibilityLiveRegion="polite">
      <View style={[styles.circle, { backgroundColor: t.bg }]}>
        <Icon name={icon} size={30} color={t.fg} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {!!message && <Text style={styles.message}>{message}</Text>}
      {!!actionLabel && !!onAction && (
        <TouchableOpacity
          style={styles.button}
          onPress={onAction}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityHint={actionHint}
        >
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  circle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    marginTop: spacing.xs,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  button: {
    marginTop: spacing.md,
    backgroundColor: colors.blue,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
  },
  buttonText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textOnBrand,
  },
});
