import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { PulseLogo } from '../components/PulseLogo';
import { Wordmark } from '../components/Wordmark';
import { useTranslation } from '../i18n';
import { colors, spacing, typography } from '../theme/theme';

type Props = {
  onFinished: () => void;
};

const FEATURE_KEYS = [
  'splash.markSecure',
  'splash.markInteroperable',
  'splash.markCloudReady',
  'splash.markDataDriven',
];

export function SplashScreen({ onFinished }: Props) {
  const { t } = useTranslation();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 1400,
      useNativeDriver: false,
    });
    anim.start();

    // Decoupled from the animation's own completion callback: rAF-driven
    // Animated timing can stall in a backgrounded/unfocused tab (observed in
    // preview tooling), which would otherwise strand the user on the splash
    // screen indefinitely. A plain timer always fires.
    const timer = setTimeout(onFinished, 1400);

    return () => {
      anim.stop();
      clearTimeout(timer);
    };
  }, [progress, onFinished]);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <PulseLogo size={140} />
        <View style={{ marginTop: spacing.lg, alignItems: 'center' }}>
          <Wordmark size="lg" />
        </View>

        <Text style={styles.tagline1}>{t('splash.tagline1')}</Text>
        <Text style={styles.tagline2}>{t('splash.tagline2')}</Text>

        <View style={styles.features}>
          {FEATURE_KEYS.map((key, i) => (
            <React.Fragment key={key}>
              <Text style={styles.featureText}>{t(key)}</Text>
              {i < FEATURE_KEYS.length - 1 && <View style={styles.featureDivider} />}
            </React.Fragment>
          ))}
        </View>
      </View>

      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width }]} />
        </View>
        <Text style={styles.loadingText}>{t('splash.loading')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Opaque: the splash renders BEFORE the navigation tree / page base, so it
    // must paint its own solid ground (see `colors.background`).
    backgroundColor: colors.page,
    justifyContent: 'space-between',
    paddingVertical: spacing.xxl,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  tagline1: {
    marginTop: spacing.lg,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    letterSpacing: 1,
    color: colors.textPrimary,
  },
  tagline2: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    letterSpacing: 1,
    color: colors.blue,
    marginTop: 2,
  },
  features: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  featureText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginHorizontal: spacing.sm,
  },
  featureDivider: {
    width: 1,
    height: 14,
    backgroundColor: colors.border,
  },
  progressWrap: {
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.blue,
    borderRadius: 2,
  },
  loadingText: {
    marginTop: spacing.sm,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.blue,
  },
});
