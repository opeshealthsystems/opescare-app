/**
 * CORE-003 — Onboarding Welcome, carrying CORE-001's landing content.
 *
 * The two reference renders are the same moment drawn twice: CORE-003 is a
 * three-dot welcome carousel ("Welcome to OPES EMR" → Get Started / I already
 * have an account), CORE-001 is a landing page whose distinct content is the
 * "Everything you need, in one place" grid and the data-safety strip. Shipping
 * both as consecutive screens would put two explainers in front of a sign-in
 * the patient has to complete either way, so CORE-001's content is page two
 * and three here and CORE-003's route is the single one that exists.
 *
 * What CORE-001 also shows and this does not: Biometric / Google / Phone
 * sign-in. The API offers one credential flow (`POST /patient/auth/token`), so
 * those buttons would be decoration that fails when tapped.
 *
 * The screen reads whether there is a session and addresses the reader
 * accordingly: signed out it is the front door, signed in it is a tour with a
 * way back to the dashboard. Purely presentational — it calls no endpoint.
 */
import { useNavigation } from '@react-navigation/native';
import React, { useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Icon, IconName, PulseLogo, Wordmark } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import { markOnboardingSeen } from '../../navigation/firstRun';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { DiagButton } from '../diagnostics/shared';

/** Glyph + catalogue keys; the words are looked up per render, in locale. */
type Feature = { icon: IconName; titleKey: string; bodyKey: string };

/** CORE-001 — "Everything you need, in one place". */
const FEATURES: Feature[] = [
  { icon: 'document-text', titleKey: 'onboarding.featureRecords', bodyKey: 'onboarding.featureRecordsBody' },
  { icon: 'flask', titleKey: 'onboarding.featureLabs', bodyKey: 'onboarding.featureLabsBody' },
  {
    icon: 'calendar',
    titleKey: 'onboarding.featureAppointments',
    bodyKey: 'onboarding.featureAppointmentsBody',
  },
  { icon: 'credit-card', titleKey: 'onboarding.featureBilling', bodyKey: 'onboarding.featureBillingBody' },
  {
    icon: 'pill',
    titleKey: 'onboarding.featurePrescriptions',
    bodyKey: 'onboarding.featurePrescriptionsBody',
  },
  { icon: 'chat', titleKey: 'onboarding.featureMessaging', bodyKey: 'onboarding.featureMessagingBody' },
];

/** CORE-003 — the three value marks under the carousel. */
const VALUES: Feature[] = [
  { icon: 'shield-check', titleKey: 'onboarding.valueSecure', bodyKey: 'onboarding.valueSecureBody' },
  { icon: 'activity', titleKey: 'onboarding.valueConnected', bodyKey: 'onboarding.valueConnectedBody' },
  { icon: 'globe', titleKey: 'onboarding.valueAccessible', bodyKey: 'onboarding.valueAccessibleBody' },
];

export function OnboardingWelcomeScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { width } = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const pageWidth = Math.max(1, width);
  const lastPage = 2;

  const goTo = (next: number) => {
    const clamped = Math.min(lastPage, Math.max(0, next));
    setPage(clamped);
    scroller.current?.scrollTo({ x: clamped * pageWidth, animated: true });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
    if (next !== page) setPage(next);
  };

  /**
   * Leaving the carousel in ANY direction is what marks it seen — this screen
   * is the front door on first launch, and a front door you have walked through
   * does not open in your face again. The flag write is fire-and-forget on
   * purpose: navigation must not wait on a keystore, and a failed write costs a
   * repeated explainer, nothing more. See `navigation/firstRun.ts`.
   */
  const leave = (route: string) => {
    void markOnboardingSeen();
    navigation.navigate(route);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={styles.pager}
      >
        {/* ── 1. Welcome ─────────────────────────────────────────────── */}
        <ScrollView style={{ width: pageWidth }} contentContainerStyle={styles.page}>
          <View style={styles.logoBlock}>
            <PulseLogo size={104} />
            <Wordmark size="lg" />
          </View>
          <Text style={styles.title}>{t('onboarding.welcomeTitle')}</Text>
          <Text style={styles.tagline}>{t('onboarding.welcomeTagline')}</Text>
          <Text style={styles.body}>{t('onboarding.welcomeBody')}</Text>

          <View style={styles.heroArt}>
            <Icon name="heart-pulse" size={72} color={colors.blue} strokeWidth={1.6} />
          </View>
        </ScrollView>

        {/* ── 2. What it does (CORE-001) ─────────────────────────────── */}
        <ScrollView style={{ width: pageWidth }} contentContainerStyle={styles.page}>
          <Text style={styles.title}>{t('onboarding.featuresTitle')}</Text>
          <Text style={styles.body}>{t('onboarding.featuresBody')}</Text>

          <View style={styles.grid}>
            {FEATURES.map((f) => (
              <View key={f.titleKey} style={styles.gridTile}>
                <View style={styles.tintCircle}>
                  <Icon name={f.icon} size={22} color={colors.tintBlue} />
                </View>
                <Text style={styles.tileTitle}>{t(f.titleKey)}</Text>
                <Text style={styles.tileBody}>{t(f.bodyKey)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* ── 3. Why it is safe (CORE-003 + CORE-001 strip) ──────────── */}
        <ScrollView style={{ width: pageWidth }} contentContainerStyle={styles.page}>
          <Text style={styles.title}>{t('onboarding.valuesTitle')}</Text>
          <Text style={styles.body}>{t('onboarding.valuesBody')}</Text>

          <View style={styles.valueList}>
            {VALUES.map((v) => (
              <View key={v.titleKey} style={styles.valueRow}>
                <View style={styles.tintCircle}>
                  <Icon name={v.icon} size={22} color={colors.tintBlue} />
                </View>
                <View style={styles.valueBody}>
                  <Text style={styles.tileTitle}>{t(v.titleKey)}</Text>
                  <Text style={styles.tileBody}>{t(v.bodyKey)}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.safety}>
            <View style={styles.safetyMark}>
              <Icon name="lock" size={22} color={colors.textOnBrand} />
            </View>
            <View style={styles.valueBody}>
              <Text style={styles.tileTitle}>{t('onboarding.safetyTitle')}</Text>
              <Text style={styles.tileBody}>{t('onboarding.safetyBody')}</Text>
            </View>
          </View>
        </ScrollView>
      </ScrollView>

      {/* ── Dots + actions ───────────────────────────────────────────── */}
      <View style={styles.footer}>
        <View style={styles.dots} accessibilityRole="tablist">
          {[0, 1, 2].map((i) => (
            <TouchableOpacity
              key={i}
              onPress={() => goTo(i)}
              accessibilityRole="tab"
              accessibilityLabel={t('onboarding.pageOf', { current: i + 1, total: 3 })}
              accessibilityState={{ selected: i === page }}
              style={[styles.dot, i === page && styles.dotOn]}
            />
          ))}
        </View>

        {page < lastPage ? (
          <DiagButton
            label={t('onboarding.next')}
            iconRight="arrow-right"
            onPress={() => goTo(page + 1)}
          />
        ) : isAuthenticated ? (
          <DiagButton
            label={t('onboarding.goToDashboard')}
            iconRight="arrow-right"
            onPress={() => leave('MainTabs')}
          />
        ) : (
          <DiagButton
            label={t('onboarding.getStarted')}
            iconRight="arrow-right"
            onPress={() => leave('Signup')}
          />
        )}

        {!isAuthenticated && (
          <TouchableOpacity
            onPress={() => leave('Login')}
            accessibilityRole="button"
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>{t('onboarding.haveAccount')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
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

  heroArt: {
    alignSelf: 'center',
    marginTop: spacing.lg,
    width: 148,
    height: 148,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  gridTile: {
    flexGrow: 1,
    flexBasis: '45%',
    gap: spacing.xs,
    padding: spacing.md - 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  tintCircle: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.tintBlueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  tileBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
  },

  valueList: { marginTop: spacing.md, gap: spacing.md },
  valueRow: { flexDirection: 'row', gap: spacing.sm + 4, alignItems: 'flex-start' },
  valueBody: { flex: 1, minWidth: 0, gap: 2 },

  safety: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 4,
    marginTop: spacing.lg,
    padding: spacing.md - 2,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  safetyMark: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },

  footer: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, paddingBottom: spacing.xs },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
  },
  dotOn: { width: 22, backgroundColor: colors.blue },

  secondary: { alignSelf: 'center', paddingVertical: spacing.sm },
  secondaryText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.link,
  },
});
