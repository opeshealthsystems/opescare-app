/**
 * The existing link path, given a screen of its own.
 *
 * `POST /patient/link` has been in `api/auth.ts` since the portal shipped, but
 * nothing in the app ever called it — the unlinked state pointed at a Health ID
 * screen that answers 409 itself. P8 adds a second door; this one is the first
 * door, and it is unchanged in substance: a patient who already has a record
 * still names it and proves the name on it.
 */
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { linkPatientRecord } from '../../api';
import { GradientButton, Icon, PillInput, ScreenHeader } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import { writeFailureMessage } from '../../lib/errors';
import { colors, spacing } from '../../theme/theme';
import { FieldLabel, FormError, Note } from './shared';

export function LinkHealthIdScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { account, refreshAccount } = useAuth();

  const [medicalId, setMedicalId] = useState('');
  const [fullName, setFullName] = useState(account?.full_name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = medicalId.trim().length > 0 && fullName.trim().length > 0;

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await linkPatientRecord(medicalId.trim().toUpperCase(), fullName.trim());
      // The account object carries `is_linked`; refresh it before leaving so no
      // screen behind us is still holding the unlinked answer.
      await refreshAccount();
      navigation.navigate('MyHealthId');
    } catch (e) {
      // `writeFailureMessage` is honest about a timeout: it says the outcome is
      // unknown and where to check, rather than claiming this did not work.
      setError(writeFailureMessage(e, t('enrol.link.checkHint'), t('enrol.link.failed')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={t('enrol.link.title')} subtitle={t('enrol.link.subtitle')} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View>
          <FieldLabel text={t('enrol.link.idLabel')} />
          <PillInput
            icon={<Icon name="id-card" size={18} color={colors.blue} />}
            value={medicalId}
            onChangeText={setMedicalId}
            placeholder={t('enrol.link.idPlaceholder')}
            autoCapitalize="characters"
            autoCorrect={false}
            // A hospital-issued medical ID is not in any keychain and must
            // never be offered from one. `off` is the honest semantic here —
            // guessing at a category would make the OS suggest the wrong
            // saved value.
            autoComplete="off"
            textContentType="none"
            accessibilityLabel={t('enrol.link.idLabel')}
            accessibilityHint={t('enrol.link.idHint')}
          />
        </View>

        <View>
          <FieldLabel text={t('enrol.link.nameLabel')} />
          <PillInput
            icon={<Icon name="person" size={18} color={colors.blue} />}
            value={fullName}
            onChangeText={setFullName}
            placeholder={t('enrol.link.namePlaceholder')}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            accessibilityLabel={t('enrol.link.nameLabel')}
          />
        </View>

        <FormError message={error} />

        <GradientButton
          label={t('enrol.link.submit')}
          onPress={submit}
          loading={busy}
          disabled={!canSubmit}
        />

        <Note text={t('enrol.link.helper')} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
});
