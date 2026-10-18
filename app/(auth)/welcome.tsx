import { useMemo } from 'react';
import { PaperWave } from '@/components/ui/PaperWave';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  GradientButton,
  PulseLogo,
  Watermark,
  Wordmark,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { Bullet, Note } from '@/components/enrol/shared';
import { Screen } from '@/components/ui/Screen';
import { AnimatedSeal } from '@/components/auth/AnimatedSeal';

/**
 * The front door — the OPES kit's CORE-003 Onboarding Welcome, flattened onto
 * one page: brand hero, the three value marks as bullets, the data-safety
 * strip, then "Get started" / "I already have an account".
 *
 * Purely presentational — it calls no endpoint. Whether a signed-in patient
 * ever sees it is decided by `app/_layout.tsx`, which bounces an
 * authenticated session out of the `(auth)` group.
 */

/** Glyph + catalogue keys; the words are looked up per render, in locale. */
type Value = { icon: IconName; titleKey: string; bodyKey: string };

/** CORE-003 — the three value marks under the hero. */
const VALUES: Value[] = [
  {
    icon: 'shield-check',
    titleKey: 'opesCore.onboarding.valueSecure',
    bodyKey: 'opesCore.onboarding.valueSecureBody',
  },
  {
    icon: 'activity',
    titleKey: 'opesCore.onboarding.valueConnected',
    bodyKey: 'opesCore.onboarding.valueConnectedBody',
  },
  {
    icon: 'globe',
    titleKey: 'opesCore.onboarding.valueAccessible',
    bodyKey: 'opesCore.onboarding.valueAccessibleBody',
  },
];

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Screen className="px-0">
      <PaperWave />
      <Watermark />

      <ScrollView
        style={styles.pager}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.page}
      >
        <View style={styles.logoBlock}>
          <PulseLogo size={104} />
          <Wordmark size="lg" />
        </View>

        <Text style={styles.title} accessibilityRole="header">
          {t('opesCore.onboarding.welcomeTitle')}
        </Text>
        <Text style={styles.tagline}>{t('opesCore.onboarding.welcomeTagline')}</Text>
        <Text style={styles.body}>{t('opesCore.onboarding.welcomeBody')}</Text>

        {/* The Health ID's own seal stands where a generic hero glyph used to,
            so the front door shows the artwork the credential carries. */}
        <AnimatedSeal style={styles.seal} />

        <Text style={styles.sectionTitle}>{t('opesCore.onboarding.valuesTitle')}</Text>
        <View style={styles.valueList}>
          {VALUES.map((v) => (
            <Bullet key={v.titleKey} icon={v.icon} text={`${t(v.titleKey)} — ${t(v.bodyKey)}`} />
          ))}
        </View>

        <Note icon="lock" text={t('opesCore.onboarding.safetyBody')} />
      </ScrollView>

      <View style={styles.footer}>
        <GradientButton
          label={t('opesCore.onboarding.getStarted')}
          onPress={() => router.push('/(auth)/signup')}
        />
        <TouchableOpacity
          onPress={() => router.push('/(auth)/login')}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>{t('opesCore.onboarding.haveAccount')}</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    pager: { flex: 1 },
    page: { padding: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },

    logoBlock: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },

    title: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl,
      lineHeight: typography.lineHeight.xl,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    tagline: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      lineHeight: typography.lineHeight.md,
      color: colors.link,
      textAlign: 'center',
    },
    body: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
      textAlign: 'center',
    },

    seal: { alignSelf: 'center', marginVertical: spacing.sm },

    sectionTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
      marginTop: spacing.sm,
    },
    valueList: { marginBottom: spacing.sm },

    footer: {
      padding: spacing.lg,
      paddingTop: spacing.md,
      gap: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    secondary: { alignSelf: 'center', paddingVertical: spacing.sm },
    secondaryText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.link,
    },
  });
