import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTranslation } from '../i18n';
import { colors, spacing, typography } from '../theme/theme';
import { Icon, IconName } from './Icon';

export type ScreenHeaderAction = {
  icon: IconName;
  onPress: () => void;
  /** Red dot / count bubble on the action (e.g. the bell). */
  badge?: number;
  accessibilityLabel?: string;
};

export type ScreenHeaderProps = {
  title: string;
  /** Secondary line under the title (CORE-008 "Manage your profile..."). */
  subtitle?: string;
  /** Show the back chevron. Default true. */
  showBack?: boolean;
  onBack?: () => void;
  /** `left` (default, large title) or `center` (compact nav-bar style). */
  align?: 'left' | 'center';
  /** Up to two right-hand icon actions. */
  actions?: ScreenHeaderAction[];
  /** Arbitrary right-hand content (e.g. a "Book New" button). Overrides `actions`. */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Screen header: back chevron + title (+ optional subtitle) + right actions.
 */
export function ScreenHeader({
  title,
  subtitle,
  showBack = true,
  onBack,
  align = 'left',
  actions,
  right,
  style,
}: ScreenHeaderProps) {
  const navigation = useNavigation();
  const { t } = useTranslation();

  function handleBack() {
    if (onBack) return onBack();
    if (navigation.canGoBack()) navigation.goBack();
  }

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.bar}>
        {showBack ? (
          <TouchableOpacity
            onPress={handleBack}
            hitSlop={10}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('components.goBack')}
            style={styles.back}
          >
            <Icon name="chevron-left" size={24} color={colors.link} strokeWidth={2.2} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backSpacer} />
        )}

        <View style={[styles.titleWrap, align === 'center' && styles.titleWrapCenter]}>
          <Text
            style={[styles.title, align === 'center' && styles.titleCenter]}
            numberOfLines={1}
            // The one landmark on every screen: a screen reader's "next
            // heading" gesture should land here first.
            accessibilityRole="header"
          >
            {title}
          </Text>
        </View>

        <View style={styles.right}>
          {right ??
            actions?.map((a, i) => (
              <TouchableOpacity
                key={i}
                onPress={a.onPress}
                hitSlop={8}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={
                  // The badge is a red bubble with a number in it — silent
                  // otherwise, and it is the reason to press the bell.
                  a.badge && a.badge > 0 && a.accessibilityLabel
                    ? `${a.accessibilityLabel} (${a.badge})`
                    : a.accessibilityLabel
                }
                style={styles.action}
              >
                <Icon name={a.icon} size={22} color={colors.link} />
                {!!a.badge && a.badge > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{a.badge > 99 ? '99+' : a.badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
        </View>
      </View>

      {!!subtitle && (
        <Text style={[styles.subtitle, align === 'center' && styles.titleCenter]}>{subtitle}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
  },
  back: { paddingRight: spacing.sm },
  backSpacer: { width: 0 },
  titleWrap: { flex: 1, minWidth: 0 },
  titleWrapCenter: { alignItems: 'center' },
  title: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xl,
    color: colors.textPrimary,
  },
  titleCenter: { textAlign: 'center' },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.sm,
  },
  action: { position: 'relative' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: 10,
    lineHeight: 13,
    color: colors.textOnBrand,
  },
  subtitle: {
    marginTop: 2,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
});
