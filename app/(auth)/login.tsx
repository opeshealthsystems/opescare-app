import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import {
  Card,
  GradientButton,
  Icon,
  ListRow,
  ScreenHeader,
  PillInput,
  StatusBadge,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { FieldLabel, FormError, Note } from '@/components/enrol/shared';
import { Screen } from '@/components/ui/Screen';
import { GoogleMark } from '@/components/icons/GoogleMark';
import { routeToClinicianArea, useAuthStore } from '@/lib/store/auth';
import {
  isProviderAuthUnavailable,
  isProviderCredentialsRejected,
  looksLikeProviderAccount,
} from '@/lib/api/providerQueries';

/**
 * The demo clinician's credentials.
 *
 * Overridable at export time so a deployment can point the demo at whichever
 * clinician its seeder actually created, without a code change. The default
 * follows the Finder demo convention (`demo.<role>@opescare.test` / `demo1234`).
 */
const DEMO_CLINICIAN_EMAIL =
  process.env.EXPO_PUBLIC_DEMO_CLINICIAN_EMAIL ?? 'demo.doctor@opescare.test';
const DEMO_CLINICIAN_PASSWORD = process.env.EXPO_PUBLIC_DEMO_CLINICIAN_PASSWORD ?? 'demo1234';

/** One-tap demo sign-in. Shown when the build is a demo build (or in dev):
 * this app is deployed as a public demo, where a visitor has no credentials
 * and an empty login screen is a dead end.
 *
 * The clinician entry is a REAL sign-in: it posts the demo clinician's
 * credentials to `/mobile/auth/provider/login`, and when that succeeds the
 * session is an actual provider token with actual clinician data behind it.
 * Only when the server serves no provider auth AT ALL does it fall back to the
 * old behaviour — the demo patient session plus the clinician UI preview — and
 * the notice under the menu then says exactly that. A server that HAS the
 * endpoint and refuses these credentials is reported, never papered over. */
const DEMO_ACCOUNTS = [
  {
    key: 'patient',
    icon: 'person',
    labelKey: 'auth.demoLoginPatient',
    email: 'demo.patient@opescare.test',
    password: 'demo1234',
    clinician: false,
  },
  {
    // A second patient with a verified identity and the full clinical story
    // (DemoPatientStorySeeder), so a reviewer sees every state of the Health
    // ID card and every screen populated without typing anything.
    key: 'reviewer',
    icon: 'shield-check',
    labelKey: 'auth.demoLoginReviewer',
    email: 'demo.reviewer@opescare.test',
    password: 'demo1234',
    clinician: false,
  },
  {
    key: 'doctor',
    icon: 'stethoscope',
    labelKey: 'auth.demoLoginDoctor',
    email: DEMO_CLINICIAN_EMAIL,
    password: DEMO_CLINICIAN_PASSWORD,
    clinician: true,
  },
  // The other staff the Finder seeds. Same real provider sign-in as the
  // doctor; the clinician area adapts (no prescribing for non-prescribers).
  { key: 'nurse', icon: 'activity', labelKey: 'auth.demoLoginNurse', email: 'demo.nurse@opescare.test', password: 'demo1234', clinician: true },
  { key: 'pharmacist', icon: 'pill', labelKey: 'auth.demoLoginPharmacist', email: 'demo.pharmacist@opescare.test', password: 'demo1234', clinician: true },
  { key: 'receptionist', icon: 'clipboard', labelKey: 'auth.demoLoginReceptionist', email: 'demo.receptionist@opescare.test', password: 'demo1234', clinician: true },
] as const satisfies readonly {
  key: string;
  icon: IconName;
  labelKey: string;
  email: string | null;
  password: string | null;
  clinician: boolean;
}[];

/** The patient account the clinician preview falls back onto — on a server with
 * no provider auth it is the only way into the app at all. */
const DEMO_PATIENT = DEMO_ACCOUNTS[0];

/**
 * "Remember my email" persistence. Only the identifier is stored — never the
 * password — and it is kept separately from the session token so clearing it
 * never touches auth state. Mirrors the platform split the auth store uses,
 * because expo-secure-store is a no-op on web.
 */
const REMEMBERED_EMAIL_KEY = 'opescare_remembered_email';

/**
 * Demo sign-in is visible in development, and in any build exported with
 * EXPO_PUBLIC_DEMO_LOGINS=1 — which is how finder.opescare.cloud/app is built.
 * A real production build sets neither and never renders it.
 */
const SHOW_DEMO_LOGINS =
  __DEV__ ||
  process.env.EXPO_PUBLIC_DEMO_LOGINS === '1' ||
  process.env.EXPO_PUBLIC_DEMO_LOGINS === 'true';

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
  const [demoMenuOpen, setDemoMenuOpen] = useState(false);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);
  /** A failure this screen phrases better than the store can — it takes
   * precedence over `storeError`, which is the raw server wording. */
  const [formError, setFormError] = useState<string | null>(null);

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

  const handleSelectDemoAccount = async (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setDemoMenuOpen(false);
    if (!account.email || !account.password) return;

    // Fill the fields too, so the tap is legible and a failure leaves the
    // form ready to retry by hand rather than mysteriously empty.
    setEmail(account.email);
    setPassword(account.password);
    resetErrors();
    setDemoNotice(null);

    // Whatever a previous tap left switched on, this one decides again from
    // scratch — a preview must never leak into the next session, of either kind.
    useAuthStore.getState().previewClinician(false);

    setSubmitting(true);
    try {
      if (!account.clinician) {
        await loginWithEmail(account.email, account.password);
        return;
      }

      // The clinician demo is a real provider sign-in first.
      try {
        await loginAsProvider(account.email, account.password);
        return;
      } catch (err) {
        // A server that HAS provider auth and refused these credentials has
        // given a real answer: the demo clinician is not seeded here, or the
        // credentials are wrong. Say so (the store already holds the server's
        // words) rather than quietly showing an empty imitation of the app.
        if (!isProviderAuthUnavailable(err)) return;
      }

      // No provider auth on this server at all. Fall back to what this screen
      // did before there was any: the demo PATIENT session, with the clinician
      // screens switched on for a look. The notice below says so in plain
      // words, because this session carries no clinician data whatsoever.
      clearError();
      setFormError(null);
      setDemoNotice(t('auth.demoDoctorNotice'));
      useAuthStore.getState().previewClinician(true);
      try {
        await loginWithEmail(DEMO_PATIENT.email, DEMO_PATIENT.password);
        // Only jump to the clinician side once the session has actually
        // settled. A first-run device lands on the permissions primer instead,
        // and yanking it away from that would strand the router.
        if (useAuthStore.getState().status === 'authenticated') routeToClinicianArea();
      } catch {
        // Even the patient demo is refused — leave nothing pretending otherwise.
        useAuthStore.getState().previewClinician(false);
        setDemoNotice(null);
      }
    } catch {
      // The store surfaces the reason; leave the filled form for a manual retry.
      useAuthStore.getState().previewClinician(false);
    } finally {
      setSubmitting(false);
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
        <ScreenHeader
          title={t('auth.welcomeBack')}
          subtitle={t('auth.signInSubtitle')}
          onBack={handleBack}
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {SHOW_DEMO_LOGINS ? (
            <DemoAccountPicker
              open={demoMenuOpen}
              notice={demoNotice}
              onToggle={() => setDemoMenuOpen((v) => !v)}
              onSelect={handleSelectDemoAccount}
            />
          ) : null}

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

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('auth.or')}</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google / Apple sign-in has no backend: the mobile auth surface
           * exposes only email+password, phone+PIN -> OTP and password reset
           * (lib/api/endpoints.ts). Rather than ship two rows that swallow a
           * tap, they render disabled and say so. */}
          <Card variant="flush">
            <ListRow
              leading={
                <View style={styles.mutedCircle}>
                  <GoogleMark size={18} color={colors.textMuted} strokeWidth={1.8} />
                </View>
              }
              title={t('auth.continueWithGoogle')}
              trailing={<StatusBadge status="soon" tone="neutral" label={t('auth.soon')} size="sm" />}
              chevron={false}
              accessibilityLabel={`${t('auth.continueWithGoogle')} — ${t('auth.soon')}`}
              divider
            />
            <ListRow
              leading={
                <View style={styles.mutedCircle}>
                  <Icon name="id-card" size={20} color={colors.textMuted} />
                </View>
              }
              title={t('auth.continueWithApple')}
              trailing={<StatusBadge status="soon" tone="neutral" label={t('auth.soon')} size="sm" />}
              chevron={false}
              accessibilityLabel={`${t('auth.continueWithApple')} — ${t('auth.soon')}`}
              divider
            />
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
          <Text style={styles.meta}>{t('auth.socialUnavailable')}</Text>

          <Note icon="lock" text={t('auth.encryptionNote')} />

          <TouchableOpacity
            onPress={() => router.push('/(auth)/signup')}
            accessibilityRole="link"
            style={styles.footerLink}
            hitSlop={8}
          >
            <Text style={styles.footerText}>{t('auth.noAccount')} </Text>
            <Text style={styles.link}>{t('auth.createAccount')}</Text>
            <Icon name="chevron-right" size={16} color={colors.link} />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** __DEV__-only credential shortcut. Deliberately understated — dashed hairline
 * border, muted type, lab-flask glyph — so it reads as scaffolding sitting on
 * top of the screen, never as part of the shipped product chrome. */
function DemoAccountPicker({
  open,
  notice,
  onToggle,
  onSelect,
}: {
  open: boolean;
  notice: string | null;
  onToggle: () => void;
  onSelect: (account: (typeof DEMO_ACCOUNTS)[number]) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.demo}>
      <TouchableOpacity
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        activeOpacity={0.7}
        style={styles.demoToggle}
      >
        <Icon name="flask" size={13} color={colors.textMuted} />
        <Text style={styles.demoLabel} numberOfLines={1}>
          {t('auth.demoLoginLabel')}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
      </TouchableOpacity>

      {open ? (
        <View style={styles.demoMenu}>
          {DEMO_ACCOUNTS.map((account, index) => (
            <TouchableOpacity
              key={account.key}
              onPress={() => onSelect(account)}
              accessibilityRole="button"
              activeOpacity={0.7}
              style={[styles.demoRow, index > 0 && styles.demoRowDivider]}
            >
              <Icon name={account.icon} size={14} color={colors.textMuted} />
              <Text style={styles.demoRowText} numberOfLines={1}>
                {t(account.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {notice ? (
        <View style={styles.demoNotice}>
          <Text style={styles.demoNoticeText}>{notice}</Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1 },
    content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },

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

    demo: { marginBottom: spacing.sm },
    demoToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: spacing.sm,
    },
    demoLabel: {
      flex: 1,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 10,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },
    demoMenu: {
      marginTop: spacing.sm,
      overflow: 'hidden',
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceMuted,
    },
    demoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: 10,
    },
    demoRowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    demoRowText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    demoNotice: {
      marginTop: spacing.sm,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      borderRadius: radii.md,
      padding: spacing.sm + 4,
    },
    demoNoticeText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
  });
