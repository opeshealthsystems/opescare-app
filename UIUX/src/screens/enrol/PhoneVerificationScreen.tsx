/**
 * P8.2 — phone verification.
 *
 * The one rule this screen keeps above all others: **every number on it comes
 * from the server.** The resend countdown runs from `resend_after_seconds`, the
 * validity line from `expires_in_seconds`, and the attempts line from
 * `attempts_remaining`. When the server sends none of them, the screen says
 * nothing about them rather than inventing a plausible-looking timer — a
 * countdown the API did not authorise is a lie with a progress bar on it.
 */
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  VerificationCodeRejectedError,
  VerificationRateLimitedError,
  requestPhoneCode,
  verifyPhoneCode,
} from '../../api';
import { EmptyState, GradientButton, Icon, PillInput, ScreenHeader } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useTranslation, type TFunction } from '../../i18n';
import { writeFailureMessage } from '../../lib/errors';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, spacing, typography } from '../../theme/theme';
import { CareButton } from '../care/shared';
import { FieldLabel, FormError, Note, clock } from './shared';

export function PhoneVerificationScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AppStackParamList, 'PhoneVerification'>>();
  const goToRegister = route.params?.then === 'register';
  const { t } = useTranslation();
  const { account } = useAuth();
  const phone = account?.phone ?? null;

  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<null | 'request' | 'verify'>(null);
  const [error, setError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [verified, setVerified] = useState(false);

  /** Server-issued only. `null` means "the server said nothing" — show nothing. */
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [resendIn, setResendIn] = useState<number | null>(null);

  // One tick per second for whichever server-issued counters are running.
  const running = (expiresIn !== null && expiresIn > 0) || (resendIn !== null && resendIn > 0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setExpiresIn((s) => (s === null ? null : Math.max(0, s - 1)));
      setResendIn((s) => (s === null ? null : Math.max(0, s - 1)));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const request = useCallback(async () => {
    setError(null);
    setBusy('request');
    try {
      const res = await requestPhoneCode();
      setSent(true);
      setAttemptsRemaining(null);
      setExpiresIn(res.expiresInSeconds);
      setResendIn(res.resendAfterSeconds);
    } catch (e) {
      if (e instanceof VerificationRateLimitedError) {
        // The refusal itself carries the only countdown we are allowed to show.
        setResendIn(e.resendAfterSeconds);
        setError(
          e.resendAfterSeconds !== null
            ? t('enrol.phone.rateLimitedWait', { clock: clock(e.resendAfterSeconds) })
            : t('enrol.phone.rateLimited')
        );
      } else {
        setError(writeFailureMessage(e, t('enrol.phone.checkHint')));
      }
    } finally {
      setBusy(null);
    }
  }, [t]);

  async function verify() {
    setError(null);
    setBusy('verify');
    try {
      await verifyPhoneCode(code.trim());
      setVerified(true);
    } catch (e) {
      if (e instanceof VerificationCodeRejectedError) {
        setAttemptsRemaining(e.attemptsRemaining);
        setError(t('enrol.phone.wrongCode'));
      } else if (e instanceof VerificationRateLimitedError) {
        setResendIn(e.resendAfterSeconds);
        setError(
          e.resendAfterSeconds !== null
            ? t('enrol.phone.rateLimitedWait', { clock: clock(e.resendAfterSeconds) })
            : t('enrol.phone.rateLimited')
        );
      } else {
        setError(writeFailureMessage(e, t('enrol.phone.checkHint')));
      }
    } finally {
      setBusy(null);
    }
  }

  if (verified) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={t('enrol.phone.title')} />
        <EmptyState
          icon="check-circle"
          tint="green"
          title={t('enrol.phone.doneTitle')}
          message={t('enrol.phone.doneBody')}
          actionLabel={t('enrol.phone.doneCta')}
          onAction={() =>
            goToRegister ? navigation.replace('SelfRegistration') : navigation.goBack()
          }
        />
      </View>
    );
  }

  const validityLine = validity(expiresIn, t);
  const canResend = resendIn === null || resendIn <= 0;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader
        title={t('enrol.phone.title')}
        subtitle={phone ? t('enrol.phone.subtitle', { phone }) : t('enrol.phone.subtitleNoPhone')}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!sent ? (
          <GradientButton
            label={busy === 'request' ? t('enrol.phone.sending') : t('enrol.phone.send')}
            onPress={request}
            loading={busy === 'request'}
            accessibilityHint={t('enrol.phone.sendHint')}
          />
        ) : (
          <>
            {/* Appears on its own when the request returns — the patient did
                not navigate here, so it has to announce itself. */}
            <View style={styles.sentRow} accessibilityLiveRegion="polite">
              <Icon name="send" size={18} color={colors.statusNormal} />
              <Text style={styles.sentText}>
                {phone ? t('enrol.phone.sent', { phone }) : t('enrol.phone.sentNoPhone')}
              </Text>
            </View>

            <View>
              <FieldLabel text={t('enrol.phone.codeLabel')} />
              <PillInput
                icon={<Icon name="lock" size={18} color={colors.blue} />}
                value={code}
                onChangeText={(next) => setCode(next.replace(/[^0-9]/g, ''))}
                placeholder={t('enrol.phone.codePlaceholder')}
                keyboardType="number-pad"
                maxLength={6}
                autoCorrect={false}
                // THE ONE THAT MATTERS MOST IN THIS FILE.
                //
                // With `sms-otp` / `oneTimeCode` the OS reads the code out of
                // the arriving SMS itself and offers it above the keyboard —
                // one tap. Without them a patient must leave the app, open
                // Messages, memorise six digits, come back and type them
                // blind into a field with 6px letter-spacing. For an elderly
                // or low-vision user on a cheap Android phone that is the
                // step the whole enrolment dies on.
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                accessibilityLabel={t('enrol.phone.codeLabel')}
                accessibilityHint={t('enrol.phone.codeHint')}
                style={styles.codeInput}
              />
            </View>

            {/* DELIBERATELY NOT A LIVE REGION. `validityLine` and the resend
                line below both re-render once a second while the server's
                counters run; marked polite they would speak the remaining
                time every second and drown out the field the patient is
                trying to type into. A ticking clock is exactly the case where
                the rule "announce what changes on its own" is wrong. */}
            {validityLine ? <Text style={styles.meta}>{validityLine}</Text> : null}
            {attemptsRemaining !== null ? (
              // This one does change without warning and is worth interrupting
              // for: it only ever appears after a refusal, and it counts down
              // to being locked out.
              <Text style={styles.meta} accessibilityLiveRegion="polite">
                {t('enrol.phone.attemptsRemaining', { count: attemptsRemaining })}
              </Text>
            ) : null}

            <FormError message={error} />

            <GradientButton
              label={busy === 'verify' ? t('enrol.phone.verifying') : t('enrol.phone.verify')}
              onPress={verify}
              loading={busy === 'verify'}
              disabled={code.length === 0}
            />

            {canResend ? (
              <CareButton
                label={t('enrol.phone.resend')}
                icon="refresh"
                variant="secondary"
                onPress={request}
                loading={busy === 'request'}
              />
            ) : (
              <Text style={styles.meta}>{t('enrol.phone.resendIn', { clock: clock(resendIn ?? 0) })}</Text>
            )}
          </>
        )}

        {!sent ? <FormError message={error} /> : null}
        <Note icon="phone" text={t('enrol.phone.smsNote')} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * The validity line, in whichever unit says the truth exactly.
 *
 * A 600-second expiry is "10 minutes"; a 90-second one is not "1 minute", so it
 * stays in seconds rather than being rounded into a friendlier lie.
 */
function validity(seconds: number | null, t: TFunction): string | null {
  if (seconds === null || seconds <= 0) return null;
  if (seconds % 60 === 0) return t('enrol.phone.validForMinutes', { count: seconds / 60 });
  return t('enrol.phone.validForSeconds', { count: seconds });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  sentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sentText: {
    flex: 1,
    minWidth: 0,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  codeInput: { letterSpacing: 6, fontFamily: typography.fontFamily.semiBold },
  meta: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
});
