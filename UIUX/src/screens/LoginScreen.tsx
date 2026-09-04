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
import { GradientButton } from '../components/GradientButton';
import { PillInput } from '../components/PillInput';
import { PulseLogo } from '../components/PulseLogo';
import { Wordmark } from '../components/Wordmark';
import { useDialog } from '../components';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n';
import { isSessionRejected, patientErrorMessage } from '../lib/errors';
import { colors, radii, spacing, typography } from '../theme/theme';

/**
 * Demo login is a DEVELOPMENT-ONLY shortcut and is compiled out of any build
 * that does not explicitly opt in. Both the flag and the credentials come from
 * `EXPO_PUBLIC_*` env vars, which Metro inlines at bundle time — so a build
 * without them contains neither the button nor any credential string.
 *
 * Never set these in a production export. See mobile/README.md.
 */
const DEMO_LOGIN_ENABLED =
  process.env.EXPO_PUBLIC_DEMO_LOGIN === 'true' &&
  !!process.env.EXPO_PUBLIC_DEMO_EMAIL &&
  !!process.env.EXPO_PUBLIC_DEMO_PASSWORD;

function MailIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M3 6h18v12H3z" fill="none" stroke={colors.blue} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M3 7l9 6 9-6" fill="none" stroke={colors.blue} strokeWidth={1.6} strokeLinejoin="round" />
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

export function LoginScreen() {
  const navigation = useNavigation<any>();
  const { login, sessionExpired, clearSessionExpired } = useAuth();
  const { t } = useTranslation();
  const dialog = useDialog();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    clearSessionExpired();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      // A rejected credential (a real 401 from the login endpoint) is the only
      // case that may say "wrong email or password". A connection failure — no
      // signal, a timeout, a 5xx — says nothing about the credentials and must
      // not accuse the patient of getting them wrong; `patientErrorMessage`
      // gives the honest connection copy instead.
      setError(
        isSessionRejected(e)
          ? t('auth.login.badCredentials')
          : patientErrorMessage(e, t('auth.login.badCredentials'))
      );
    } finally {
      setLoading(false);
    }
  }

  function handleForgotPassword() {
    // Honest interim: there is no self-service reset endpoint yet, so this opens
    // guidance rather than pretending to send a reset. See `auth.login.forgot*`.
    dialog.show({
      title: t('auth.login.forgotTitle'),
      message: t('auth.login.forgotBody'),
      tone: 'info',
    });
  }

  async function handleDemoLogin() {
    setError(null);
    setDemoLoading(true);
    try {
      await login(
        String(process.env.EXPO_PUBLIC_DEMO_EMAIL),
        String(process.env.EXPO_PUBLIC_DEMO_PASSWORD)
      );
    } catch (e) {
      setError(
        isSessionRejected(e)
          ? t('auth.login.demoUnavailable')
          : patientErrorMessage(e, t('auth.login.demoUnavailable'))
      );
    } finally {
      setDemoLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <PulseLogo size={90} />
          <View style={{ marginTop: spacing.md }}>
            <Wordmark size="md" />
          </View>
        </View>

        <Text style={styles.title}>{t('auth.login.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.login.subtitle')}</Text>

        <Text style={styles.sectionLabel}>{t('auth.login.welcomeBack')}</Text>

        <PillInput
          placeholder={t('auth.login.emailPlaceholder')}
          icon={<MailIcon />}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <PillInput
          placeholder={t('auth.login.passwordPlaceholder')}
          icon={<LockIcon />}
          isPassword
          value={password}
          onChangeText={setPassword}
        />

        {!error && sessionExpired && (
          <Text style={styles.errorBanner}>{t('auth.login.sessionExpired')}</Text>
        )}
        {!!error && <Text style={styles.errorBanner}>{error}</Text>}

        <GradientButton label={t('auth.login.submit')} onPress={handleSubmit} loading={loading} disabled={!email || !password} />

        <TouchableOpacity style={styles.forgotRow} onPress={handleForgotPassword} accessibilityRole="button">
          <Text style={styles.forgotText}>{t('auth.login.forgotPassword')}</Text>
        </TouchableOpacity>

        {DEMO_LOGIN_ENABLED && (
          <View style={styles.demoCard}>
            <Text style={styles.demoTitle}>{t('auth.login.demoTitle')}</Text>
            <Text style={styles.demoBody}>{t('auth.login.demoBody')}</Text>
            <TouchableOpacity style={styles.demoButton} onPress={handleDemoLogin} disabled={demoLoading} activeOpacity={0.7}>
              <Text style={styles.demoButtonText}>
                {demoLoading ? t('auth.login.demoLoading') : t('auth.login.demoCta')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate('Signup')}>
          <Text style={styles.linkText}>
            {t('auth.login.noAccount')}{' '}
            <Text style={styles.linkAccent}>{t('auth.login.createAccount')}</Text>
          </Text>
        </TouchableOpacity>

        <Text style={styles.footerNote}>{t('auth.login.footerNote')}</Text>
      </ScrollView>
      {dialog.element}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xl,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  sectionLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.blue,
    marginBottom: spacing.md,
  },
  errorBanner: {
    color: colors.danger,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    marginBottom: spacing.sm,
  },
  forgotRow: {
    marginTop: spacing.md,
    alignSelf: 'center',
    paddingVertical: spacing.xs,
  },
  forgotText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.blue,
  },
  demoCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
  },
  demoTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  demoBody: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
    lineHeight: 16,
  },
  demoButton: {
    borderWidth: 1.4,
    borderColor: colors.blue,
    borderRadius: radii.pill,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
  },
  demoButtonText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.blue,
  },
  linkRow: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  linkText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  linkAccent: {
    color: colors.blue,
    fontFamily: typography.fontFamily.semiBold,
  },
  footerNote: {
    marginTop: spacing.xl,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
