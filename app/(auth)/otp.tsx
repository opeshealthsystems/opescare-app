import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleQuestionMark,
  KeyRound,
  LogIn,
  Phone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { Logo } from '../../components/ui/Logo';
import { useAuthStore } from '../../lib/store/auth';
import { colors } from '../../theme/tokens';

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
 * apps/mobile-patient's login_screen.dart + otp_screen.dart split. The OTP
 * step matches the "verification screen" reference: boxed 6-digit input with a
 * blinking caret, expiry + resend countdowns, change-number row, and a
 * secure/private note. */
export default function OtpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
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
  const [otpFocused, setOtpFocused] = useState(false);
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

  const otpInputRef = useRef<TextInput>(null);
  // State updates are async; a second submit (button press racing the
  // auto-submit on the 6th digit) has to be blocked synchronously.
  const verifyingRef = useRef(false);
  const caretOpacity = useRef(new Animated.Value(1)).current;

  const step: 'phone' | 'otp' = manualStep ?? (status === 'otp_pending' ? 'otp' : 'phone');
  const expirySeconds = deadlines ? secondsUntil(deadlines.expiresAt, now) : CODE_VALIDITY_SECONDS;
  const resendCooldown = deadlines ? secondsUntil(deadlines.resendAt, now) : 0;
  const isExpired = deadlines !== null && expirySeconds === 0;
  const canResend = resendCooldown === 0 && !resending;
  const showCodeError = !!storeError && otp.length === 0;

  // Landing on the OTP step (arriving, or coming back from "change number")
  // starts a fresh validity window and a fresh cooldown, and drives the 1s tick.
  useEffect(() => {
    if (step !== 'otp') {
      setDeadlines(null);
      return;
    }
    setDeadlines(freshDeadlines());
    setNow(Date.now());
    setResendError(null);
    setResendSent(false);
    otpInputRef.current?.focus();
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);

  // Blinking caret in the active box.
  useEffect(() => {
    if (step !== 'otp' || !otpFocused) {
      caretOpacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(caretOpacity, {
          toValue: 0,
          duration: 300,
          delay: 350,
          useNativeDriver: true,
        }),
        Animated.timing(caretOpacity, {
          toValue: 1,
          duration: 300,
          delay: 150,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [step, otpFocused, caretOpacity]);

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
      // storeError carries the server's message. Clear the boxes so the next
      // attempt starts from an empty field rather than needing six deletes.
      setOtp('');
      otpInputRef.current?.focus();
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
      otpInputRef.current?.focus();
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
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <Pressable
          onPress={handleBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={
            step === 'otp' ? t('auth.changePhoneNumber') : t('auth.otpBackToSignIn')
          }
          className="mt-2 h-11 w-11 items-center justify-center rounded-full border border-brand-300 bg-white"
        >
          <ArrowLeft size={18} color={colors.brand[600]} />
        </Pressable>

        <View className="items-center pb-2 pt-3">
          <Logo size={72} />
        </View>

        {step === 'phone' ? (
          <>
            <Text className="mt-4 text-center text-2xl font-extrabold text-navy-text">
              {t('auth.welcomeBack')}
            </Text>
            <Text className="mt-2 text-center text-sm leading-5 text-navy-secondary">
              {t('auth.signInSubtitle')}
            </Text>

            <View className="mt-6 rounded-3xl border border-cream-300 bg-white p-5">
              <TextField
                label={t('auth.phoneNumber')}
                placeholder={t('auth.phoneNumberPlaceholder')}
                icon={Phone}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
              />
              <TextField
                label={t('auth.pin')}
                placeholder={t('auth.pinPlaceholder')}
                icon={KeyRound}
                secureToggle
                secureTextEntry
                keyboardType="number-pad"
                value={pin}
                onChangeText={setPin}
              />
              {storeError ? (
                <View className="mb-4 flex-row items-start rounded-2xl border border-danger bg-white p-3">
                  <CircleAlert size={16} color={colors.semantic.danger} />
                  <Text className="ml-2 flex-1 text-xs leading-4 text-danger">{storeError}</Text>
                </View>
              ) : null}
              <Button
                label={t('auth.signIn')}
                onPress={submitPhone}
                loading={submitting}
                // Guarded rather than silently no-op'ing on an empty form.
                disabled={!phoneNumber.trim() || !pin.trim()}
                showChevron={false}
              />
            </View>
          </>
        ) : (
          <>
            <Text className="mt-4 text-center text-2xl font-extrabold text-navy-text">
              {t('auth.otpTitle')}
            </Text>
            <Text className="mt-2 text-center text-sm leading-5 text-navy-secondary">
              {t('auth.otpSubtitle')}
            </Text>
            {pendingPhone ? (
              <Text className="mt-1 text-center text-base font-bold text-brand-600">
                {pendingPhone}
              </Text>
            ) : null}

            {/* The 6-digit field. A transparent TextInput covers the whole box
                row: tapping anywhere focuses it, and long-pressing raises the
                platform's own Paste menu — neither works with the 1x1
                off-screen input trick. */}
            <View className="mt-8">
              <View className="relative">
                <View className="flex-row" style={{ gap: 10 }}>
                  {Array.from({ length: OTP_LENGTH }).map((_, index) => {
                    const digit = otp[index];
                    const isActive = otpFocused && !isExpired && index === otp.length;
                    const borderColor = showCodeError
                      ? colors.semantic.danger
                      : isExpired
                        ? colors.cream[300]
                        : isActive
                          ? colors.brand[500]
                          : digit
                            ? colors.brand[300]
                            : colors.cream[300];

                    return (
                      <View
                        key={index}
                        className="items-center justify-center rounded-2xl"
                        style={{
                          flex: 1,
                          height: 62,
                          borderWidth: isActive || digit ? 2 : 1.5,
                          borderColor,
                          backgroundColor: isExpired ? colors.cream[200] : colors.white,
                          shadowColor: colors.brand[500],
                          shadowOpacity: isActive ? 0.28 : 0,
                          shadowRadius: 8,
                          shadowOffset: { width: 0, height: 0 },
                          elevation: isActive ? 3 : 0,
                        }}
                      >
                        {digit ? (
                          <Text className="text-2xl font-extrabold text-navy-text">{digit}</Text>
                        ) : isActive ? (
                          <Animated.View
                            style={{
                              width: 2,
                              height: 24,
                              borderRadius: 1,
                              backgroundColor: colors.brand[500],
                              opacity: caretOpacity,
                            }}
                          />
                        ) : null}
                      </View>
                    );
                  })}
                </View>

                <TextInput
                  ref={otpInputRef}
                  value={otp}
                  onChangeText={handleOtpChange}
                  onFocus={() => setOtpFocused(true)}
                  onBlur={() => setOtpFocused(false)}
                  editable={!isExpired && !submitting}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  autoFocus
                  caretHidden
                  accessibilityLabel={t('auth.otpInputLabel')}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 62,
                    opacity: 0,
                    // Keeps the (invisible) glyphs from nudging layout on web.
                    fontSize: 24,
                    textAlign: 'center',
                  }}
                />
              </View>

              {otp.length === 0 && !isExpired ? (
                <Text className="mt-3 text-center text-[11px] text-navy-muted">
                  {t('auth.otpEnterHint')}
                </Text>
              ) : null}

              <View className="mt-4 flex-row items-center justify-center">
                <ShieldCheck
                  size={14}
                  color={isExpired ? colors.semantic.danger : colors.brand[600]}
                />
                {isExpired ? (
                  <Text className="ml-2 text-xs font-semibold text-danger">
                    {t('auth.codeExpired')}
                  </Text>
                ) : (
                  <Text className="ml-2 text-xs text-navy-secondary">
                    {t('auth.codeExpiresIn')}{' '}
                    <Text className="font-bold text-brand-600">
                      {formatCountdown(expirySeconds, true)}
                    </Text>
                  </Text>
                )}
              </View>

              {storeError ? (
                <View className="mt-4 flex-row items-start rounded-2xl border border-danger bg-white p-3">
                  <CircleAlert size={16} color={colors.semantic.danger} />
                  <Text className="ml-2 flex-1 text-xs leading-4 text-danger">{storeError}</Text>
                </View>
              ) : null}
              {resendError ? (
                <View className="mt-4 flex-row items-start rounded-2xl border border-danger bg-white p-3">
                  <CircleAlert size={16} color={colors.semantic.danger} />
                  <Text className="ml-2 flex-1 text-xs leading-4 text-danger">{resendError}</Text>
                </View>
              ) : null}
              {resendSent && !storeError ? (
                <View className="mt-4 flex-row items-start rounded-2xl bg-brand-50 p-3">
                  <CircleCheck size={16} color={colors.brand[600]} />
                  <Text className="ml-2 flex-1 text-xs leading-4 text-navy-secondary">
                    {t('auth.otpResendSent')}
                  </Text>
                </View>
              ) : null}

              <View className="mt-5">
                <Button
                  label={t('auth.verifyAndContinue')}
                  onPress={() => void runVerify(otp)}
                  loading={submitting}
                  disabled={otp.length !== OTP_LENGTH || isExpired}
                  showChevron={false}
                />
              </View>

              <Pressable
                onPress={handleResend}
                disabled={!canResend}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canResend }}
                className="mt-3 h-14 flex-row items-center rounded-2xl border border-brand-500 bg-transparent px-4"
                style={{ opacity: canResend ? 1 : 0.55 }}
              >
                {resending ? (
                  <View className="flex-1 items-center">
                    <ActivityIndicator color={colors.brand[600]} size="small" />
                  </View>
                ) : (
                  <>
                    <RefreshCw size={16} color={colors.brand[600]} />
                    <Text className="flex-1 text-center text-base font-bold text-brand-600">
                      {t('auth.resendCode')}
                    </Text>
                    <View style={{ minWidth: 44, alignItems: 'flex-end' }}>
                      {resendCooldown > 0 ? (
                        <Text className="text-sm font-bold text-brand-600">
                          ({formatCountdown(resendCooldown, false)})
                        </Text>
                      ) : null}
                    </View>
                  </>
                )}
              </Pressable>

              <View className="my-6 flex-row items-center">
                <View className="h-px flex-1 bg-cream-300" />
                <Text className="mx-3 text-xs font-bold tracking-widest text-brand-500">
                  {t('auth.or')}
                </Text>
                <View className="h-px flex-1 bg-cream-300" />
              </View>

              <Pressable
                onPress={goToPhoneStep}
                accessibilityRole="button"
                className="h-14 flex-row items-center rounded-2xl border border-cream-300 bg-white px-4"
              >
                <Smartphone size={18} color={colors.navy.text} />
                <Text className="ml-3 flex-1 text-sm font-semibold text-navy-text">
                  {t('auth.changePhoneNumber')}
                </Text>
                <ChevronRight size={18} color={colors.navy.muted} />
              </Pressable>

              <View className="mt-5 flex-row items-start rounded-2xl bg-brand-50 p-4">
                <ShieldCheck size={16} color={colors.brand[600]} />
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-bold text-navy-text">
                    {t('auth.securePrivateTitle')}
                  </Text>
                  <Text className="mt-1 text-xs leading-4 text-navy-secondary">
                    {t('auth.securePrivateBody')}
                  </Text>
                </View>
              </View>

              <View className="mt-6 items-center">
                <View className="flex-row items-center">
                  <CircleQuestionMark size={14} color={colors.brand[600]} />
                  <Text className="ml-2 text-xs text-navy-secondary">
                    {t('auth.otpHelpPrompt')}{' '}
                    <Text className="font-semibold text-brand-600">{t('auth.otpHelpTip')}</Text>
                  </Text>
                </View>

                {/* The reference's "Contact Support" link can't be honoured
                    pre-auth — GET /mobile/support/contact sits behind
                    auth.mobile, so there is no real number to dial here. The
                    genuine escape hatch is the other sign-in route, which is
                    reachable and does exist. */}
                <Pressable
                  onPress={() => router.replace('/(auth)/login')}
                  hitSlop={8}
                  accessibilityRole="button"
                  className="mt-3 flex-row items-center"
                >
                  <LogIn size={14} color={colors.brand[600]} />
                  <Text className="ml-2 text-xs text-navy-secondary">
                    {t('auth.otpStillTrouble')}{' '}
                    <Text className="font-bold text-brand-600">{t('auth.otpTryAnotherWay')}</Text>
                  </Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
