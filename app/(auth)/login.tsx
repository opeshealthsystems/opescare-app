import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import {
  Card,
  GradientButton,
  Icon,
  ListRow,
  PillInput,
  Wordmark,
  StatusBadge,
  radii,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { FieldLabel, FormError } from '@/components/enrol/shared';
import { Screen } from '@/components/ui/Screen';
import { PaperWave } from '@/components/ui/PaperWave';
import { MedicalIdCard } from '@/components/emergency/MedicalIdCard';
import { useVisibleEmergencyCard } from '@/lib/emergency/sync';
import '@/lib/i18n/authRedesignStrings';
import { routeToClinicianArea, useAuthStore } from '@/lib/store/auth';
import {
  isProviderAuthUnavailable,
  isProviderCredentialsRejected,
  looksLikeProviderAccount,
} from '@/lib/api/providerQueries';
/**
 * "Remember my email" persistence. Only the identifier is stored — never the
 * password — and it is kept separately from the session token so clearing it
 * never touches auth state. Mirrors the platform split the auth store uses,
 * because expo-secure-store is a no-op on web.
 */
const REMEMBERED_EMAIL_KEY = 'opescare_remembered_email';


interface RememberedEmailStore {
  get: () => Promise<string | null>;
  set: (value: string) => Promise<void>;
  clear: () => Promise<void>;
}

const rememberedEmail: RememberedEmailStore =
  Platform.OS === 'web'
    ? {
        get: async () =>
          typeof localStorage !== 'undefined' ? localStorage.getItem(REMEMBERED_EMAIL_KEY) : null,
        set: async (value) => {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(REMEMBERED_EMAIL_KEY, value);
          }
        },
        clear: async () => {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(REMEMBERED_EMAIL_KEY);
          }
        },
      }
    : {
        get: () => SecureStore.getItemAsync(REMEMBERED_EMAIL_KEY),
        set: (value) => SecureStore.setItemAsync(REMEMBERED_EMAIL_KEY, value),
        clear: () => SecureStore.deleteItemAsync(REMEMBERED_EMAIL_KEY),
      };

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const loginWithEmail = useAuthStore((s) => s.loginWithEmail);
  const loginAsProvider = useAuthStore((s) => s.loginAsProvider);
  const clearError = useAuthStore((s) => s.clearError);
  const storeError = useAuthStore((s) => s.error);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  /** A failure this screen phrases better than the store can — it takes
   * precedence over `storeError`, which is the raw server wording. */
  const [formError, setFormError] = useState<string | null>(null);
  /** The opt-in Medical ID, when the phone's owner switched it on. */
  const medicalId = useVisibleEmergencyCard();
  /** Short phones (320x568, 360x640): tighter rhythm, collapsed Medical ID. */
  const { height } = useWindowDimensions();
  const compact = height < 760;

  // Prefill the identifier the patient last chose to remember.
  useEffect(() => {
    let cancelled = false;
    rememberedEmail
      .get()
      .then((saved) => {
        if (!cancelled && saved) setEmail(saved);
      })
      .catch(() => {
        // Storage unavailable on this device — the field just starts empty.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A stale server error must not linger over freshly typed credentials.
  const resetErrors = useCallback(() => {
    setFieldErrors((prev) => (prev.email || prev.password ? {} : prev));
    setFormError(null);
    if (storeError) clearError();
  }, [clearError, storeError]);

  /** Keep the identifier the sign-in actually succeeded with. Never the password. */
  const rememberIdentifier = async (identifier: string) => {
    try {
      if (rememberMe) await rememberedEmail.set(identifier);
      else await rememberedEmail.clear();
    } catch {
      // Best-effort convenience only — never block a successful sign-in.
    }
  };

  const handleSignIn = async () => {
    const trimmed = email.trim();
    const errors: typeof fieldErrors = {};
    if (!trimmed) errors.email = t('auth.invalidEmail');
    if (!password) errors.password = t('auth.invalidPassword');
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setFormError(null);
    try {
      await loginWithEmail(trimmed, password);
      await rememberIdentifier(trimmed);
    } catch (err) {
      // A clinician typing their own credentials reaches the patient login
      // first — there is one form, and they have no reason to know there are
      // two APIs behind it. The patient endpoint answers 404 "no patient record
      // for this account" when the password checked out but no chart belongs to
      // it, which on this platform is precisely what staff look like. So try
      // the provider login before telling them anything at all.
      if (!looksLikeProviderAccount(err)) return;

      // Keep the patient endpoint's own wording: if the provider login also
      // refuses, that is still the most specific true thing we know.
      const noPatientRecord = useAuthStore.getState().error;
      try {
        await loginAsProvider(trimmed, password);
        await rememberIdentifier(trimmed);
      } catch (providerErr) {
        if (isProviderAuthUnavailable(providerErr)) {
          setFormError(
            t('auth.clinicianSignInUnavailable', {
              defaultValue: "Clinician sign-in isn't available on this server yet.",
            }),
          );
        } else if (isProviderCredentialsRejected(providerErr) && noPatientRecord) {
          // 401 here is deliberately ambiguous ("wrong password" and "not a
          // clinician" are the same answer), and we already know the password
          // was good. So the patient endpoint's "no patient record for this
          // account" is the more specific truth — show that instead.
          setFormError(noPatientRecord);
        }
        // Anything else — notably 409, a real clinician with no facility —
        // stands in `storeError` in the server's own words.
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () =>
    router.canGoBack() ? router.back() : router.replace('/(auth)/welcome');

  return (
    <Screen className="px-0">
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, compact && styles.contentCompact]}
        >
          {/* Masthead: the Health ID's guilloche paper under the brand, the
              same document language as My Profile and the Health ID. */}
          <View style={styles.masthead}>
            <PaperWave />
            <View style={[styles.topBar, compact && styles.topBarCompact]}>
              <TouchableOpacity
                onPress={handleBack}
                accessibilityRole="button"
                accessibilityLabel={t('common.back', { defaultValue: 'Back' })}
                hitSlop={10}
                style={styles.backBtn}
              >
                <Icon name="chevron-left" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
              <Wordmark size="md" showTagline={false} />
              <View style={styles.backBtn} />
            </View>
            {compact ? null : (
              <View style={styles.eyebrowRow}>
                <Icon name="shield-check" size={14} color={colors.blue} />
                <Text style={styles.eyebrow}>{t('authRedesign.eyebrow')}</Text>
              </View>
            )}
            <Text style={styles.title} accessibilityRole="header">
              {t('auth.welcomeBack')}
            </Text>
            {compact ? null : <Text style={styles.subtitle}>{t('authRedesign.subtitle')}</Text>}
          </View>

          {medicalId ? <MedicalIdCard snapshot={medicalId} collapsible={compact} /> : null}

          <View style={styles.formCard}>
            <View>
              <FieldLabel text={t('auth.emailOrHealthId')} />
              <PillInput
                icon={<Icon name="person" size={18} color={colors.blue} />}
                placeholder={t('auth.emailPlaceholder')}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                returnKeyType="next"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  resetErrors();
                }}
                error={fieldErrors.email}
                accessibilityLabel={t('auth.emailOrHealthId')}
              />
            </View>

            <View>
              <View style={styles.labelRow}>
                <FieldLabel text={t('auth.password')} />
                <TouchableOpacity
                  onPress={() => router.push('/(auth)/forgot-password')}
                  accessibilityRole="link"
                  hitSlop={8}
                >
                  <Text style={styles.link}>{t('auth.forgotPassword')}</Text>
                </TouchableOpacity>
              </View>
              <PillInput
                icon={<Icon name="lock" size={18} color={colors.blue} />}
                placeholder={t('auth.passwordPlaceholder')}
                isPassword
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  resetErrors();
                }}
                onSubmitEditing={handleSignIn}
                error={fieldErrors.password}
                accessibilityLabel={t('auth.password')}
              />
            </View>

            <TouchableOpacity
              onPress={() => setRememberMe((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: rememberMe }}
              accessibilityLabel={t('auth.rememberEmail')}
              hitSlop={6}
              activeOpacity={0.7}
              style={styles.remember}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxOn]}>
                {rememberMe ? (
                  <Icon name="check" size={13} color={colors.textOnBrand} strokeWidth={2.6} />
                ) : null}
              </View>
              <Text style={styles.rememberText}>{t('auth.rememberEmail')}</Text>
            </TouchableOpacity>

            <FormError message={formError ?? storeError ?? null} />

            <GradientButton label={t('auth.signIn')} onPress={handleSignIn} loading={submitting} />
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('auth.or')}</Text>
            <View style={styles.dividerLine} />
          </View>

          <Card variant="flush">
            <ListRow
              icon="shield-check"
              tint="blue"
              title={t('auth.signInWithHealthId')}
              trailing={
                <StatusBadge
                  status="recommended"
                  tone="pending"
                  label={t('auth.recommended')}
                  size="sm"
                />
              }
              onPress={() => router.push('/(auth)/otp')}
              accessibilityLabel={`${t('auth.signInWithHealthId')} — ${t('auth.recommended')}`}
            />
          </Card>

          {/* Clinicians use the same form: handleSignIn falls through to the
              provider login when the account has no patient chart. */}
          <View style={styles.clinician}>
            <Icon name="first-aid" size={16} color={colors.textSecondary} />
            <View style={styles.flex1}>
              <Text style={styles.clinicianTitle}>{t('authRedesign.clinicianTitle')}</Text>
              <Text style={styles.clinicianBody}>{t('authRedesign.clinicianBody')}</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => router.push('/(auth)/signup')}
            accessibilityRole="link"
            style={styles.footerLink}
            hitSlop={8}
          >
            <Text style={[styles.footerText, styles.footerCenter]}>
              {t('auth.noAccount')} <Text style={styles.link}>{t('auth.createAccount')}</Text>
            </Text>
          </TouchableOpacity>

          <View style={styles.trust} accessible accessibilityLabel={t('auth.encryptionNote')}>
            <Icon name="lock" size={12} color={colors.textMuted} />
            <Text style={styles.trustText}>{t('auth.encryptionNote')}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1 },
    content: {
      flexGrow: 1,
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.lg,
      gap: spacing.md,
    },
    contentCompact: { gap: spacing.sm, paddingBottom: spacing.md },
    flex1: { flex: 1 },
    footerCenter: { textAlign: 'center', flexShrink: 1 },

    masthead: { paddingTop: spacing.sm, paddingBottom: spacing.xs, gap: 6 },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    topBarCompact: { marginBottom: spacing.xs },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    eyebrow: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: colors.blue,
    },
    title: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.xl + 4,
      lineHeight: typography.size.xl + 12,
      color: colors.textPrimary,
    },
    subtitle: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
      maxWidth: 320,
    },
    formCard: {
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    clinician: {
      flexDirection: 'row',
      gap: spacing.sm + 2,
      padding: spacing.md,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceMuted,
    },
    clinicianTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    clinicianBody: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
      marginTop: 2,
    },
    trust: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: spacing.md },
    trustText: {
      flexShrink: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      color: colors.textMuted,
      textAlign: 'center',
    },

    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingRight: spacing.sm,
    },
    link: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.link,
    },

    remember: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: -spacing.xs,
      marginBottom: spacing.xs,
      marginLeft: spacing.sm,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: radii.sm - 2,
      borderWidth: 1.5,
      borderColor: colors.blue,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxOn: { backgroundColor: colors.blue },
    rememberText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },

    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 4,
      marginVertical: spacing.sm,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      letterSpacing: 1.5,
      color: colors.link,
    },

    mutedCircle: {
      width: 40,
      height: 40,
      borderRadius: radii.pill,
      backgroundColor: colors.divider,
      alignItems: 'center',
      justifyContent: 'center',
    },
    meta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
      marginHorizontal: spacing.sm,
    },

    footerLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm,
      marginTop: spacing.sm,
    },
    footerText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },

  });
