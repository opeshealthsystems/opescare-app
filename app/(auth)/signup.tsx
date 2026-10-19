import { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Chip,
  GradientButton,
  Icon,
  PillInput,
  ScreenHeader,
  StatusBadge,
  StepProgress,
  radii,
  spacing,
  typography,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { FieldLabel, FormError, Note, SecondaryButton } from '@/components/enrol/shared';
import { Screen } from '@/components/ui/Screen';
import { AnimatedSeal } from '@/components/auth/AnimatedSeal';
import { resolvePostAuthStatus, useAuthStore } from '@/lib/store/auth';
import { tokenStorage } from '@/lib/api/tokenStorage';
import { useRegisterPatient } from '@/lib/api/queries';
import { isNetworkError } from '@/lib/offline/cache';
import type { ApiValidationErrorBody, RegisterPatientPayload } from '@/lib/api/types';

type Sex = 'male' | 'female';
type StepNumber = 1 | 2 | 3;
const TOTAL_STEPS = 3;
const STEPS: StepNumber[] = [1, 2, 3];

const STEP_ICONS: Record<StepNumber, IconName> = {
  1: 'person',
  2: 'lock',
  3: 'users',
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
 * rather than one long form. Presentation is the OPES enrolment layout
 * (ScreenHeader + StepProgress + FieldLabel/PillInput + GradientButton);
 * the data flow is unchanged. Reached from login.tsx's "Create account" link. */
export default function SignupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const registerPatient = useRegisterPatient();
  const scrollRef = useRef<ScrollView>(null);
  /** Short phones: drop the decorative seal so the first field sits above the fold. */
  const compact = useWindowDimensions().height < 760;

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

  const stepTitle = t(`signup.step${step}Title` as const);
  const stepIndicator = t('signup.stepIndicator', { current: step, total: TOTAL_STEPS });

  return (
    <Screen className="px-0">
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenHeader
          title={t('signup.title')}
          subtitle={t('signup.subtitle')}
          onBack={goBack}
          right={
            <StatusBadge
              status="verified"
              tone="normal"
              icon="shield-check"
              label={t('signup.secureBadge')}
              size="sm"
            />
          }
        />

        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {/* The emblem the Health ID being created will carry, under the
              "Create your Health ID" header. A notch smaller than on sign-in
              so the step rail and the first field stay above the fold. */}
          {compact ? null : <AnimatedSeal size={64} />}

          <StepProgress
            steps={STEPS.map((value) => ({
              key: String(value),
              label: t(`signup.railStep${value}` as const),
            }))}
            currentIndex={step - 1}
            accessibilityLabel={`${stepIndicator}: ${stepTitle}`}
          />
          <Text style={styles.stepIndicator}>{stepIndicator}</Text>

          {conflictMessage ? (
            <Card style={styles.conflict}>
              <View style={styles.conflictRow}>
                <Icon name="alert-triangle" size={18} color={colors.statusWarning} />
                <View style={styles.conflictBody}>
                  <Text style={styles.conflictTitle}>{t('signup.conflictTitle')}</Text>
                  {/* The API's own 409 message, verbatim — never replaced. */}
                  <Text style={styles.conflictText}>{conflictMessage}</Text>
                </View>
              </View>
              <SecondaryButton
                label={t('signup.signInInstead')}
                onPress={() => router.replace('/(auth)/login')}
              />
            </Card>
          ) : null}

          {offline ? <Note icon="alert-triangle" text={t('signup.networkError')} /> : null}

          {/* One card per step: icon chip + title + subtitle header, then the
              fields it owns. */}
          <Card>
            <View style={styles.stepHeader}>
              <View style={styles.tintCircle}>
                <Icon name={STEP_ICONS[step]} size={24} color={colors.tintBlue} />
              </View>
              <View style={styles.stepHeaderBody}>
                <Text style={styles.stepTitle}>{stepTitle}</Text>
                <Text style={styles.stepSubtitle}>{t(`signup.step${step}Subtitle` as const)}</Text>
              </View>
            </View>

            {step === 1 ? (
              <>
                <View>
                  <FieldLabel text={t('signup.firstName')} />
                  <PillInput
                    icon={<Icon name="person" size={18} color={colors.blue} />}
                    placeholder={t('signup.firstNamePlaceholder')}
                    autoCapitalize="words"
                    autoComplete="given-name"
                    textContentType="givenName"
                    value={firstName}
                    onChangeText={(v) => {
                      setFirstName(v);
                      clearFieldError('first_name');
                    }}
                    error={fieldErrors.first_name}
                    accessibilityLabel={t('signup.firstName')}
                  />
                </View>
                <View>
                  <FieldLabel text={t('signup.lastName')} />
                  <PillInput
                    icon={<Icon name="person" size={18} color={colors.blue} />}
                    placeholder={t('signup.lastNamePlaceholder')}
                    autoCapitalize="words"
                    autoComplete="family-name"
                    textContentType="familyName"
                    value={lastName}
                    onChangeText={(v) => {
                      setLastName(v);
                      clearFieldError('last_name');
                    }}
                    error={fieldErrors.last_name}
                    accessibilityLabel={t('signup.lastName')}
                  />
                </View>

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
                <View>
                  <FieldLabel text={t('auth.phoneNumber')} />
                  <PillInput
                    icon={<Icon name="phone" size={18} color={colors.blue} />}
                    placeholder={t('auth.phoneNumberPlaceholder')}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    textContentType="telephoneNumber"
                    value={phone}
                    onChangeText={(v) => {
                      setPhone(v);
                      clearFieldError('phone');
                    }}
                    error={fieldErrors.phone}
                    accessibilityLabel={t('auth.phoneNumber')}
                  />
                </View>
                <View>
                  <FieldLabel text={t('signup.email')} />
                  <PillInput
                    icon={<Icon name="mail" size={18} color={colors.blue} />}
                    placeholder={t('signup.emailPlaceholder')}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    autoComplete="email"
                    textContentType="emailAddress"
                    value={email}
                    onChangeText={(v) => {
                      setEmail(v);
                      clearFieldError('email');
                    }}
                    error={fieldErrors.email}
                    accessibilityLabel={t('signup.email')}
                  />
                </View>
                <View>
                  <FieldLabel text={t('auth.password')} />
                  <PillInput
                    icon={<Icon name="lock" size={18} color={colors.blue} />}
                    placeholder={t('auth.passwordPlaceholder')}
                    isPassword
                    autoCapitalize="none"
                    autoComplete="new-password"
                    textContentType="newPassword"
                    value={password}
                    onChangeText={(v) => {
                      setPassword(v);
                      clearFieldError('password');
                      clearFieldError('password_confirmation');
                    }}
                    error={fieldErrors.password}
                    accessibilityLabel={t('auth.password')}
                  />
                </View>

                <PasswordStrengthCard checks={checks} touched={password.length > 0} />

                <View>
                  <FieldLabel text={t('signup.confirmPassword')} />
                  <PillInput
                    icon={<Icon name="lock" size={18} color={colors.blue} />}
                    placeholder={t('signup.confirmPasswordPlaceholder')}
                    isPassword
                    autoCapitalize="none"
                    autoComplete="new-password"
                    textContentType="newPassword"
                    value={confirmPassword}
                    onChangeText={(v) => {
                      setConfirmPassword(v);
                      clearFieldError('password_confirmation');
                    }}
                    error={fieldErrors.password_confirmation}
                    accessibilityLabel={t('signup.confirmPassword')}
                  />
                </View>

                {passwordsMatch && !fieldErrors.password_confirmation ? (
                  <View style={styles.matchRow} accessibilityLiveRegion="polite">
                    <Icon name="check-circle" size={14} color={colors.statusNormal} />
                    <Text style={styles.matchText}>{t('signup.passwordsMatch')}</Text>
                  </View>
                ) : null}
              </>
            ) : null}

            {step === 3 ? (
              <>
                <View>
                  <FieldLabel text={t('signup.emergencyName')} />
                  <PillInput
                    icon={<Icon name="person" size={18} color={colors.blue} />}
                    placeholder={t('signup.emergencyNamePlaceholder')}
                    autoCapitalize="words"
                    value={emergencyName}
                    onChangeText={(v) => {
                      setEmergencyName(v);
                      clearFieldError('emergency_name');
                    }}
                    error={fieldErrors.emergency_name}
                    accessibilityLabel={t('signup.emergencyName')}
                  />
                </View>

                <RelationshipField
                  value={emergencyRelationship}
                  error={fieldErrors.emergency_relationship}
                  onChange={(v) => {
                    setEmergencyRelationship(v);
                    clearFieldError('emergency_relationship');
                  }}
                />

                <View>
                  <FieldLabel text={t('signup.emergencyPhone')} />
                  <PillInput
                    icon={<Icon name="phone" size={18} color={colors.blue} />}
                    placeholder={t('signup.emergencyPhonePlaceholder')}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    value={emergencyPhone}
                    onChangeText={(v) => {
                      setEmergencyPhone(v);
                      clearFieldError('emergency_phone');
                    }}
                    error={fieldErrors.emergency_phone}
                    accessibilityLabel={t('signup.emergencyPhone')}
                  />
                </View>
              </>
            ) : null}
          </Card>

          <FormError message={bannerError} />

          {step < TOTAL_STEPS ? (
            <>
              <GradientButton label={t('signup.continue')} onPress={goNext} />
              <Text style={styles.nextUp}>
                {t('signup.nextUp', { step: t(`signup.step${step + 1}Title` as const) })}
              </Text>
            </>
          ) : (
            <GradientButton
              label={t('signup.createAccount')}
              onPress={handleSubmit}
              loading={submitting}
            />
          )}

          {step > 1 ? (
            <TouchableOpacity
              onPress={goBack}
              disabled={submitting}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('signup.backToStep')}
              style={[styles.textButton, submitting && styles.textButtonDisabled]}
            >
              <Icon name="chevron-left" size={16} color={colors.textSecondary} />
              <Text style={styles.textButtonLabel}>{t('signup.back')}</Text>
            </TouchableOpacity>
          ) : null}

          {step === 1 ? (
            <View style={styles.textButton}>
              <Text style={styles.footerText}>{t('signup.alreadyHaveAccount')} </Text>
              <TouchableOpacity
                onPress={() => router.replace('/(auth)/login')}
                hitSlop={8}
                accessibilityRole="link"
              >
                <Text style={styles.link}>{t('auth.signIn')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <Note icon="shield-check" text={t('auth.securityNote')} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const age = ageFromDob(value);

  return (
    <View>
      <FieldLabel text={t('signup.dateOfBirth')} />
      <PillInput
        icon={<Icon name="calendar" size={18} color={colors.blue} />}
        placeholder={t('signup.dateOfBirthPlaceholder')}
        keyboardType="number-pad"
        inputMode="numeric"
        autoCorrect={false}
        autoComplete="birthdate-full"
        // iOS has no `textContentType` for a whole date of birth; the nearest
        // values are all wrong, and a wrong one makes the keychain offer a
        // postcode. `none` is the correct answer, not a gap.
        textContentType="none"
        value={value}
        onChangeText={onChange}
        error={error}
        accessibilityLabel={t('signup.dateOfBirth')}
        accessibilityHint={t('signup.dobFormatHint')}
      />
      {error ? null : (
        <View style={styles.helperRow}>
          {age === null ? (
            <>
              <Icon name="info" size={12} color={colors.textMuted} />
              <Text style={styles.helper}>{t('signup.dobFormatHint')}</Text>
            </>
          ) : (
            <>
              <Icon name="check-circle" size={12} color={colors.blue} />
              <Text style={[styles.helper, styles.helperOn]}>{t('signup.dobAge', { age })}</Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const SEX_OPTIONS: { value: Sex; labelKey: string }[] = [
  { value: 'male', labelKey: 'signup.sexMale' },
  { value: 'female', labelKey: 'signup.sexFemale' },
];

/** Chip pair — the kit's selection language, rather than a dropdown the API
 * doesn't need. */
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View>
      <FieldLabel text={t('signup.sex')} />
      <View style={styles.chipRow}>
        {SEX_OPTIONS.map((opt) => (
          <Chip
            key={opt.value}
            label={t(opt.labelKey)}
            selected={value === opt.value}
            onPress={() => onChange(opt.value)}
          />
        ))}
      </View>
      {error ? (
        <Text style={styles.fieldError} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** Live password checklist + strength meter. The 8-character row is the only
 * one that gates submission (it is the API's rule); the other three are shown
 * as strength hints so a valid-but-simple password is never blocked here. */
function PasswordStrengthCard({ checks, touched }: { checks: PasswordChecks; touched: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const score = Object.values(checks).filter(Boolean).length;

  const meter =
    score <= 1
      ? { color: colors.statusCritical, labelKey: 'signup.strengthWeak' }
      : score === 2
        ? { color: colors.statusWarning, labelKey: 'signup.strengthFair' }
        : score === 3
          ? { color: colors.blue, labelKey: 'signup.strengthGood' }
          : { color: colors.statusNormal, labelKey: 'signup.strengthStrong' };

  const rows: { key: keyof PasswordChecks; labelKey: string }[] = [
    { key: 'length', labelKey: 'signup.pwLength' },
    { key: 'upper', labelKey: 'signup.pwUpper' },
    { key: 'number', labelKey: 'signup.pwNumber' },
    { key: 'symbol', labelKey: 'signup.pwSymbol' },
  ];

  return (
    <View style={styles.strength}>
      <View style={styles.strengthHeader}>
        <Text style={styles.strengthTitle}>{t('signup.passwordRules')}</Text>
        {touched ? (
          <Text style={[styles.strengthLabel, { color: meter.color }]}>{t(meter.labelKey)}</Text>
        ) : null}
      </View>

      <View style={styles.meterRow}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[styles.meterSegment, touched && i < score && { backgroundColor: meter.color }]}
          />
        ))}
      </View>

      <View style={styles.ruleList}>
        {rows.map((row) => {
          const met = checks[row.key];
          return (
            <View key={row.key} style={styles.ruleRow}>
              <Icon name="check-circle" size={14} color={met ? colors.blue : colors.border} />
              <Text style={[styles.ruleText, met && styles.ruleTextMet]}>{t(row.labelKey)}</Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.strengthNote}>{t('signup.pwRequiredNote')}</Text>
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View>
      <FieldLabel text={t('signup.emergencyRelationship')} />
      <PillInput
        icon={<Icon name="users" size={18} color={colors.blue} />}
        placeholder={t('signup.emergencyRelationshipPlaceholder')}
        autoCapitalize="words"
        value={value}
        onChangeText={onChange}
        error={error}
        accessibilityLabel={t('signup.emergencyRelationship')}
      />
      <Text style={styles.quickPick}>{t('signup.relationshipQuickPick')}</Text>
      <View style={styles.chipRow}>
        {RELATIONSHIP_KEYS.map((key) => {
          const label = t(`signup.${key}` as const);
          const selected = value.trim().toLowerCase() === label.toLowerCase();
          return <Chip key={key} label={label} selected={selected} onPress={() => onChange(label)} />;
        })}
      </View>
    </View>
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
      gap: spacing.sm,
    },

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

    conflict: { gap: spacing.md, borderColor: colors.statusWarning },
    conflictRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 4 },
    conflictBody: { flex: 1, minWidth: 0, gap: 4 },
    conflictTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    conflictText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },

    stepHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 4,
      marginBottom: spacing.md,
    },
    stepHeaderBody: { flex: 1, minWidth: 0, gap: 2 },
    tintCircle: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    stepSubtitle: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textSecondary,
    },

    helperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: -spacing.sm,
      marginBottom: spacing.md,
      marginLeft: spacing.sm,
    },
    helper: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    helperOn: { fontFamily: typography.fontFamily.semiBold, color: colors.blue },

    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
    fieldError: {
      marginTop: -spacing.sm,
      marginBottom: spacing.sm,
      marginLeft: spacing.md,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.danger,
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
      marginBottom: spacing.md,
      gap: spacing.sm + 4,
    },
    strengthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    strengthTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textPrimary,
    },
    strengthLabel: { fontFamily: typography.fontFamily.semiBold, fontSize: 11 },
    meterRow: { flexDirection: 'row', gap: 4 },
    meterSegment: { flex: 1, height: 6, borderRadius: radii.pill, backgroundColor: colors.border },
    ruleList: { gap: 6 },
    ruleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    ruleText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    ruleTextMet: { color: colors.textPrimary },
    strengthNote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },

    quickPick: {
      marginTop: -spacing.sm,
      marginBottom: spacing.sm,
      marginLeft: spacing.sm,
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 11,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textMuted,
    },

    nextUp: {
      textAlign: 'center',
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    textButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm,
    },
    textButtonDisabled: { opacity: 0.5 },
    textButtonLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    footerText: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    link: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.link,
    },
  });
