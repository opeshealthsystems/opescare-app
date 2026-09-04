import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTranslation } from '../i18n';
import { spacing, typography, type Palette } from '../theme';
import { useTheme } from '../ThemeProvider';
import { Icon } from './Icon';

export type SectionHeaderProps = {
  title: string;
  /** Right-hand action label. Defaults to "View All" when `onAction` is given. */
  actionLabel?: string;
  onAction?: () => void;
  /** Show a chevron after the action label (CARE-001 "View Calendar >"). */
  actionChevron?: boolean;
  /** `default` = 16px semi-bold navy. `overline` = 13px uppercase (MED-001 "MY PRESCRIPTIONS"). */
  variant?: 'default' | 'overline';
  style?: StyleProp<ViewStyle>;
};

/**
 * Section header: title on the left, optional blue "View All" link on the right.
 */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
  actionChevron = false,
  variant = 'default',
  style,
}: SectionHeaderProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const label = actionLabel ?? t('components.viewAll');

  return (
    <View style={[styles.row, style]}>
      <Text
        style={variant === 'overline' ? styles.overline : styles.title}
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {!!onAction && (
        <TouchableOpacity
          style={styles.action}
          onPress={onAction}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityRole="button"
          // "View all" is the same three words in six places on one screen.
          // Naming the section it belongs to is the only thing that makes the
          // rotor list of buttons navigable.
          accessibilityLabel={`${label}: ${title}`}
        >
          <Text style={styles.actionText}>{label}</Text>
          {actionChevron && <Icon name="chevron-right" size={16} color={colors.link} />}
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm + 2,
  },
  title: {
    flexShrink: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  overline: {
    flexShrink: 1,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textPrimary,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: spacing.sm,
  },
  actionText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.link,
  },
});
