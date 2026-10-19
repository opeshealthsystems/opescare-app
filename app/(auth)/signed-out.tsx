import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GradientButton, Icon, Wordmark, spacing, typography, useTheme, type Palette } from '@/components/opes-ui';
import { PaperWave } from '@/components/ui/PaperWave';
import { Screen } from '@/components/ui/Screen';
import '@/lib/i18n/authRedesignStrings';

/** How long the confirmation stays before sign-in takes over. */
const HOLD_MS = 2600;

/**
 * "You are signed out" — a brief, calm confirmation after a confirmed
 * sign-out (see components/auth/SignOutSheet.tsx), then the sign-in screen.
 */
export default function SignedOutScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    const timer = setTimeout(() => router.replace('/(auth)/login'), HOLD_MS);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <Screen className="px-0">
      <PaperWave />
      <View style={s.center}>
        <Wordmark size="lg" />
        <View style={s.badge}>
          <Icon name="check-circle" size={40} color={colors.statusNormal} />
        </View>
        <Text style={s.title} accessibilityRole="header" accessibilityLiveRegion="polite">
          {t('authRedesign.signedOut.title')}
        </Text>
        <Text style={s.body}>{t('authRedesign.signedOut.body')}</Text>
        <Text style={s.meta}>{t('authRedesign.signedOut.redirect')}</Text>
      </View>
      <View style={s.footer}>
        <GradientButton label={t('authRedesign.signedOut.cta')} onPress={() => router.replace('/(auth)/login')} />
      </View>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm + 4 },
    badge: {
      marginTop: spacing.lg,
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: c.statusNormalBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xl,
      color: c.textPrimary,
      textAlign: 'center',
    },
    body: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: c.textSecondary,
      textAlign: 'center',
    },
    meta: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs, color: c.textMuted },
    footer: { padding: spacing.lg },
  });
