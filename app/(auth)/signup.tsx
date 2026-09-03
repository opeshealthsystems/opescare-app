import { Fragment, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  Circle,
  CircleCheck,
  CircleHelp,
  CircleUserRound,
  ContactRound,
  Lock,
  LockKeyhole,
  Mail,
  Mars,
  Phone,
  ShieldCheck,
  TriangleAlert,
  User,
  UserRound,
  Users,
  Venus,
  WifiOff,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { Logo } from '../../components/ui/Logo';
import { resolvePostAuthStatus, useAuthStore } from '../../lib/store/auth';
import { tokenStorage } from '../../lib/api/tokenStorage';
import { useRegisterPatient } from '../../lib/api/queries';
import { isNetworkError } from '../../lib/offline/cache';
import type { ApiValidationErrorBody, RegisterPatientPayload } from '../../lib/api/types';
import { colors } from '../../theme/tokens';

type Sex = 'male' | 'female';
type StepNumber = 1 | 2 | 3;
const TOTAL_STEPS = 3;

const STEP_ICONS: Record<StepNumber, LucideIcon> = {
  1: UserRound,
  2: LockKeyhole,
  3: ContactRound,
};

/** Maps a server validation field name back to the step that collects it, so a
 * late (post-submit) server error — e.g. "email already taken" surfacing only
 * after the final POST — sends the patient back to the right step instead of
 * failing silently on step 3. */
const FIELD_STEP: Record<string, StepNumber> = {
  first_name: 1,
  last_name: 1,
  dob: 1,
  sex: 1,
  phone: 2,
  email: 2,
  password: 2,
  emergency_name: 3,
  emergency_relationship: 3,
  emergency_phone: 3,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Quick-fill suggestions for the free-text relationship field. The API accepts
 * any string (max 80), so these only pre-fill the input — they never constrain
 * what the patient can type. */
const RELATIONSHIP_KEYS = ['relSpouse', 'relParent', 'relSibling', 'relChild', 'relFriend'] as const;

/** Turns raw digit entry into "YYYY-MM-DD" as the patient types, without a
 * date-picker dependency this screen isn't allowed to add. Deliberately does
 * NOT rely on the input's maxLength to bound the value: a paste like
 * "12 May 1990" would be truncated by maxLength *before* the non-digits were
 * stripped, silently losing the last digits. Slicing the digit run here is the
 * only bound. */
function formatDobInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  return [y, m, d].filter(Boolean).join('-');
}

function isValidPastDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return false;
  }
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return date.getTime() < todayUtc;
}

/** Whole years between `value` (YYYY-MM-DD) and today — echoed back under the
 * masked date field so the patient can sanity-check what they typed. */
function ageFromDob(value: string): number | null {
  if (!isValidPastDate(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  const beforeBirthday =
    today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

interface PasswordChecks {
  length: boolean;
  upper: boolean;
  number: boolean;
  symbol: boolean;
}

/** Only `length` is enforced — it mirrors the API's `min:8` rule
 * (MobileAuthController::register). The other three are advisory strength
 * hints, so the checklist can show the reference's four-item card without
 * inventing client-side rules the server would happily have accepted. */
function passwordChecks(pw: string): PasswordChecks {
  return {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    number: /\d/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
}

interface SubmitFailure {
  fieldErrors?: Record<string, string>;
  /** 409 from the API — the phone or the name+dob pair already exists. */
  conflict?: string;
  banner?: string;
  offline?: boolean;
}

/** Splits a failed registration into the four shapes this screen renders
 * differently. The server's own message is always carried through — nothing is
 * collapsed into a generic string except a genuinely message-less failure. */
function classifySubmitError(err: unknown): SubmitFailure {
  const anyErr = err as { response?: { status?: number; data?: ApiValidationErrorBody } };
  const status = anyErr?.response?.status;
  const data = anyErr?.response?.data;

  if (status === 422 && data?.errors) {
    const fieldErrors: Record<string, string> = {};
    for (const key of Object.keys(data.errors)) {
      fieldErrors[key] = data.errors[key][0];
    }
    return { fieldErrors };
  }

  // Phone already registered / duplicate name+dob identity — both 409, both
  // mean "you probably already have a Health ID", so both get the recovery CTA.
  if (status === 409) return { conflict: data?.message };

  if (!anyErr?.response && isNetworkError(err)) return { offline: true };

  return { banner: data?.message };
}

/** Sign Up / Create Account — native registration flow (POST /mobile/auth/register).
 * Split into three short steps (personal / contact+security / emergency contact)
 * rather than one long form, matching the "Your Health Details" onboarding
 * reference's numbered step rail. Reached from login.tsx's "Create account" link. */
export default function SignupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const registerPatient = useRegisterPatient();
  const scrollRef = useRef<ScrollView>(null);

  const [step, setStep] = useState<StepNumber>(1);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);

  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const checks = passwordChecks(password);
  const passwordsMatch = password.length > 0 && confirmPassword === password;

  const goToStep = (next: StepNumber) => {
    setStep(next);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const clearBanners = () => {
    setBannerError(null);
    setConflictMessage(null);
    setOffline(false);
  };

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validateStep1 = (): boolean => {
    const errors: Record<string, string> = {};
    if (!firstName.trim()) errors.first_name = t('signup.errors.firstNameRequired');
    if (!lastName.trim()) errors.last_name = t('signup.errors.lastNameRequired');
    if (!dob) errors.dob = t('signup.errors.dobRequired');
    else if (!isValidPastDate(dob)) {
      errors.dob = /^\d{4}-\d{2}-\d{2}$/.test(dob)
        ? t('signup.errors.dobFuture')
        : t('signup.errors.dobInvalid');
    }
    if (!sex) errors.sex = t('signup.errors.sexRequired');
    setFieldErrors((prev) => ({ ...prev, ...errors }));
    return Object.keys(errors).length === 0;
  };

  const validateStep2 = (): boolean => {
    const errors: Record<string, string> = {};
    if (!phone.trim()) errors.phone = t('signup.errors.phoneRequired');
    if (email.trim() && !EMAIL_RE.test(email.trim())) errors.email = t('signup.errors.emailInvalid');
    // Mirrors the API rule exactly (`min:8|confirmed`) — the uppercase/number/
    // symbol items in the strength card are hints, never gates.
    if (password.length < 8) errors.password = t('signup.errors.passwordTooShort');
    if (!confirmPassword) errors.password_confirmation = t('signup.errors.confirmRequired');
    else if (confirmPassword !== password) {
      errors.password_confirmation = t('signup.errors.passwordMismatch');
    }
    setFieldErrors((prev) => ({ ...prev, ...errors }));
    return Object.keys(errors).length === 0;
  };

  const validateStep3 = (): boolean => {
    const errors: Record<string, string> = {};
    if (!emergencyName.trim()) errors.emergency_name = t('signup.errors.emergencyNameRequired');
    if (!emergencyRelationship.trim()) {
      errors.emergency_relationship = t('signup.errors.emergencyRelationshipRequired');
    }
    if (!emergencyPhone.trim()) errors.emergency_phone = t('signup.errors.emergencyPhoneRequired');
    setFieldErrors((prev) => ({ ...prev, ...errors }));
    return Object.keys(errors).length === 0;
  };

  const goNext = () => {
    clearBanners();
    const ok = step === 1 ? validateStep1() : validateStep2();
    if (ok) goToStep((step + 1) as StepNumber);
  };

  const goBack = () => {
    clearBanners();
    if (step === 1) {
      router.back();
    } else {
      goToStep((step - 1) as StepNumber);
    }
  };

  const handleSubmit = async () => {
    clearBanners();
    if (!validateStep3()) return;

    const payload: RegisterPatientPayload = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      dob,
      sex: sex as Sex,
      phone: phone.trim(),
      ...(email.trim() ? { email: email.trim() } : {}),
      emergency_name: emergencyName.trim(),
      emergency_relationship: emergencyRelationship.trim(),
      emergency_phone: emergencyPhone.trim(),
      password,
      password_confirmation: confirmPassword,
    };

    setSubmitting(true);
    try {
      const data = await registerPatient.mutateAsync(payload);
      await tokenStorage.set(data.access_token);
      await useAuthStore.getState().fetchMe();
      const nextStatus = await resolvePostAuthStatus();
      useAuthStore.setState({ status: nextStatus });
      if (nextStatus === 'permissions_pending') router.replace('/(auth)/permissions');
      // Otherwise the root layout redirects to /(tabs)/home once status flips to authenticated.
    } catch (err) {
      const failure = classifySubmitError(err);
      if (failure.fieldErrors) {
        setFieldErrors((prev) => ({ ...prev, ...failure.fieldErrors }));
        const erroredSteps = Object.keys(failure.fieldErrors).map((k) => FIELD_STEP[k] ?? 3);
        goToStep(Math.min(...erroredSteps) as StepNumber);
      } else if (failure.conflict) {
        setConflictMessage(failure.conflict);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      } else if (failure.offline) {
        setOffline(true);
      } else {
        setBannerError(failure.banner ?? t('signup.genericError'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const StepIcon = STEP_ICONS[step];

  return (
    <Screen className="px-0">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-6"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {/* Header: back affordance + the reference's "100% Secure" trust badge. */}
          <View className="mt-2 flex-row items-center justify-between">
            <Pressable
              onPress={goBack}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={step === 1 ? t('signup.back') : t('signup.backToStep')}
              className="h-11 w-11 items-center justify-center rounded-full border border-brand-300 bg-white"
            >
              <ArrowLeft size={18} color={colors.brand[600]} />
            </Pressable>

            <View className="flex-row items-center rounded-full border border-brand-300 bg-brand-50 px-3 py-2">
              <ShieldCheck size={14} color={colors.brand[600]} />
              <Text className="ml-1.5 text-[11px] font-bold text-brand-600">
                {t('signup.secureBadge')}
              </Text>
            </View>
          </View>

          <View className="items-center pb-2 pt-3">
            <Logo size={68} />
          </View>

          <Text className="mt-4 text-center text-2xl font-extrabold text-navy-text">
            {t('signup.title')}
          </Text>
          <Text className="mt-2 text-center text-sm leading-5 text-navy-secondary">
            {t('signup.subtitle')}
          </Text>

          <StepRail step={step} onSelectStep={goToStep} />

          {conflictMessage ? (
            <View className="mt-6 rounded-2xl border border-warning bg-brand-50 p-4">
              <View className="flex-row items-start">
                <TriangleAlert size={18} color={colors.semantic.warning} />
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-bold text-navy-text">
                    {t('signup.conflictTitle')}
                  </Text>
                  {/* The API's own 409 message, verbatim — never replaced. */}
                  <Text className="mt-1 text-xs leading-4 text-navy-secondary">
                    {conflictMessage}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => router.replace('/(auth)/login')}
                className="mt-3 h-11 items-center justify-center rounded-xl border border-brand-500 bg-white"
              >
                <Text className="text-sm font-bold text-brand-600">
                  {t('signup.signInInstead')}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {offline ? (
            <View className="mt-6 flex-row items-start rounded-2xl border border-cream-300 bg-white p-4">
              <WifiOff size={18} color={colors.navy.secondary} />
              <Text className="ml-3 flex-1 text-xs leading-4 text-navy-secondary">
                {t('signup.networkError')}
              </Text>
            </View>
          ) : null}

          {/* One card per step: icon chip + title + subtitle header, then the
              fields it owns — the "Medical Information" card rhythm from the
              onboarding reference. */}
          <View className="mt-6 rounded-3xl border border-cream-300 bg-white p-5">
            <View className="mb-5 flex-row items-start">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-brand-50">
                <StepIcon size={20} color={colors.brand[600]} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-base font-bold text-navy-text">
                  {t(`signup.step${step}Title` as const)}
                </Text>
                <Text className="mt-1 text-xs leading-4 text-navy-secondary">
                  {t(`signup.step${step}Subtitle` as const)}
                </Text>
              </View>
            </View>

            {step === 1 ? (
              <>
                <TextField
                  label={t('signup.firstName')}
                  placeholder={t('signup.firstNamePlaceholder')}
                  icon={User}
                  autoCapitalize="words"
                  textContentType="givenName"
                  value={firstName}
                  onChangeText={(v) => {
                    setFirstName(v);
                    clearFieldError('first_name');
                  }}
                  error={fieldErrors.first_name}
                />
                <TextField
                  label={t('signup.lastName')}
                  placeholder={t('signup.lastNamePlaceholder')}
                  icon={User}
                  autoCapitalize="words"
                  textContentType="familyName"
                  value={lastName}
                  onChangeText={(v) => {
                    setLastName(v);
                    clearFieldError('last_name');
                  }}
                  error={fieldErrors.last_name}
                />

                <DobField
                  value={dob}
                  error={fieldErrors.dob}
                  onChange={(v) => {
                    setDob(formatDobInput(v));
                    clearFieldError('dob');
                  }}
                />

                <SexPicker
                  value={sex}
                  onChange={(v) => {
                    setSex(v);
                    clearFieldError('sex');
                  }}
                  error={fieldErrors.sex}
                />
              </>
            ) : null}

            {step === 2 ? (
              <>
                <TextField
                  label={t('auth.phoneNumber')}
                  placeholder={t('auth.phoneNumberPlaceholder')}
                  icon={Phone}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  value={phone}
                  onChangeText={(v) => {
                    setPhone(v);
                    clearFieldError('phone');
                  }}
                  error={fieldErrors.phone}
                />
                <TextField
                  label={t('signup.email')}
                  placeholder={t('signup.emailPlaceholder')}
                  icon={Mail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    clearFieldError('email');
                  }}
                  error={fieldErrors.email}
                />
                <TextField
                  label={t('auth.password')}
                  placeholder={t('auth.passwordPlaceholder')}
                  icon={Lock}
                  secureToggle
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    clearFieldError('password');
                    clearFieldError('password_confirmation');
                  }}
                  error={fieldErrors.password}
                />

                <PasswordStrengthCard checks={checks} touched={password.length > 0} />

                <TextField
                  label={t('signup.confirmPassword')}
                  placeholder={t('signup.confirmPasswordPlaceholder')}
                  icon={Lock}
                  secureToggle
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                  value={confirmPassword}
                  onChangeText={(v) => {
                    setConfirmPassword(v);
                    clearFieldError('password_confirmation');
                  }}
                  error={fieldErrors.password_confirmation}
                />

                {passwordsMatch && !fieldErrors.password_confirmation ? (
                  <View className="-mt-2 mb-2 flex-row items-center">
                    <CircleCheck size={14} color={colors.semantic.success} />
                    <Text className="ml-2 text-xs font-semibold text-success">
                      {t('signup.passwordsMatch')}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : null}

            {step === 3 ? (
              <>
                <TextField
                  label={t('signup.emergencyName')}
                  placeholder={t('signup.emergencyNamePlaceholder')}
                  icon={UserRound}
                  autoCapitalize="words"
                  value={emergencyName}
                  onChangeText={(v) => {
                    setEmergencyName(v);
                    clearFieldError('emergency_name');
                  }}
                  error={fieldErrors.emergency_name}
                />

                <RelationshipField
                  value={emergencyRelationship}
                  error={fieldErrors.emergency_relationship}
                  onChange={(v) => {
                    setEmergencyRelationship(v);
                    clearFieldError('emergency_relationship');
                  }}
                />

                <TextField
                  label={t('signup.emergencyPhone')}
                  placeholder={t('signup.emergencyPhonePlaceholder')}
                  icon={Phone}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  value={emergencyPhone}
                  onChangeText={(v) => {
                    setEmergencyPhone(v);
                    clearFieldError('emergency_phone');
                  }}
                  error={fieldErrors.emergency_phone}
                />
              </>
            ) : null}
          </View>

          {bannerError ? (
            <View className="mt-4 flex-row items-start rounded-2xl border border-danger bg-white p-4">
              <TriangleAlert size={18} color={colors.semantic.danger} />
              <Text className="ml-3 flex-1 text-xs leading-4 text-danger">{bannerError}</Text>
            </View>
          ) : null}

          <View className="mt-6">
            {step < TOTAL_STEPS ? (
              <>
                <Button label={t('signup.continue')} onPress={goNext} showChevron={false} />
                <Text className="mt-3 text-center text-xs font-semibold text-navy-muted">
                  {t('signup.nextUp', { step: t(`signup.step${step + 1}Title` as const) })}
                </Text>
              </>
            ) : (
              <Button
                label={t('signup.createAccount')}
                onPress={handleSubmit}
                loading={submitting}
                showChevron={false}
              />
            )}
          </View>

          {step > 1 ? (
            <Pressable
              onPress={goBack}
              disabled={submitting}
              hitSlop={8}
              className="mt-4 h-11 flex-row items-center justify-center"
              style={{ opacity: submitting ? 0.5 : 1 }}
            >
              <ChevronLeft size={16} color={colors.navy.secondary} />
              <Text className="ml-1 text-sm font-semibold text-navy-secondary">
                {t('signup.back')}
              </Text>
            </Pressable>
          ) : null}

          {step === 1 ? (
            <View className="mt-6 flex-row items-center justify-center">
              <Text className="text-sm text-navy-secondary">{t('signup.alreadyHaveAccount')} </Text>
              <Pressable onPress={() => router.replace('/(auth)/login')} hitSlop={8}>
                <Text className="text-sm font-bold text-brand-500">{t('auth.signIn')}</Text>
              </Pressable>
            </View>
          ) : null}

          <View className="mt-6 flex-row items-start rounded-2xl bg-brand-50 p-4">
            <ShieldCheck size={16} color={colors.brand[600]} />
            <Text className="ml-3 flex-1 text-xs leading-4 text-navy-secondary">
              {t('auth.securityNote')}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** Numbered step rail — filled/checked circles joined by connectors, mirroring
 * the onboarding reference's "Account Verified → Verify Email → …" progress
 * strip. Completed circles are tappable so a patient can go back and edit
 * without losing the steps ahead. */
function StepRail({
  step,
  onSelectStep,
}: {
  step: StepNumber;
  onSelectStep: (next: StepNumber) => void;
}) {
  const { t } = useTranslation();
  const steps: StepNumber[] = [1, 2, 3];

  return (
    <View className="mt-6">
      <View className="flex-row items-start">
        {steps.map((value, index) => {
          const done = value < step;
          const active = value === step;
          const Icon = STEP_ICONS[value];
          const circleBg = done || active ? colors.brand[500] : colors.cream[200];
          const labelColor = active
            ? colors.brand[600]
            : done
              ? colors.navy.secondary
              : colors.navy.muted;

          return (
            <Fragment key={value}>
              {index > 0 ? (
                <View
                  style={{
                    flex: 1,
                    height: 2,
                    marginTop: 21,
                    borderRadius: 1,
                    backgroundColor: done || active ? colors.brand[300] : colors.cream[300],
                  }}
                />
              ) : null}
              <Pressable
                disabled={!done}
                onPress={() => onSelectStep(value)}
                accessibilityRole={done ? 'button' : undefined}
                accessibilityLabel={t('signup.stepIndicator', {
                  current: value,
                  total: TOTAL_STEPS,
                })}
                style={{ width: 84, alignItems: 'center' }}
              >
                <View
                  className="h-11 w-11 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: circleBg,
                    borderWidth: active ? 3 : 1,
                    borderColor: active ? colors.brand[100] : colors.cream[300],
                  }}
                >
                  {done ? (
                    <Check size={18} color={colors.white} />
                  ) : (
                    <Icon size={18} color={active ? colors.white : colors.navy.muted} />
                  )}
                </View>
                <Text
                  numberOfLines={2}
                  className="mt-2 text-center text-[11px] font-semibold"
                  style={{ color: labelColor }}
                >
                  {t(`signup.railStep${value}` as const)}
                </Text>
              </Pressable>
            </Fragment>
          );
        })}
      </View>

      <Text className="mt-3 text-center text-[11px] font-semibold uppercase tracking-widest text-navy-muted">
        {t('signup.stepIndicator', { current: step, total: TOTAL_STEPS })}
      </Text>
    </View>
  );
}

/** Masked date of birth. Kept as a text input on purpose (no native picker
 * dependency): the mask hint sits under the field until the date parses, then
 * it's replaced by the resulting age so a typo like 1099 is obvious. */
function DobField({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const age = ageFromDob(value);

  return (
    <View>
      <TextField
        label={t('signup.dateOfBirth')}
        placeholder={t('signup.dateOfBirthPlaceholder')}
        icon={CalendarDays}
        keyboardType="number-pad"
        inputMode="numeric"
        value={value}
        onChangeText={onChange}
        error={error}
      />
      {error ? null : (
        <View className="-mt-3 mb-4 flex-row items-center">
          {age === null ? (
            <>
              <Circle size={12} color={colors.navy.muted} />
              <Text className="ml-2 text-xs text-navy-muted">{t('signup.dobFormatHint')}</Text>
            </>
          ) : (
            <>
              <CircleCheck size={12} color={colors.brand[600]} />
              <Text className="ml-2 text-xs font-semibold text-brand-600">
                {t('signup.dobAge', { age })}
              </Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const SEX_OPTIONS: { value: Sex; icon: LucideIcon; labelKey: string }[] = [
  { value: 'male', icon: Mars, labelKey: 'signup.sexMale' },
  { value: 'female', icon: Venus, labelKey: 'signup.sexFemale' },
];

/** Two-up chip grid — the same selection language as the reference's medical
 * history chips, rather than a dropdown the API doesn't need. */
function SexPicker({
  value,
  onChange,
  error,
}: {
  value: Sex | null;
  onChange: (v: Sex) => void;
  error?: string;
}) {
  const { t } = useTranslation();

  return (
    <View className="mb-2">
      <Text className="mb-2 text-sm font-semibold text-navy-text">{t('signup.sex')}</Text>
      <View className="flex-row flex-wrap" style={{ gap: 10 }}>
        {SEX_OPTIONS.map((opt) => {
          const selected = value === opt.value;
          const OptionIcon = opt.icon;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              className="flex-row items-center rounded-2xl border px-3 py-3"
              style={{
                width: '47%',
                borderColor: selected
                  ? colors.brand[500]
                  : error
                    ? colors.semantic.danger
                    : colors.cream[300],
                backgroundColor: selected ? colors.brand[50] : colors.white,
              }}
            >
              <OptionIcon size={16} color={selected ? colors.brand[600] : colors.navy.muted} />
              <Text
                numberOfLines={1}
                className="ml-2 flex-1 text-xs font-semibold"
                style={{ color: selected ? colors.brand[600] : colors.navy.text }}
              >
                {t(opt.labelKey)}
              </Text>
              {selected ? <Check size={14} color={colors.brand[600]} /> : null}
            </Pressable>
          );
        })}
      </View>
      {error ? <Text className="mt-2 text-xs text-danger">{error}</Text> : null}
    </View>
  );
}

/** Live password checklist + strength meter. The 8-character row is the only
 * one that gates submission (it is the API's rule); the other three are shown
 * as strength hints so a valid-but-simple password is never blocked here. */
function PasswordStrengthCard({ checks, touched }: { checks: PasswordChecks; touched: boolean }) {
  const { t } = useTranslation();
  const score = Object.values(checks).filter(Boolean).length;

  const meter =
    score <= 1
      ? { color: colors.semantic.danger, labelKey: 'signup.strengthWeak' }
      : score === 2
        ? { color: colors.semantic.warning, labelKey: 'signup.strengthFair' }
        : score === 3
          ? { color: colors.brand[500], labelKey: 'signup.strengthGood' }
          : { color: colors.semantic.success, labelKey: 'signup.strengthStrong' };

  const rows: { key: keyof PasswordChecks; labelKey: string; required: boolean }[] = [
    { key: 'length', labelKey: 'signup.pwLength', required: true },
    { key: 'upper', labelKey: 'signup.pwUpper', required: false },
    { key: 'number', labelKey: 'signup.pwNumber', required: false },
    { key: 'symbol', labelKey: 'signup.pwSymbol', required: false },
  ];

  return (
    <View className="mb-4 rounded-2xl border border-cream-300 bg-cream-50 p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-bold text-navy-text">{t('signup.passwordRules')}</Text>
        {touched ? (
          <Text className="text-[11px] font-bold" style={{ color: meter.color }}>
            {t(meter.labelKey)}
          </Text>
        ) : null}
      </View>

      <View className="mt-3 flex-row" style={{ gap: 4 }}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            className="h-1.5 flex-1 rounded-full"
            style={{ backgroundColor: touched && i < score ? meter.color : colors.cream[300] }}
          />
        ))}
      </View>

      <View className="mt-3" style={{ gap: 6 }}>
        {rows.map((row) => {
          const met = checks[row.key];
          return (
            <View key={row.key} className="flex-row items-center">
              {met ? (
                <CircleCheck size={14} color={colors.brand[600]} />
              ) : (
                <Circle size={14} color={colors.navy.muted} />
              )}
              <Text
                className="ml-2 text-xs"
                style={{ color: met ? colors.navy.text : colors.navy.secondary }}
              >
                {t(row.labelKey)}
              </Text>
            </View>
          );
        })}
      </View>

      <Text className="mt-3 text-[11px] leading-4 text-navy-muted">
        {t('signup.pwRequiredNote')}
      </Text>
    </View>
  );
}

/** Free-text relationship with quick-fill chips. The chips only prefill the
 * input — anything the patient types is what gets sent. */
function RelationshipField({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <View>
      <TextField
        label={t('signup.emergencyRelationship')}
        placeholder={t('signup.emergencyRelationshipPlaceholder')}
        icon={Users}
        autoCapitalize="words"
        value={value}
        onChangeText={onChange}
        error={error}
      />
      <View className={error ? 'mb-4' : '-mt-2 mb-4'}>
        <Text className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-navy-muted">
          {t('signup.relationshipQuickPick')}
        </Text>
        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          {RELATIONSHIP_KEYS.map((key) => {
            const label = t(`signup.${key}` as const);
            const selected = value.trim().toLowerCase() === label.toLowerCase();
            return (
              <Pressable
                key={key}
                onPress={() => onChange(label)}
                className="rounded-full border px-3 py-2"
                style={{
                  borderColor: selected ? colors.brand[500] : colors.cream[300],
                  backgroundColor: selected ? colors.brand[50] : colors.white,
                }}
              >
                <Text
                  className="text-xs font-semibold"
                  style={{ color: selected ? colors.brand[600] : colors.navy.secondary }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
