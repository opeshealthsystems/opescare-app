import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleCheckBig,
  CircleQuestionMark,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { Logo } from '../../components/ui/Logo';
import { useForgotPassword, useResetPassword } from '../../lib/api/queries';
import { colors } from '../../theme/tokens';

const CODE_LENGTH = 6;
const CODE_VALIDITY_SECONDS = 15 * 60; // matches the backend's PasswordResetCode expiry
const RESEND_COOLDOWN_SECONDS = 45;
const MIN_PASSWORD_LENGTH = 8; // matches the backend's `min:8` rule
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** react-native-web has no native animation driver; opting in there warns. */
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

/** mm:ss countdown formatter — mirrors app/(auth)/otp.tsx's formatter. */
function formatCountdown(totalSeconds: number, padMinutes: boolean): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  const minuteLabel = padMinutes ? String(minutes).padStart(2, '0') : String(minutes);
  return `${minuteLabel}:${String(seconds).padStart(2, '0')}`;
}

function extractErrorMessage(err: unknown, fallback: string): string {
  const anyErr = err as any;
  return anyErr?.response?.data?.message ?? fallback;
}

type PasswordChecks = {
  length: boolean;
  case: boolean;
  number: boolean;
  symbol: boolean;
};

/**
 * Client-side strength read-out only — the server's rule is `min:8`, and this
 * never blocks submission beyond that. It exists so the patient can see what
 * makes the password stronger while typing, not to invent a second policy.
 * Score 0 = empty; 1..4 = weak / fair / good / strong.
 */
function evaluatePassword(password: string): { checks: PasswordChecks; score: 0 | 1 | 2 | 3 | 4 } {
  const checks: PasswordChecks = {
    length: password.length >= MIN_PASSWORD_LENGTH,
    case: /[a-z]/.test(password) && /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
  if (password.length === 0) return { checks, score: 0 };
  // Too short is always "weak", however many character classes it mixes —
  // the backend rejects it outright, so it must never read as acceptable.
  if (!checks.length) return { checks, score: 1 };
  const met = [checks.length, checks.case, checks.number, checks.symbol].filter(Boolean).length;
  return { checks, score: met as 1 | 2 | 3 | 4 };
}

/**
 * Forgot Password — reached from the "Forgot password?" link on login.tsx.
 * Three steps in one screen (email -> code + new password -> success),
 * mirroring app/(auth)/otp.tsx's structure and the boxed-code-entry pattern
 * of `Mobile app screens/a_clean_mobile_app_verification_screen_smartphone.png`.
 *
 * Talks to POST /mobile/auth/forgot-password + /mobile/auth/reset-password
 * (real endpoints — see routes/mobile_password_reset.php on the backend),
 * not a WebView to the (non-functional) web forgot-password route.
 *
 * ANTI-ENUMERATION — do not "fix" this into a nicer confirmation. The backend
 * answers `forgot-password` with the same 200 + generic message whether or not
 * a user exists for that address (MobileAuthController::forgotPassword), so
 * this screen always advances to the code step and its copy is phrased
 * conditionally ("If an account matches this address…"). Any change that lets
 * the UI reveal whether an address is registered reintroduces account
 * enumeration.
 */
export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const forgotPassword = useForgotPassword();
  const resetPassword = useResetPassword();

  const [step, setStep] = useState<'email' | 'code' | 'success'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [codeFocused, setCodeFocused] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    code?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [expirySeconds, setExpirySeconds] = useState(CODE_VALIDITY_SECONDS);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  const codeInputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const stepAnim = useRef(new Animated.Value(1)).current;

  const isExpired = expirySeconds <= 0;
  const trimmedEmail = email.trim();
  const { checks, score } = useMemo(() => evaluatePassword(newPassword), [newPassword]);
  const passwordsMatch =
    confirmPassword.length > 0 && newPassword === confirmPassword && checks.length;

  // Each step arrives with a short fade + lift, and the scroll returns to the
  // top, so a step change reads as a transition rather than a content swap.
  useEffect(() => {
    stepAnim.setValue(0);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    Animated.timing(stepAnim, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [step, stepAnim]);

  // Tick both countdowns while on the code step, and focus the hidden input.
  useEffect(() => {
    if (step !== 'code') return;
    codeInputRef.current?.focus();
    const id = setInterval(() => {
      setExpirySeconds((s) => (s > 0 ? s - 1 : 0));
      setResendCooldown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  const goToEmailStep = () => {
    setStep('email');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setFieldErrors({});
    setApiError(null);
    setResendError(null);
  };

  const handleSendCode = async () => {
    if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
      setFieldErrors({ email: t('forgotPassword.invalidEmail') });
      return;
    }
    setFieldErrors({});
    setApiError(null);
    try {
      await forgotPassword.mutateAsync(trimmedEmail);
      setExpirySeconds(CODE_VALIDITY_SECONDS);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      // Always advances — the response is identical for a registered and an
      // unregistered address. See the anti-enumeration note above.
      setStep('code');
    } catch (err) {
      setApiError(extractErrorMessage(err, t('forgotPassword.genericError')));
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setResendError(null);
    try {
      await forgotPassword.mutateAsync(trimmedEmail);
      setCode('');
      setExpirySeconds(CODE_VALIDITY_SECONDS);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      codeInputRef.current?.focus();
    } catch {
      setResendError(t('forgotPassword.resendFailed'));
    } finally {
      setResending(false);
    }
  };

  const handleResetPassword = async () => {
    const errors: typeof fieldErrors = {};
    if (code.trim().length !== CODE_LENGTH) errors.code = t('forgotPassword.invalidCode');
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      errors.newPassword = t('forgotPassword.passwordTooShort');
    } else if (newPassword !== confirmPassword) {
      errors.confirmPassword = t('forgotPassword.passwordMismatch');
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setApiError(null);
    try {
      await resetPassword.mutateAsync({
        email: trimmedEmail,
        code: code.trim(),
        password: newPassword,
        password_confirmation: confirmPassword,
      });
      setStep('success');
    } catch (err) {
      setApiError(extractErrorMessage(err, t('forgotPassword.genericError')));
    }
  };

  const handleBack = () => {
    if (step === 'code') {
      goToEmailStep();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      // Deep-linked straight to /forgot-password: there is nothing to pop, so
      // send them to the screen this one is normally reached from.
      router.replace('/(auth)/login');
    }
  };

  const stepStyle = {
    opacity: stepAnim,
    transform: [
      { translateY: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
    ],
  };

  return (
    <Screen>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {step !== 'success' ? (
          <Pressable
            onPress={handleBack}
            hitSlop={8}
            accessibilityRole="button"
            className="mt-2 h-11 w-11 items-center justify-center rounded-full border border-brand-300"
          >
            <ArrowLeft size={18} color={colors.brand[600]} />
          </Pressable>
        ) : null}

        <View className="items-center py-4">
          <Logo size={80} markOnly />
        </View>

        {step !== 'success' ? <StepProgress step={step} /> : null}

        <Animated.View style={stepStyle}>
          {step === 'email' ? (
            <>
              <Text className="text-center text-2xl font-extrabold text-navy-text">
                {t('forgotPassword.title')}
              </Text>
              <Text className="mt-2 text-center text-sm leading-5 text-navy-secondary">
                {t('forgotPassword.emailSubtitle')}
              </Text>

              <View className="mt-6">
                <TextField
                  label={t('forgotPassword.emailLabel')}
                  placeholder={t('forgotPassword.emailPlaceholder')}
                  icon={Mail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="send"
                  onSubmitEditing={handleSendCode}
                  value={email}
                  onChangeText={setEmail}
                  error={fieldErrors.email}
                />

                {apiError ? (
                  <Text className="mb-3 text-center text-sm text-danger">{apiError}</Text>
                ) : null}

                <Button
                  label={t('forgotPassword.sendCode')}
                  onPress={handleSendCode}
                  loading={forgotPassword.isPending}
                  leftIcon={Mail}
                />

                <SecurePrivateCard t={t} />
              </View>
            </>
          ) : null}

          {step === 'code' ? (
            <>
              <Text className="text-center text-2xl font-extrabold text-navy-text">
                {t('forgotPassword.codeTitle')}
              </Text>
              <Text className="mt-2 text-center text-sm leading-5 text-navy-secondary">
                {t('forgotPassword.codeSubtitle')}
                {'\n'}
                <Text className="font-semibold text-brand-600">{trimmedEmail}</Text>
              </Text>

              <View className="mt-8">
                <Pressable onPress={() => codeInputRef.current?.focus()}>
                  <View className="flex-row justify-between">
                    {Array.from({ length: CODE_LENGTH }).map((_, index) => {
                      const digit = code[index];
                      const isActive =
                        codeFocused && index === Math.min(code.length, CODE_LENGTH - 1);
                      const borderColor = isExpired
                        ? colors.semantic.danger
                        : isActive
                          ? colors.brand[500]
                          : digit
                            ? colors.brand[300]
                            : colors.cream[300];
                      return (
                        <View
                          key={index}
                          className="h-16 items-center justify-center rounded-2xl border-2 bg-white"
                          style={{
                            width: 46,
                            borderColor,
                            shadowColor: colors.brand[500],
                            shadowOpacity: isActive ? 0.3 : 0,
                            shadowRadius: 6,
                            shadowOffset: { width: 0, height: 0 },
                            elevation: isActive ? 3 : 0,
                          }}
                        >
                          {digit ? (
                            <Text className="text-xl font-bold text-navy-text">{digit}</Text>
                          ) : isActive ? (
                            <View
                              style={{ width: 2, height: 22, backgroundColor: colors.brand[500] }}
                            />
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </Pressable>
                <TextInput
                  ref={codeInputRef}
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, CODE_LENGTH))}
                  onFocus={() => setCodeFocused(true)}
                  onBlur={() => setCodeFocused(false)}
                  keyboardType="number-pad"
                  maxLength={CODE_LENGTH}
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  caretHidden
                  style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
                />
                {fieldErrors.code ? (
                  <Text className="mt-2 text-center text-xs text-danger">{fieldErrors.code}</Text>
                ) : null}

                <View className="mt-4 flex-row items-center justify-center">
                  <ShieldCheck
                    size={14}
                    color={isExpired ? colors.semantic.danger : colors.brand[600]}
                  />
                  {isExpired ? (
                    <Text className="ml-2 text-xs font-semibold text-danger">
                      {t('forgotPassword.codeExpired')}
                    </Text>
                  ) : (
                    <Text className="ml-2 text-xs text-navy-secondary">
                      {t('forgotPassword.codeExpiresIn')}{' '}
                      <Text className="font-bold text-brand-600">
                        {formatCountdown(expirySeconds, true)}
                      </Text>
                    </Text>
                  )}
                </View>

                <View className="mt-6">
                  <TextField
                    label={t('forgotPassword.newPassword')}
                    placeholder={t('forgotPassword.newPasswordPlaceholder')}
                    icon={Lock}
                    secureToggle
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    error={fieldErrors.newPassword}
                  />

                  <PasswordStrength score={score} checks={checks} t={t} />

                  <View className="mt-4">
                    <TextField
                      label={t('forgotPassword.confirmPassword')}
                      placeholder={t('forgotPassword.confirmPasswordPlaceholder')}
                      icon={Lock}
                      secureToggle
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="newPassword"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      error={fieldErrors.confirmPassword}
                    />
                  </View>

                  {passwordsMatch ? (
                    <View className="-mt-2 mb-3 flex-row items-center">
                      <CircleCheckBig size={13} color={colors.semantic.success} />
                      <Text className="ml-2 text-xs font-semibold text-success">
                        {t('forgotPassword.passwordsMatch')}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {apiError ? (
                  <Text className="mb-2 text-center text-sm text-danger">{apiError}</Text>
                ) : null}

                <Button
                  label={t('forgotPassword.resetPassword')}
                  onPress={handleResetPassword}
                  loading={resetPassword.isPending}
                  disabled={code.length !== CODE_LENGTH || isExpired}
                  leftIcon={Lock}
                />

                <Pressable
                  onPress={handleResend}
                  disabled={resendCooldown > 0 || resending}
                  accessibilityRole="button"
                  className="mt-3 h-14 flex-row items-center justify-between rounded-2xl border border-brand-500 bg-transparent px-4"
                  style={{ opacity: resendCooldown > 0 || resending ? 0.6 : 1 }}
                >
                  {resending ? (
                    <ActivityIndicator color={colors.brand[600]} size="small" />
                  ) : (
                    <>
                      <Text className="text-base font-semibold text-brand-600">
                        {t('forgotPassword.resendCode')}
                      </Text>
                      {resendCooldown > 0 ? (
                        <Text className="text-sm font-semibold text-brand-600">
                          ({formatCountdown(resendCooldown, false)})
                        </Text>
                      ) : null}
                    </>
                  )}
                </Pressable>
                {resendError ? (
                  <Text className="mt-2 text-center text-sm text-danger">{resendError}</Text>
                ) : null}

                <View className="my-6 flex-row items-center">
                  <View className="h-px flex-1 bg-cream-300" />
                  <Text className="mx-3 text-xs font-semibold text-navy-muted">
                    {t('auth.or')}
                  </Text>
                  <View className="h-px flex-1 bg-cream-300" />
                </View>

                <Pressable
                  onPress={goToEmailStep}
                  accessibilityRole="button"
                  className="h-14 flex-row items-center rounded-2xl border border-cream-300 bg-white px-4"
                >
                  <Mail size={18} color={colors.navy.text} />
                  <Text className="ml-3 flex-1 text-sm font-semibold text-navy-text">
                    {t('forgotPassword.changeEmail')}
                  </Text>
                  <ChevronRight size={18} color={colors.navy.muted} />
                </Pressable>

                <SecurePrivateCard t={t} />

                <View className="mt-6 items-center pb-4">
                  <View className="flex-row items-center">
                    <CircleQuestionMark size={14} color={colors.brand[600]} />
                    <Text className="ml-2 text-xs text-navy-secondary">
                      {t('forgotPassword.helpPrompt')}{' '}
                      <Text className="font-semibold text-brand-600">
                        {t('forgotPassword.checkSpam')}
                      </Text>
                    </Text>
                  </View>
                  <Text className="mt-2 text-xs text-navy-secondary">
                    {t('forgotPassword.stillTrouble')}{' '}
                    <Text className="font-semibold text-brand-600">
                      {t('forgotPassword.contactSupport')}
                    </Text>
                  </Text>
                </View>
              </View>
            </>
          ) : null}

          {step === 'success' ? (
            <View className="mt-6 items-center">
              <View
                className="h-20 w-20 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.semantic.successSurface }}
              >
                <CheckCircle2 size={40} color={colors.semantic.success} />
              </View>
              <Text className="mt-6 text-center text-2xl font-extrabold text-navy-text">
                {t('forgotPassword.successTitle')}
              </Text>
              <Text className="mt-2 text-center text-sm leading-5 text-navy-secondary">
                {t('forgotPassword.successBody')}
              </Text>

              {/* The backend revokes every existing mobile token for the linked
                  patient on a successful reset, so say so rather than letting
                  the patient discover it on another device. */}
              <View className="mt-6 w-full flex-row items-start rounded-2xl bg-brand-50 p-4">
                <ShieldCheck size={16} color={colors.brand[600]} />
                <Text className="ml-3 flex-1 text-xs leading-4 text-navy-secondary">
                  {t('forgotPassword.successSecurityNote')}
                </Text>
              </View>

              <View className="mt-8 w-full">
                <Button
                  label={t('forgotPassword.backToSignIn')}
                  onPress={() => router.replace('/(auth)/login')}
                />
              </View>
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

/** Segmented rail + "Step 1 of 2" — makes the request/confirm split legible
 * before the patient commits to it. Deliberately the same rail geometry as
 * app/(auth)/signup.tsx's StepProgress so the two multi-step auth flows read
 * as one system; the label is centred here to suit this screen's composition. */
function StepProgress({ step }: { step: 'email' | 'code' }) {
  const { t } = useTranslation();
  const current = step === 'email' ? 1 : 2;

  return (
    <View className="mb-6">
      <View className="flex-row" style={{ gap: 6 }}>
        {[1, 2].map((segment) => (
          <View
            key={segment}
            className="h-1.5 flex-1 rounded-full"
            style={{
              backgroundColor: segment <= current ? colors.brand[500] : colors.cream[300],
            }}
          />
        ))}
      </View>
      <Text className="mt-2 text-center text-xs font-semibold text-navy-muted">
        {t('forgotPassword.stepOf', { current, total: 2 })}
      </Text>
    </View>
  );
}

/** Reassurance card carrying the anti-enumeration explanation in plain
 * language — the honest reason the flow behaves the same for any address. */
function SecurePrivateCard({ t }: { t: (key: string) => string }) {
  return (
    <View className="mt-5 flex-row items-start rounded-2xl bg-brand-50 p-4">
      <ShieldCheck size={16} color={colors.brand[600]} />
      <View className="ml-3 flex-1">
        <Text className="text-sm font-semibold text-navy-text">
          {t('forgotPassword.securePrivateTitle')}
        </Text>
        <Text className="mt-1 text-xs leading-4 text-navy-secondary">
          {t('forgotPassword.securePrivateBody')}
        </Text>
      </View>
    </View>
  );
}

const REQUIREMENT_KEYS: Array<{ key: keyof PasswordChecks; label: string }> = [
  { key: 'length', label: 'forgotPassword.reqLength' },
  { key: 'case', label: 'forgotPassword.reqCase' },
  { key: 'number', label: 'forgotPassword.reqNumber' },
  { key: 'symbol', label: 'forgotPassword.reqSymbol' },
];

/** Four-segment strength rail + a live requirement checklist. Advisory only:
 * submission is gated on the server's rule (8 characters), never on the score. */
function PasswordStrength({
  score,
  checks,
  t,
}: {
  score: 0 | 1 | 2 | 3 | 4;
  checks: PasswordChecks;
  t: (key: string) => string;
}) {
  if (score === 0) return null;

  const tone =
    score === 1
      ? colors.semantic.danger
      : score === 2
        ? colors.semantic.warning
        : score === 3
          ? colors.brand[500]
          : colors.semantic.success;

  const label =
    score === 1
      ? t('forgotPassword.strengthWeak')
      : score === 2
        ? t('forgotPassword.strengthFair')
        : score === 3
          ? t('forgotPassword.strengthGood')
          : t('forgotPassword.strengthStrong');

  return (
    <View className="-mt-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-navy-secondary">{t('forgotPassword.passwordStrength')}</Text>
        <Text className="text-xs font-bold" style={{ color: tone }}>
          {label}
        </Text>
      </View>

      <View className="mt-2 flex-row" style={{ gap: 4 }}>
        {[1, 2, 3, 4].map((segment) => (
          <View
            key={segment}
            className="h-1.5 flex-1 rounded-full"
            style={{ backgroundColor: segment <= score ? tone : colors.cream[300] }}
          />
        ))}
      </View>

      <View className="mt-3 flex-row flex-wrap" style={{ rowGap: 6 }}>
        {REQUIREMENT_KEYS.map(({ key, label: labelKey }) => {
          const met = checks[key];
          return (
            <View
              key={key}
              className="flex-row items-center pr-2"
              style={{ width: '50%' }}
            >
              {met ? (
                <CircleCheckBig size={13} color={colors.semantic.success} />
              ) : (
                <Circle size={13} color={colors.navy.muted} />
              )}
              <Text
                className="ml-2 flex-1 text-xs"
                style={{ color: met ? colors.navy.secondary : colors.navy.muted }}
              >
                {t(labelKey)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
