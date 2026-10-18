import React from 'react';
import { Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Icon, PulseLogo, Wordmark, spacing, useTheme, type IconName } from '@/components/opes-ui';
import { CoverPhoto } from './CoverPhoto';
import { useProfileStyles } from './styles';

export type MastheadAction = {
  icon: IconName;
  label: string;
  onPress: () => void;
};

/**
 * The brand bar of the My Profile reference: one action on the left (settings
 * on the patient's own tab, back everywhere else), the pulse mark and
 * wordmark centred, and on the right an optional bell with a real unread
 * count and an optional avatar. Pieces a screen does not pass are not drawn.
 */
export function ProfileMasthead({
  left,
  bell,
  avatar,
}: {
  left?: MastheadAction;
  bell?: { count: number; onPress: () => void };
  avatar?: {
    photoUrl?: string | null;
    photoFailed?: boolean;
    onPhotoFail?: () => void;
    initials: string;
    label: string;
    onPress?: () => void;
  };
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useProfileStyles();
  const unreadCount = bell?.count ?? 0;
  const showPhoto = !!avatar?.photoUrl && !avatar.photoFailed;

  return (
    <View style={styles.topBar}>
      {left ? (
        <TouchableOpacity
          onPress={left.onPress}
          // 21pt glyph in a 30pt box: 12pt all round takes the target to 54pt.
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={left.label}
          style={styles.topBarSide}
        >
          <Icon name={left.icon} size={21} color={colors.textPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.topBarSide} />
      )}

      <View style={styles.topBarBrand}>
        <PulseLogo size={34} />
        <Wordmark size="md" showTagline />
      </View>

      <View style={styles.topBarActions}>
        {bell ? (
          <TouchableOpacity
            onPress={bell.onPress}
            // 20pt glyph + 2pt padding = 24pt; 8pt of slop left a 40pt target.
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={
              unreadCount > 0
                ? `${t('profile.notifications', { defaultValue: 'Notifications' })}, ${t('profile.unreadBadge', { n: unreadCount, defaultValue: '{{n}} unread' })}`
                : t('profile.notifications', { defaultValue: 'Notifications' })
            }
            style={styles.topBarBell}
          >
            <Icon name="bell" size={20} color={colors.textPrimary} />
            {unreadCount > 0 ? (
              <View style={styles.topBarBadge}>
                <Text style={styles.topBarBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ) : null}

        {avatar ? (
          <TouchableOpacity
            onPress={avatar.onPress}
            disabled={!avatar.onPress}
            hitSlop={6}
            accessibilityRole={avatar.onPress ? 'button' : 'image'}
            accessibilityLabel={avatar.label}
            style={styles.topAvatarWrap}
          >
            {showPhoto ? (
              <CoverPhoto
                uri={avatar.photoUrl as string}
                width={34}
                height={34}
                radius={17}
                onFail={() => avatar.onPhotoFail?.()}
              />
            ) : (
              <View style={[styles.topAvatar, styles.topAvatarFallback]}>
                <Text style={styles.topAvatarText}>{avatar.initials}</Text>
              </View>
            )}
            {/* Signed in — the one thing a dot here can honestly mean. */}
            <View style={styles.topAvatarDot} />
          </TouchableOpacity>
        ) : null}
        {/* Keeps the brand centred when the right side is empty. */}
        {!bell && !avatar ? <View style={styles.topBarSide} /> : null}
      </View>
    </View>
  );
}

/** Page heading with the motto block the render carries beside it. */
export function ProfileHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  const { t } = useTranslation();
  const styles = useProfileStyles();
  const { width: windowWidth } = useWindowDimensions();
  // The motto rule beside the heading was capped at a flat 122pt. On a 320pt
  // screen that is 42% of the row; on a tablet it stayed a thin ribbon.
  const mottoWidth = Math.round(
    Math.max(96, Math.min(150, (windowWidth - spacing.md * 2) * 0.36)),
  );
  return (
    <View style={styles.headingRow}>
      <View style={styles.headingText}>
        <Text style={styles.headingTitle} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={styles.headingSub}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.motto, { maxWidth: mottoWidth }]}>
        <Text style={styles.mottoText}>{t('profile.motto', { defaultValue: 'A HEALTHIER PEOPLE\nA STRONGER AFRICA' })}</Text>
      </View>
    </View>
  );
}
