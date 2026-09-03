import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import {
  Apple,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FlaskConical,
  Lock,
  ShieldLock,
  Stethoscope,
  User,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { Logo } from '../../components/ui/Logo';
import { MedicalWatermark } from '../../components/auth/MedicalWatermark';
import { GoogleMark } from '../../components/icons/GoogleMark';
import { useAuthStore } from '../../lib/store/auth';
import { colors } from '../../theme/tokens';

/** Dev-only quick-login shortcuts for local/demo backends (seeded by
 * DemoUsersSeeder). Only the patient account can actually sign into this
 * app — its mobile API is patient-scoped end to end — so "doctor" surfaces
 * an explainer instead of credentials that would just fail here. */
const DEMO_ACCOUNTS = [
  {
    key: 'patient',
    icon: User,
    labelKey: 'auth.demoLoginPatient',
    email: 'demo.patient@opescare.test',
    password: 'DemoPass!2026',
  },
  {
    key: 'doctor',
    icon: Stethoscope,
    labelKey: 'auth.demoLoginDoctor',
    email: null,
    password: null,
  },
] as const;

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

  return (
    <Screen>
      <MedicalWatermark opacity={0.16} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          <Pressable
            onPress={() =>
              router.canGoBack() ? router.back() : router.replace('/(auth)/welcome')
            }
            accessibilityRole="button"
            accessibilityLabel={t('auth.back')}
            hitSlop={8}
            className="mt-2 h-11 w-11 items-center justify-center rounded-full border border-brand-300"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <ArrowLeft size={18} color={colors.brand[600]} />
          </Pressable>

          <View className="items-center pb-2 pt-3">
            <Logo size={88} />
          </View>

          <Text
            className="mt-5 text-center font-extrabold text-navy-text"
            style={{ fontSize: 26, lineHeight: 32 }}
          >
            {t('auth.welcomeBack')}
          </Text>
          <Text
            className="mt-2 self-center text-center text-navy-secondary"
            style={{ fontSize: 14, lineHeight: 21, maxWidth: 300 }}
          >
            {t('auth.signInSubtitle')}
          </Text>

          {__DEV__ ? (
            <DemoAccountPicker
              open={demoMenuOpen}
              notice={demoNotice}
              onToggle={() => setDemoMenuOpen((v) => !v)}
              onSelect={handleSelectDemoAccount}
            />
          ) : null}

          <View className="mt-7">
            <TextField
              label={t('auth.emailOrHealthId')}
              placeholder={t('auth.emailPlaceholder')}
              icon={User}
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
            />

            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-navy-text">{t('auth.password')}</Text>
              <Pressable
                onPress={() => router.push('/(auth)/forgot-password')}
                accessibilityRole="link"
                hitSlop={8}
              >
                <Text className="text-sm font-semibold text-brand-500">
                  {t('auth.forgotPassword')}
                </Text>
              </Pressable>
            </View>
            <TextField
              placeholder={t('auth.passwordPlaceholder')}
              icon={Lock}
              secureToggle
              secureTextEntry
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
            />

            <Pressable
              onPress={() => setRememberMe((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: rememberMe }}
              accessibilityLabel={t('auth.rememberEmail')}
              hitSlop={6}
              className="mb-5 flex-row items-center"
            >
              <View
                className="mr-2 h-5 w-5 items-center justify-center rounded"
                style={{
                  borderWidth: 1.5,
                  borderColor: colors.brand[500],
                  backgroundColor: rememberMe ? colors.brand[500] : 'transparent',
                }}
              >
                {rememberMe ? <Check size={13} color={colors.white} strokeWidth={3} /> : null}
              </View>
              <Text className="text-sm text-navy-secondary">{t('auth.rememberEmail')}</Text>
            </Pressable>

            {storeError ? (
              <View
                className="mb-4 flex-row items-start rounded-2xl p-3"
                style={{ backgroundColor: colors.semantic.dangerSurface }}
              >
                <Text className="flex-1 text-sm text-danger">{storeError}</Text>
              </View>
            ) : null}

            <Button label={t('auth.signIn')} onPress={handleSignIn} loading={submitting} />

            <View className="my-6 flex-row items-center">
              <View className="h-px flex-1 bg-cream-300" />
              <Text className="mx-3 text-xs font-bold tracking-widest text-brand-500">
                {t('auth.or')}
              </Text>
              <View className="h-px flex-1 bg-cream-300" />
            </View>

            {/* Google / Apple sign-in has no backend: the mobile auth surface
             * exposes only email+password, phone+PIN -> OTP and password reset
             * (lib/api/endpoints.ts). Rather than ship two rows that swallow a
             * tap, they render disabled and say so. */}
            <AlternateSignIn
              renderIcon={(color) => <GoogleMark size={19} color={color} />}
              label={t('auth.continueWithGoogle')}
              badge={t('auth.soon')}
              disabled
            />
            <View className="h-3" />
            <AlternateSignIn
              icon={Apple}
              label={t('auth.continueWithApple')}
              badge={t('auth.soon')}
              disabled
            />
            <Text className="mb-3 mt-2 px-1 text-xs leading-4 text-navy-muted">
              {t('auth.socialUnavailable')}
            </Text>
            <AlternateSignIn
              icon={ShieldLock}
              label={t('auth.signInWithHealthId')}
              badge={t('auth.recommended')}
              highlighted
              onPress={() => router.push('/(auth)/otp')}
            />

            <View className="mt-5 flex-row items-start rounded-2xl bg-brand-50 p-4">
              <ShieldLock size={16} color={colors.brand[600]} style={{ marginTop: 1 }} />
              <Text className="ml-3 flex-1 text-xs leading-5 text-navy-secondary">
                {t('auth.encryptionNote')}
              </Text>
            </View>

            <Pressable
              onPress={() => router.push('/(auth)/signup')}
              accessibilityRole="link"
              className="mt-7 flex-row items-center justify-center pb-2"
              hitSlop={8}
            >
              <Text className="text-sm text-navy-secondary">{t('auth.noAccount')} </Text>
              <Text className="text-sm font-semibold text-brand-500">{t('auth.createAccount')}</Text>
              <ChevronRight size={16} color={colors.brand[500]} style={{ marginLeft: 2 }} />
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** One row in the alternate sign-in stack. A row without a real destination is
 * rendered disabled and carries a badge saying why — it must never look
 * tappable and then do nothing. */
function AlternateSignIn({
  icon: Icon,
  renderIcon,
  label,
  badge,
  highlighted = false,
  disabled = false,
  onPress,
}: {
  icon?: LucideIcon;
  renderIcon?: (color: string) => ReactNode;
  label: string;
  badge?: string;
  highlighted?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const glyphColor = disabled ? colors.navy.muted : highlighted ? colors.brand[600] : colors.navy.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label} — ${badge}` : label}
      accessibilityState={{ disabled: disabled || !onPress }}
      className="h-14 flex-row items-center rounded-2xl border bg-white px-4"
      style={({ pressed }) => ({
        borderColor: highlighted ? colors.brand[300] : colors.cream[300],
        backgroundColor: disabled ? colors.cream[50] : colors.white,
        opacity: disabled ? 0.6 : pressed ? 0.75 : 1,
      })}
    >
      {renderIcon ? renderIcon(glyphColor) : Icon ? <Icon size={19} color={glyphColor} /> : null}
      <Text
        className="ml-3 flex-1 text-sm font-semibold"
        style={{ color: disabled ? colors.navy.muted : colors.navy.text }}
        numberOfLines={1}
      >
        {label}
      </Text>
      {badge ? (
        <View
          className="rounded-full px-3 py-1"
          style={{ backgroundColor: disabled ? colors.cream[200] : colors.brand[50] }}
        >
          <Text
            className="text-[10px] font-semibold"
            style={{ color: disabled ? colors.navy.muted : colors.brand[600] }}
          >
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
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

  return (
    <View className="mt-6">
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center rounded-xl border border-dashed px-3 py-2"
        style={{ borderColor: colors.brand[300], backgroundColor: 'transparent' }}
      >
        <FlaskConical size={13} color={colors.navy.muted} />
        <Text
          className="ml-2 flex-1 font-semibold uppercase text-navy-muted"
          style={{ fontSize: 10, letterSpacing: 1 }}
          numberOfLines={1}
        >
          {t('auth.demoLoginLabel')}
        </Text>
        {open ? (
          <ChevronUp size={14} color={colors.navy.muted} />
        ) : (
          <ChevronDown size={14} color={colors.navy.muted} />
        )}
      </Pressable>

      {open ? (
        <View
          className="mt-2 overflow-hidden rounded-xl border border-dashed"
          style={{ borderColor: colors.cream[300], backgroundColor: colors.cream[50] }}
        >
          {DEMO_ACCOUNTS.map((account, index) => (
            <Pressable
              key={account.key}
              onPress={() => onSelect(account)}
              accessibilityRole="button"
              className={`flex-row items-center px-3 py-2.5 ${
                index > 0 ? 'border-t border-cream-200' : ''
              }`}
            >
              <account.icon size={14} color={colors.navy.muted} />
              <Text className="ml-2 flex-1 text-xs text-navy-secondary" numberOfLines={1}>
                {t(account.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {notice ? (
        <View
          className="mt-2 rounded-xl border border-dashed p-3"
          style={{ borderColor: colors.cream[300] }}
        >
          <Text className="text-xs leading-4 text-navy-secondary">{notice}</Text>
        </View>
      ) : null}
    </View>
  );
}
