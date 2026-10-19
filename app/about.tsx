import { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Application from 'expo-application';
import { Screen } from '@/components/ui/Screen';
import {
  Card,
  CardStack,
  Icon,
  ScreenHeader,
  SectionHeader,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, InfoRow } from '@/components/care/shared';
import { HEALTH_ID_ART } from '@/components/health-id/assets';

/**
 * About OpesCare.
 *
 * ── The seal ──────────────────────────────────────────────────────────────
 * The mark at the top is the SAME asset the Health ID credential and every
 * secure record sheet carry (`assets/health-id/seal.png`, referenced through
 * HEALTH_ID_ART so there is one source for it). That is the point: the
 * thing a clinician checks on a printed record is the thing the app calls
 * itself by. A separate "about page logo" would have been a second mark
 * claiming the same authority.
 *
 * ── What this page may and may not say ────────────────────────────────────
 * Everything here is either a fact about the software (its version, its
 * build, where its policies live) or a description of what the platform does.
 * It carries no figures about adoption, no counts of facilities or patients,
 * and no claims about outcomes — those would be marketing numbers on a screen
 * inside a health record, and nothing here is positioned to verify them.
 *
 * The version is read from the INSTALLED binary via expo-application, not from
 * the bundled config, for the same reason the update gate does: the config can
 * be stale while the app is not.
 */

const PRINCIPLES: { key: string; icon: IconName }[] = [
  { key: 'yours', icon: 'lock' },
  { key: 'travels', icon: 'globe' },
  { key: 'consent', icon: 'shield-check' },
  { key: 'bilingual', icon: 'chat' },
];

export default function AboutScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

  // The installed binary, not the bundled config — see the docblock.
  const version = Application.nativeApplicationVersion ?? null;
  const build = Application.nativeBuildVersion ?? null;

  /*
   * The policies live IN the app (app/legal/*), so these open the real screens
   * rather than the website — sending somebody out to a browser to read the
   * same document they already have is a worse version of the same answer.
   */

  return (
    <Screen className="px-0">
      <ScreenHeader title={t('about.title')} onBack={goBack} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── The seal ─────────────────────────────────────────────────────── */}
        <View style={styles.crest}>
          <Image
            source={HEALTH_ID_ART.seal}
            style={styles.seal}
            resizeMode="contain"
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('about.sealAlt')}
          />
          <Text style={styles.wordmark}>
            <Text>Opes</Text>
            <Text style={{ color: colors.blue }}>Care</Text>
          </Text>
          <Text style={styles.tagline}>{t('about.tagline')}</Text>
        </View>

        {/* ── What it is ───────────────────────────────────────────────────── */}
        <Card>
          <Text style={styles.lead}>{t('about.lead')}</Text>
        </Card>

        {/* ── What it stands on ────────────────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('about.principlesTitle')} />
          <CardStack spacing="sm">
            {PRINCIPLES.map((item) => (
              <Card key={item.key}>
                <View style={styles.principle}>
                  <View style={styles.principleMark}>
                    <Icon name={item.icon} size={26} color={colors.blue} />
                  </View>
                  <View style={styles.principleBody}>
                    <Text style={styles.principleTitle}>{t(`about.principles.${item.key}.title`)}</Text>
                    <Text style={styles.principleText}>{t(`about.principles.${item.key}.body`)}</Text>
                  </View>
                </View>
              </Card>
            ))}
          </CardStack>
        </View>

        {/* ── This build ───────────────────────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('about.buildTitle')} />
          <CardStack spacing="sm">
            <Card>
              <InfoRow icon="info" label={t('about.versionLabel')} value={version ?? t('about.versionUnknown')} />
            </Card>
            <Card>
              <InfoRow icon="grid" label={t('about.buildLabel')} value={build ?? t('about.versionUnknown')} />
            </Card>
            <Card>
              <InfoRow
                icon="id-card"
                label={t('about.packageLabel')}
                value={Application.applicationId ?? t('about.versionUnknown')}
              />
            </Card>
          </CardStack>
          {/* Honest about what "unknown" means here rather than printing a
              plausible number: on the web build there is no native layer to
              read, so there is genuinely no installed version. */}
          {version === null ? <Text style={styles.note}>{t('about.versionUnknownNote')}</Text> : null}
        </View>

        {/* ── Where the rules are written ──────────────────────────────────── */}
        <View style={styles.stack}>
          <SectionHeader title={t('about.legalTitle')} />
          <Card>
            <CareButton
              label={t('about.privacy')}
              icon="shield"
              variant="secondary"
              size="sm"
              onPress={() => router.push('/legal/privacy')}
              style={styles.legalButton}
            />
            <CareButton
              label={t('about.terms')}
              icon="document-text"
              variant="secondary"
              size="sm"
              onPress={() => router.push('/legal/terms')}
              style={styles.legalButton}
            />
            <CareButton
              label={t('about.deletion')}
              icon="trash"
              variant="secondary"
              size="sm"
              onPress={() => router.push('/account/delete')}
              style={styles.legalButton}
            />
          </Card>
        </View>

        <Text style={styles.foot}>{t('about.foot')}</Text>
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    content: {
      padding: spacing.md,
      gap: spacing.md,
      paddingBottom: spacing.xxl,
    },
    stack: { gap: spacing.sm },

    crest: { alignItems: 'center', paddingTop: spacing.sm, gap: 2 },
    seal: { width: 148, height: 148 },
    wordmark: {
      fontFamily: typography.fontFamily.bold,
      fontSize: 30,
      letterSpacing: -0.8,
      color: c.textPrimary,
      marginTop: spacing.xs,
    },
    tagline: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      letterSpacing: 0.6,
      color: c.textMuted,
      textAlign: 'center',
    },

    lead: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.md,
      color: c.textSecondary,
    },

    principle: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    principleMark: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    principleBody: { flex: 1 },
    principleTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: c.textPrimary,
    },
    principleText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textSecondary,
      marginTop: 2,
    },

    note: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
    },
    legalButton: { marginBottom: spacing.xs },

    foot: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: c.textMuted,
      textAlign: 'center',
    },
  });
