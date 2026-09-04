import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { extractErrorMessage } from '../api/client';
import { GradientButton } from '../components/GradientButton';
import { PillInput } from '../components/PillInput';
import { Wordmark } from '../components/Wordmark';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n';
import { colors, radii, spacing, typography } from '../theme/theme';

function PersonIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4} fill="none" stroke={colors.blue} strokeWidth={1.6} />
      <Path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="none" stroke={colors.blue} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

function MailIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M3 6h18v12H3z" fill="none" stroke={colors.blue} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M3 7l9 6 9-6" fill="none" stroke={colors.blue} strokeWidth={1.6} strokeLinejoin="round" />
    </Svg>
  );
}

function PhoneIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M6 3h4l1.5 4-2 1.5a13 13 0 006 6l1.5-2 4 1.5v4a2 2 0 01-2 2A16 16 0 014 5a2 2 0 012-2z"
        fill="none"
        stroke={colors.blue}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CalendarIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M4 5h16v16H4z" fill="none" stroke={colors.blue} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M4 9h16M8 3v4M16 3v4" stroke={colors.blue} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

function LockIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M6 11V8a6 6 0 0112 0v3" fill="none" stroke={colors.blue} strokeWidth={1.6} />
      <Path d="M5 11h14v9H5z" fill="none" stroke={colors.blue} strokeWidth={1.6} strokeLinejoin="round" />
      <Circle cx={12} cy={15.5} r={1.4} fill={colors.blue} />
    </Svg>
  );
}

const GENDERS: Array<'female' | 'male' | 'other'> = ['female', 'male', 'other'];

export function SignupScreen() {
  const navigation = useNavigation<any>();
  const { register } = useAuth();
  const { t } = useTranslation();
  const scrollRef = React.useRef<ScrollView>(null);
  const genderLabel: Record<(typeof GENDERS)[number], string> = {
    female: t('auth.signup.genderFemale'),
    male: t('auth.signup.genderMale'),
    other: t('auth.signup.genderOther'),
  };

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+237');
  const [dateOfBirth, setDateOfBirth] = useState(''); // YYYY-MM-DD
  const [gender, setGender] = useState<'female' | 'male' | 'other' | ''>('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = fullName && email && phone && password && confirmPassword;

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      await register({
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        password_confirmation: confirmPassword,
        date_of_birth: dateOfBirth || undefined,
        gender: gender || undefined,
        country: 'Cameroon',
      });
    } catch (e) {
      setError(extractErrorMessage(e, t('auth.signup.failed')));
      // The submit button sits at the bottom of a long form, so an error that
      // renders down there can look like nothing happened. Bring the summary
      // banner — which is at the top of the form — back into view.
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
            <Svg width={24} height={24} viewBox="0 0 24 24">
              <Path d="M15 18l-6-6 6-6" stroke={colors.blue} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </Svg>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.signInLink}>{t('common.signIn')}</Text>
          </TouchableOpacity>
        </View>

        <Wordmark size="md" />

        <Text style={styles.title}>{t('auth.signup.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.signup.subtitle')}</Text>

        {/*
            The registration completes in a single submit — there was never a
            second step. The four-step "Verify Mobile / Security Setup / Complete
            Profile" progress bar promised a flow the backend does not have, so
            it is gone rather than left to mislead. What remains is the whole of
            the real process: this form, and Continue.
        */}
        {!!error && (
          <View style={styles.errorSummary}>
            <Text style={styles.errorBanner}>{error}</Text>
          </View>
        )}

        <View style={{ marginTop: spacing.lg }} />

        <PillInput placeholder={t('auth.signup.fullName')} icon={<PersonIcon />} value={fullName} onChangeText={setFullName} />
        <PillInput
          placeholder={t('auth.signup.email')}
          icon={<MailIcon />}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <PillInput
          placeholder={t('auth.signup.phone')}
          icon={<PhoneIcon />}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <PillInput
          placeholder={t('auth.signup.dateOfBirth')}
          icon={<CalendarIcon />}
          value={dateOfBirth}
          onChangeText={setDateOfBirth}
        />

        <View style={styles.genderRow}>
          {GENDERS.map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.genderChip, gender === g && styles.genderChipActive]}
              onPress={() => setGender(g)}
            >
              <Text style={[styles.genderChipText, gender === g && styles.genderChipTextActive]}>
                {genderLabel[g]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <PillInput placeholder={t('auth.signup.password')} icon={<LockIcon />} isPassword value={password} onChangeText={setPassword} />
        <PillInput
          placeholder={t('auth.signup.confirmPassword')}
          icon={<LockIcon />}
          isPassword
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />

        <View style={styles.privacyCard}>
          <Text style={styles.privacyTitle}>{t('auth.signup.privacyTitle')}</Text>
          <Text style={styles.privacyBody}>{t('auth.signup.privacyBody')}</Text>
        </View>

        <GradientButton label={t('auth.signup.submit')} onPress={handleSubmit} loading={loading} disabled={!canSubmit} />

        <Text style={styles.footerNote}>{t('auth.signup.footerNote')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  signInLink: {
    color: colors.blue,
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
  },
  title: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xl,
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  subtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  genderRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  genderChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.pill,
    borderWidth: 1.4,
    borderColor: colors.border,
    alignItems: 'center',
  },
  genderChipActive: {
    borderColor: colors.blue,
    backgroundColor: colors.surfaceMuted,
  },
  genderChipText: {
    fontFamily: typography.fontFamily.medium,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
  },
  genderChipTextActive: {
    color: colors.blue,
  },
  privacyCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  privacyTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  privacyBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  errorSummary: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surfaceMuted,
  },
  errorBanner: {
    color: colors.danger,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
  },
  footerNote: {
    marginTop: spacing.xl,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
