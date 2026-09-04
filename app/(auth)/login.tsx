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
import { useAuthStore } from '@/lib/store/auth';

/** Dev-only quick-login shortcuts for local/demo backends (seeded by
 * DemoUsersSeeder). Only the patient account can actually sign into this
 * app — its mobile API is patient-scoped end to end — so "doctor" surfaces
 * an explainer instead of credentials that would just fail here. */
const DEMO_ACCOUNTS = [
  {
    key: 'patient',
    icon: 'person',
    labelKey: 'auth.demoLoginPatient',
    email: 'demo.patient@opescare.test',
    password: 'DemoPass!2026',
  },
  {
    key: 'doctor',
    icon: 'stethoscope',
    labelKey: 'auth.demoLoginDoctor',
    email: null,
    password: null,
  },
] as const satisfies readonly {
  key: string;
  icon: IconName;
  labelKey: string;
  email: string | null;
  password: string | null;
}[];

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
  const clearError = useAuthStore((s) => s.clearError);
  const storeError = useAuthStore((s) => s.error);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [demoMenuOpen, setDemoMenuOpen] = useState(false);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);

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
    if (storeError) clearError();
  }, [clearError, storeError]);

  const handleSelectDemoAccount = (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setDemoMenuOpen(false);
    if (account.email && account.password) {
      setEmail(account.email);
      setPassword(account.password);
      resetErrors();
      setDemoNotice(null);
    } else {
      setDemoNotice(t('auth.demoDoctorNotice'));
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
    try {
      await loginWithEmail(trimmed, password);
      try {
        if (rememberMe) await rememberedEmail.set(trimmed);
        else await rememberedEmail.clear();
      } catch {
        // Best-effort convenience only — never block a successful sign-in.
      }
    } catch {
      // storeError already reflects the failure; nothing further to do here.
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
          {__DEV__ ? (
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

          <FormError message={storeError ?? null} />

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
