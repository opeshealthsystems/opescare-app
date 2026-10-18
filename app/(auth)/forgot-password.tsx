import { isAxiosError } from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  PillInput,
  ScreenHeader,
  StepProgress,
  radii,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { FieldLabel, FormError, Note, SecondaryButton } from '@/components/enrol/shared';
import { Screen } from '@/components/ui/Screen';
import { useForgotPassword, useResetPassword } from '@/lib/api/queries';

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
  const message = isAxiosError<{ message?: string }>(err) ? err.response?.data?.message : undefined;
  return message ?? fallback;
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
 * mirroring app/(auth)/otp.tsx's structure, in the OPES enrolment layout.
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const forgotPassword = useForgotPassword();
  const resetPassword = useResetPassword();

  const [step, setStep] = useState<'email' | 'code' | 'success'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  // Tick both countdowns while on the code step. The code field focuses
  // itself on mount (`autoFocus`), since it is mounted with the step.
  useEffect(() => {
    if (step !== 'code') return;
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

  const headerTitle =
    step === 'email'
      ? t('forgotPassword.title')
      : step === 'code'
        ? t('forgotPassword.codeTitle')
        : t('forgotPassword.successTitle');
  const headerSubtitle =
    step === 'email'
      ? t('forgotPassword.emailSubtitle')
      : step === 'code'
        ? `${t('forgotPassword.codeSubtitle')} ${trimmedEmail}`
        : undefined;

  return (
    <Screen className="px-0">
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenHeader
          title={headerTitle}
          subtitle={headerSubtitle}
          showBack={step !== 'success'}
          onBack={handleBack}
        />

        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {step !== 'success' ? (
            <>
              <StepProgress
                steps={[
                  { key: 'email', label: t('forgotPassword.emailLabel') },
                  { key: 'code', label: t('forgotPassword.codeTitle') },
                ]}
                currentIndex={step === 'email' ? 0 : 1}
                accessibilityLabel={`${t('forgotPassword.stepOf', {
                  current: step === 'email' ? 1 : 2,
                  total: 2,
                })}: ${headerTitle}`}
              />
              <Text style={styles.stepIndicator}>
                {t('forgotPassword.stepOf', { current: step === 'email' ? 1 : 2, total: 2 })}
              </Text>
            </>
          ) : null}

          <Animated.View style={[styles.stepBody, stepStyle]}>
            {step === 'email' ? (
              <>
                <View>
                  <FieldLabel text={t('forgotPassword.emailLabel')} />
                  <PillInput
                    icon={<Icon name="mail" size={18} color={colors.blue} />}
                    placeholder={t('forgotPassword.emailPlaceholder')}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="send"
                    onSubmitEditing={handleSendCode}
                    value={email}
                    onChangeText={setEmail}
                    error={fieldErrors.email}
                    accessibilityLabel={t('forgotPassword.emailLabel')}
                  />
                </View>

                <FormError message={apiError} />

                <GradientButton
                  label={t('forgotPassword.sendCode')}
                  onPress={handleSendCode}
                  loading={forgotPassword.isPending}
                />

                <SecurePrivateCard />
              </>
            ) : null}

            {step === 'code' ? (
              <>
                <View>
                  <FieldLabel text={t('forgotPassword.invalidCode')} />
                  <PillInput
                    icon={<Icon name="lock" size={18} color={colors.blue} />}
                    value={code}
                    onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, CODE_LENGTH))}
                    placeholder="000000"
                    keyboardType="number-pad"
                    inputMode="numeric"
                    maxLength={CODE_LENGTH}
                    autoCorrect={false}
                    autoComplete="sms-otp"
                    textContentType="oneTimeCode"
                    autoFocus
                    error={fieldErrors.code}
                    accessibilityLabel={t('forgotPassword.invalidCode')}
                    style={styles.codeInput}
                  />
                </View>

                {/* Deliberately not a live region: it re-renders once a second. */}
                <View style={styles.expiryRow}>
                  <Icon
                    name="shield-check"
                    size={14}
                    color={isExpired ? colors.statusCritical : colors.blue}
                  />
                  {isExpired ? (
                    <Text style={[styles.meta, styles.metaCritical]}>
                      {t('forgotPassword.codeExpired')}
                    </Text>
                  ) : (
                    <Text style={styles.meta}>
                      {t('forgotPassword.codeExpiresIn')}{' '}
                      <Text style={styles.metaStrong}>{formatCountdown(expirySeconds, true)}</Text>
                    </Text>
                  )}
                </View>

                <View>
                  <FieldLabel text={t('forgotPassword.newPassword')} />
                  <PillInput
                    icon={<Icon name="lock" size={18} color={colors.blue} />}
                    placeholder={t('forgotPassword.newPasswordPlaceholder')}
                    isPassword
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    error={fieldErrors.newPassword}
                    accessibilityLabel={t('forgotPassword.newPassword')}
                  />
                </View>

                <PasswordStrength score={score} checks={checks} />

                <View>
                  <FieldLabel text={t('forgotPassword.confirmPassword')} />
                  <PillInput
                    icon={<Icon name="lock" size={18} color={colors.blue} />}
                    placeholder={t('forgotPassword.confirmPasswordPlaceholder')}
                    isPassword
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    error={fieldErrors.confirmPassword}
                    accessibilityLabel={t('forgotPassword.confirmPassword')}
                  />
                </View>

                {passwordsMatch ? (
                  <View style={styles.matchRow} accessibilityLiveRegion="polite">
                    <Icon name="check-circle" size={14} color={colors.statusNormal} />
                    <Text style={styles.matchText}>{t('forgotPassword.passwordsMatch')}</Text>
                  </View>
                ) : null}

                <FormError message={apiError} />

                <GradientButton
                  label={t('forgotPassword.resetPassword')}
                  onPress={handleResetPassword}
                  loading={resetPassword.isPending}
                  disabled={code.length !== CODE_LENGTH || isExpired}
                />

                <SecondaryButton
                  label={t('forgotPassword.resendCode')}
                  icon="refresh"
                  onPress={handleResend}
                  loading={resending}
                  disabled={resendCooldown > 0 || resending}
                  trailing={
                    resendCooldown > 0 ? `(${formatCountdown(resendCooldown, false)})` : undefined
                  }
                />
                <FormError message={resendError} />

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>{t('auth.or')}</Text>
                  <View style={styles.dividerLine} />
                </View>

                <Card variant="flush">
                  <ListRow
                    icon="mail"
                    tint="blue"
                    title={t('forgotPassword.changeEmail')}
                    onPress={goToEmailStep}
                  />
                </Card>

                <SecurePrivateCard />

                <View style={styles.help}>
                  <View style={styles.helpRow}>
                    <Icon name="help-circle" size={14} color={colors.blue} />
                    <Text style={styles.meta}>
                      {t('forgotPassword.helpPrompt')}{' '}
                      <Text style={styles.metaStrong}>{t('forgotPassword.checkSpam')}</Text>
                    </Text>
                  </View>
                  <Text style={styles.meta}>
                    {t('forgotPassword.stillTrouble')}{' '}
                    <Text style={styles.metaStrong}>{t('forgotPassword.contactSupport')}</Text>
                  </Text>
                </View>
              </>
            ) : null}

            {step === 'success' ? (
              <>
                <EmptyState
                  icon="check-circle"
                  tint="green"
                  title={t('forgotPassword.successTitle')}
                  message={t('forgotPassword.successBody')}
                />

                {/* The backend revokes every existing mobile token for the linked
                    patient on a successful reset, so say so rather than letting
                    the patient discover it on another device. */}
                <Note icon="shield-check" text={t('forgotPassword.successSecurityNote')} />

                <GradientButton
                  label={t('forgotPassword.backToSignIn')}
                  onPress={() => router.replace('/(auth)/login')}
                />
              </>
            ) : null}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** Reassurance card carrying the anti-enumeration explanation in plain
 * language — the honest reason the flow behaves the same for any address. */
function SecurePrivateCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Card style={styles.reassure}>
      <View style={styles.tintCircle}>
        <Icon name="shield-check" size={20} color={colors.tintBlue} />
      </View>
      <View style={styles.reassureBody}>
        <Text style={styles.reassureTitle}>{t('forgotPassword.securePrivateTitle')}</Text>
        <Text style={styles.reassureText}>{t('forgotPassword.securePrivateBody')}</Text>
      </View>
    </Card>
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
function PasswordStrength({ score, checks }: { score: 0 | 1 | 2 | 3 | 4; checks: PasswordChecks }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (score === 0) return null;

  const tone =
    score === 1
      ? colors.statusCritical
      : score === 2
        ? colors.statusWarning
        : score === 3
          ? colors.blue
          : colors.statusNormal;

  const label =
    score === 1
      ? t('forgotPassword.strengthWeak')
      : score === 2
        ? t('forgotPassword.strengthFair')
        : score === 3
          ? t('forgotPassword.strengthGood')
          : t('forgotPassword.strengthStrong');

  return (
    <View style={styles.strength}>
      <View style={styles.strengthHeader}>
        <Text style={styles.strengthTitle}>{t('forgotPassword.passwordStrength')}</Text>
        <Text style={[styles.strengthLabel, { color: tone }]}>{label}</Text>
      </View>

      <View style={styles.meterRow}>
        {[1, 2, 3, 4].map((segment) => (
          <View
            key={segment}
            style={[styles.meterSegment, segment <= score && { backgroundColor: tone }]}
          />
        ))}
      </View>

      <View style={styles.ruleGrid}>
        {REQUIREMENT_KEYS.map(({ key, label: labelKey }) => {
          const met = checks[key];
          return (
            <View key={key} style={styles.ruleRow}>
              <Icon name="check-circle" size={13} color={met ? colors.statusNormal : colors.border} />
              <Text style={[styles.ruleText, met && styles.ruleTextMet]}>{t(labelKey)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1 },
    content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
    stepBody: { gap: spacing.sm },

    stepIndicator: {
      marginTop: spacing.xs,
      marginBottom: spacing.xs,
      textAlign: 'center',
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },

    codeInput: { letterSpacing: 6, fontFamily: typography.fontFamily.semiBold },

    meta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
      marginLeft: spacing.sm,
    },
    metaStrong: { fontFamily: typography.fontFamily.semiBold, color: colors.link },
    metaCritical: { fontFamily: typography.fontFamily.semiBold, color: colors.statusCritical },
    expiryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      marginBottom: spacing.xs,
    },

    matchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: -spacing.sm,
      marginLeft: spacing.sm,
    },
    matchText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.statusNormal,
    },

    strength: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
      gap: spacing.sm + 2,
    },
    strengthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    strengthTitle: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    strengthLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs },
    meterRow: { flexDirection: 'row', gap: 4 },
    meterSegment: { flex: 1, height: 6, borderRadius: radii.pill, backgroundColor: colors.border },
    ruleGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 },
    ruleRow: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: spacing.sm },
    ruleText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    ruleTextMet: { color: colors.textSecondary },

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

    reassure: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 4 },
    reassureBody: { flex: 1, minWidth: 0, gap: 2 },
    reassureTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    reassureText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },
    tintCircle: {
      width: 40,
      height: 40,
      borderRadius: radii.pill,
      backgroundColor: colors.tintBlueBg,
      alignItems: 'center',
      justifyContent: 'center',
    },

    help: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, paddingBottom: spacing.md },
    helpRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  });
