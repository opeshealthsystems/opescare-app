import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  Card,
  GradientButton,
  Icon,
  ListRow,
  PillInput,
  ScreenHeader,
  radii,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { FieldLabel, FormError, Note, SecondaryButton } from '@/components/enrol/shared';
import { Screen } from '@/components/ui/Screen';
import { useAuthStore } from '@/lib/store/auth';

const OTP_LENGTH = 6;
const CODE_VALIDITY_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 45;

interface Deadlines {
  expiresAt: number;
  resendAt: number;
}

function freshDeadlines(): Deadlines {
  const base = Date.now();
  return {
    expiresAt: base + CODE_VALIDITY_SECONDS * 1000,
    resendAt: base + RESEND_COOLDOWN_SECONDS * 1000,
  };
}

/** Seconds left until `deadline`, floored at 0. Derived from wall-clock
 * timestamps rather than decremented per tick so a backgrounded app (where the
 * interval stops firing) resumes showing the real remaining time instead of a
 * timer that quietly ran slow. */
function secondsUntil(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** mm:ss countdown formatter. `padMinutes` pads the minute to 2 digits
 * ("04:59", matching the expiry timer); the resend cooldown reference shows
 * an unpadded minute ("0:45"). */
function formatCountdown(totalSeconds: number, padMinutes: boolean): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  const minuteLabel = padMinutes ? String(minutes).padStart(2, '0') : String(minutes);
  return `${minuteLabel}:${String(seconds).padStart(2, '0')}`;
}

/** Legacy phone + PIN -> OTP flow, reached via "Sign in with Health ID" on the
 * login screen. Two steps in one screen, gated on auth store status — mirrors
 * apps/mobile-patient's login_screen.dart + otp_screen.dart split. Presentation
 * is the OPES kit's phone-verification layout: ScreenHeader, FieldLabel +
 * PillInput (the code field carries `sms-otp` / `oneTimeCode` so the OS offers
 * the arriving SMS above the keyboard), expiry + resend countdowns, a
 * change-number row and the secure/private card. */
export default function OtpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const status = useAuthStore((s) => s.status);
  const storeError = useAuthStore((s) => s.error);
  const loginWithPhone = useAuthStore((s) => s.loginWithPhone);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const resendOtp = useAuthStore((s) => s.resendOtp);
  const clearError = useAuthStore((s) => s.clearError);
  const pendingPhone = useAuthStore((s) => s.pendingPhone);

  const [phoneNumber, setPhoneNumber] = useState('');
  const [pin, setPin] = useState('');
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendSent, setResendSent] = useState(false);
  // Overrides the store-driven step so "back" / "change phone number" can
  // return to the phone form without discarding the store's otp_pending
  // status (there's no store action to un-pend an OTP request). It is also
  // pinned to 'otp' while a verification is in flight: a successful verify
  // flips the store status to 'authenticated', which would otherwise derive
  // this screen back to the phone form for the frame or two before the root
  // layout redirects home.
  const [manualStep, setManualStep] = useState<'phone' | 'otp' | null>(null);
  const [deadlines, setDeadlines] = useState<Deadlines | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // State updates are async; a second submit (button press racing the
  // auto-submit on the 6th digit) has to be blocked synchronously.
  const verifyingRef = useRef(false);

  const step: 'phone' | 'otp' = manualStep ?? (status === 'otp_pending' ? 'otp' : 'phone');
  const expirySeconds = deadlines ? secondsUntil(deadlines.expiresAt, now) : CODE_VALIDITY_SECONDS;
  const resendCooldown = deadlines ? secondsUntil(deadlines.resendAt, now) : 0;
  const isExpired = deadlines !== null && expirySeconds === 0;
  const canResend = resendCooldown === 0 && !resending;

  // Landing on the OTP step (arriving, or coming back from "change number")
  // starts a fresh validity window and a fresh cooldown, and drives the 1s tick.
  // The code field itself focuses on mount (`autoFocus`), since it is
  // re-mounted with the step.
  useEffect(() => {
    if (step !== 'otp') {
      setDeadlines(null);
      return;
    }
    setDeadlines(freshDeadlines());
    setNow(Date.now());
    setResendError(null);
    setResendSent(false);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);

  const submitPhone = async () => {
    if (!phoneNumber.trim() || !pin.trim() || submitting) return;
    setSubmitting(true);
    try {
      await loginWithPhone(phoneNumber.trim(), pin.trim());
      setManualStep(null); // follow the store back to the OTP step
    } catch {
      // storeError reflects the failure
    } finally {
      setSubmitting(false);
    }
  };

  const runVerify = async (code: string) => {
    if (verifyingRef.current || code.length !== OTP_LENGTH) return;
    if (deadlines && Date.now() >= deadlines.expiresAt) return;
    verifyingRef.current = true;
    setManualStep('otp');
    setResendSent(false);
    setSubmitting(true);
    try {
      await verifyOtp(code);
    } catch {
      // storeError carries the server's message. Clear the field so the next
      // attempt starts from an empty field rather than needing six deletes.
      setOtp('');
    } finally {
      verifyingRef.current = false;
      setSubmitting(false);
    }
  };

  /** Single entry point for typed *and* pasted input. Strips non-digits before
   * bounding the length — the input deliberately carries no `maxLength`, which
   * would otherwise truncate a paste like "OpesCare code: 123456" down to six
   * characters of prefix and drop the code itself. */
  const handleOtpChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, OTP_LENGTH);
    setOtp(digits);
    if (storeError) clearError();
    if (digits.length === OTP_LENGTH) void runVerify(digits);
  };

  const handleResend = async () => {
    if (!canResend) return;
    setResending(true);
    setResendError(null);
    setResendSent(false);
    clearError();
    try {
      await resendOtp();
      setOtp('');
      setDeadlines(freshDeadlines());
      setNow(Date.now());
      setResendSent(true);
    } catch {
      setResendError(t('auth.resendFailed'));
    } finally {
      setResending(false);
    }
  };

  const goToPhoneStep = () => {
    setManualStep('phone');
    setOtp('');
    setPin('');
    clearError();
  };

  const handleBack = () => {
    if (step === 'otp') {
      goToPhoneStep();
    } else {
      router.back();
    }
  };

  return (
    <Screen className="px-0">
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenHeader
          title={step === 'phone' ? t('auth.welcomeBack') : t('auth.otpTitle')}
          subtitle={
            step === 'phone'
              ? t('auth.signInSubtitle')
              : pendingPhone
                ? `${t('auth.otpSubtitle')} ${pendingPhone}`
                : t('auth.otpSubtitle')
          }
          onBack={handleBack}
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {step === 'phone' ? (
            <>
              <View>
                <FieldLabel text={t('auth.phoneNumber')} />
                <PillInput
                  icon={<Icon name="phone" size={18} color={colors.blue} />}
                  placeholder={t('auth.phoneNumberPlaceholder')}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  returnKeyType="next"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  accessibilityLabel={t('auth.phoneNumber')}
                />
              </View>
              <View>
                <FieldLabel text={t('auth.pin')} />
                <PillInput
                  icon={<Icon name="key" size={18} color={colors.blue} />}
                  placeholder={t('auth.pinPlaceholder')}
                  isPassword
                  keyboardType="number-pad"
                  returnKeyType="go"
                  value={pin}
                  onChangeText={setPin}
                  onSubmitEditing={submitPhone}
                  accessibilityLabel={t('auth.pin')}
                />
              </View>

              <FormError message={storeError ?? null} />

              <GradientButton
                label={t('auth.signIn')}
                onPress={submitPhone}
                loading={submitting}
                // Guarded rather than silently no-op'ing on an empty form.
                disabled={!phoneNumber.trim() || !pin.trim()}
              />
            </>
          ) : (
            <>
              <View>
                <FieldLabel text={t('auth.otpInputLabel')} />
                <PillInput
                  icon={<Icon name="lock" size={18} color={colors.blue} />}
                  value={otp}
                  onChangeText={handleOtpChange}
                  editable={!isExpired && !submitting}
                  placeholder="000000"
                  keyboardType="number-pad"
                  inputMode="numeric"
                  autoCorrect={false}
                  // With `sms-otp` / `oneTimeCode` the OS reads the code out of
                  // the arriving SMS itself and offers it above the keyboard.
                  autoComplete="sms-otp"
                  textContentType="oneTimeCode"
                  autoFocus
                  accessibilityLabel={t('auth.otpInputLabel')}
                  accessibilityHint={t('auth.otpEnterHint')}
                  style={styles.codeInput}
                />
              </View>

              {otp.length === 0 && !isExpired ? (
                <Text style={styles.meta}>{t('auth.otpEnterHint')}</Text>
              ) : null}

              {/* Deliberately not a live region: it re-renders once a second. */}
              <View style={styles.expiryRow}>
                <Icon
                  name="shield-check"
                  size={14}
                  color={isExpired ? colors.statusCritical : colors.blue}
                />
                {isExpired ? (
                  <Text style={[styles.meta, styles.metaCritical]}>{t('auth.codeExpired')}</Text>
                ) : (
                  <Text style={styles.meta}>
                    {t('auth.codeExpiresIn')}{' '}
                    <Text style={styles.metaStrong}>{formatCountdown(expirySeconds, true)}</Text>
                  </Text>
                )}
              </View>

              <FormError message={storeError ?? null} />
              <FormError message={resendError} />
              {resendSent && !storeError ? (
                <Note icon="check-circle" text={t('auth.otpResendSent')} />
              ) : null}

              <GradientButton
                label={t('auth.verifyAndContinue')}
                onPress={() => void runVerify(otp)}
                loading={submitting}
                disabled={otp.length !== OTP_LENGTH || isExpired}
              />

              <SecondaryButton
                label={t('auth.resendCode')}
                icon="refresh"
                onPress={handleResend}
                loading={resending}
                disabled={!canResend}
                trailing={resendCooldown > 0 ? `(${formatCountdown(resendCooldown, false)})` : undefined}
              />

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('auth.or')}</Text>
                <View style={styles.dividerLine} />
              </View>

              <Card variant="flush">
                <ListRow
                  icon="phone"
                  tint="blue"
                  title={t('auth.changePhoneNumber')}
                  onPress={goToPhoneStep}
                />
              </Card>

              <Card style={styles.reassure}>
                <View style={styles.tintCircle}>
                  <Icon name="shield-check" size={20} color={colors.tintBlue} />
                </View>
                <View style={styles.reassureBody}>
                  <Text style={styles.reassureTitle}>{t('auth.securePrivateTitle')}</Text>
                  <Text style={styles.reassureText}>{t('auth.securePrivateBody')}</Text>
                </View>
              </Card>

              <View style={styles.help}>
                <View style={styles.helpRow}>
                  <Icon name="help-circle" size={14} color={colors.blue} />
                  <Text style={styles.meta}>
                    {t('auth.otpHelpPrompt')}{' '}
                    <Text style={styles.metaStrong}>{t('auth.otpHelpTip')}</Text>
                  </Text>
                </View>

                {/* The reference's "Contact Support" link can't be honoured
                    pre-auth — GET /mobile/support/contact sits behind
                    auth.mobile, so there is no real number to dial here. The
                    genuine escape hatch is the other sign-in route, which is
                    reachable and does exist. */}
                <TouchableOpacity
                  onPress={() => router.replace('/(auth)/login')}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={styles.helpRow}
                >
                  <Icon name="key" size={14} color={colors.blue} />
                  <Text style={styles.meta}>
                    {t('auth.otpStillTrouble')}{' '}
                    <Text style={styles.metaStrong}>{t('auth.otpTryAnotherWay')}</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1 },
    content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },

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

    help: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
    helpRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
  });
