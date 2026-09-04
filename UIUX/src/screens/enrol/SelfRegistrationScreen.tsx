/**
 * P8.3 — self-registration.
 *
 * Collects exactly what the contract takes (full name, sex, optional date of
 * birth) and, on 201, shows the patient the medical ID the hospital has just
 * minted for them. The ID card itself is not rebuilt here: CORE-007 already
 * renders the navy card and the scannable QR, so the success panel names the ID
 * and hands the patient straight to it.
 *
 * The 409 is not treated as an error. It routes to `ReceptionRequired`, which
 * is an ordinary next step in the enrolment, and this screen never speculates
 * about why — the server told it nothing, on purpose.
 */
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PhoneNotVerifiedError, ReceptionRequiredError, selfRegister } from '../../api';
import { Card, Chip, GradientButton, Icon, PillInput, ScreenHeader } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import { writeFailureMessage } from '../../lib/errors';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { CareButton } from '../care/shared';
import { FieldLabel, FormError, Note } from './shared';

const SEXES = ['female', 'male', 'other'] as const;
type Sex = (typeof SEXES)[number];

export function SelfRegistrationScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { account, refreshAccount } = useAuth();

  const [fullName, setFullName] = useState(account?.full_name ?? '');
  const [sex, setSex] = useState<Sex | null>(null);
  const [dateOfBirth, setDateOfBirth] = useState(account?.date_of_birth ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [medicalId, setMedicalId] = useState<string | null>(null);

  const sexLabel: Record<Sex, string> = {
    female: t('enrol.register.sexFemale'),
    male: t('enrol.register.sexMale'),
    other: t('enrol.register.sexOther'),
  };

  const canSubmit = fullName.trim().length > 0 && sex !== null;

  async function submit() {
    if (!sex) return;
    setError(null);
    setBusy(true);
    try {
      const patient = await selfRegister({
        full_name: fullName.trim(),
        sex,
        date_of_birth: dateOfBirth.trim() || undefined,
      });
      // 201 means the account is already linked to the record it just created.
      await refreshAccount().catch(() => undefined);
      setMedicalId(patient.medical_id);
    } catch (e) {
      if (e instanceof ReceptionRequiredError) {
        navigation.replace('ReceptionRequired');
        return;
      }
      if (e instanceof PhoneNotVerifiedError) {
        navigation.replace('PhoneVerification', { then: 'register' });
        return;
      }
      setError(writeFailureMessage(e, t('enrol.register.checkHint'), t('enrol.register.failed')));
    } finally {
      setBusy(false);
    }
  }

  if (medicalId) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={t('enrol.register.doneTitle')} showBack={false} />
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.idCard}>
            <View style={styles.idMark}>
              <Icon name="check-circle" size={28} color={colors.statusNormal} />
            </View>
            <Text style={styles.idLabel}>{t('enrol.register.doneIdLabel')}</Text>
            <Text style={styles.idValue} selectable>
              {medicalId}
            </Text>
            <Text style={styles.idBody}>{t('enrol.register.doneBody')}</Text>
          </Card>

          <GradientButton
            label={t('enrol.register.doneCard')}
            onPress={() => navigation.replace('MyHealthId')}
          />
          <CareButton
            label={t('enrol.register.doneHome')}
            variant="secondary"
            onPress={() => navigation.navigate('MainTabs', { screen: 'HomeTab' })}
          />

          <Note text={t('enrol.register.provisionalNote')} />
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={t('enrol.register.title')} subtitle={t('enrol.register.subtitle')} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View>
          <FieldLabel text={t('enrol.register.nameLabel')} />
          <PillInput
            icon={<Icon name="person" size={18} color={colors.blue} />}
            value={fullName}
            onChangeText={setFullName}
            placeholder={t('enrol.register.namePlaceholder')}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            accessibilityLabel={t('enrol.register.nameLabel')}
          />
        </View>

        <View>
          <FieldLabel text={t('enrol.register.sexLabel')} />
          <View style={styles.chipRow}>
            {SEXES.map((option) => (
              <Chip
                key={option}
                label={sexLabel[option]}
                selected={sex === option}
                onPress={() => setSex(option)}
              />
            ))}
          </View>
        </View>

        <View>
          <FieldLabel text={t('enrol.register.dobLabel')} />
          <PillInput
            icon={<Icon name="calendar" size={18} color={colors.blue} />}
            value={dateOfBirth}
            onChangeText={setDateOfBirth}
            placeholder={t('enrol.register.dobPlaceholder')}
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            autoComplete="birthdate-full"
            // iOS has no `textContentType` for a whole date of birth; the
            // nearest values are all wrong, and a wrong one makes the keychain
            // offer a postcode. `none` is the correct answer, not a gap.
            textContentType="none"
            accessibilityLabel={t('enrol.register.dobLabel')}
            accessibilityHint={t('enrol.register.dobHelper')}
          />
          <Text style={styles.helper}>{t('enrol.register.dobHelper')}</Text>
        </View>

        <FormError message={error} />

        <GradientButton
          label={busy ? t('enrol.register.submitting') : t('enrol.register.submit')}
          onPress={submit}
          loading={busy}
          disabled={!canSubmit}
        />

        <Note text={t('enrol.register.provisionalNote')} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  helper: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: -spacing.sm,
    marginLeft: spacing.sm,
    marginBottom: spacing.sm,
  },

  idCard: { alignItems: 'center', gap: 6, paddingVertical: spacing.lg },
  idMark: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.statusNormalBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  idLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.textMuted,
    textAlign: 'center',
  },
  idValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    letterSpacing: 1,
    color: colors.navy,
    textAlign: 'center',
  },
  idBody: {
    marginTop: spacing.xs,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
