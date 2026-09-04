/**
 * P8 — the fork an unlinked account lands on.
 *
 * Two doors, both real:
 *
 *   • "I already have an OPES Health ID" — the link flow that has always
 *     existed. It is listed first and is untouched: a patient with a chart
 *     still proves who they are before it opens.
 *   • "I am new to this hospital" — verify a phone number, then open a record
 *     that holds nobody's history.
 *
 * This screen is the reason the 409 is no longer a dead end.
 */
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Card, ListRow, ScreenHeader } from '../../components';
import { useTranslation } from '../../i18n';
import { colors, spacing } from '../../theme/theme';
import { Note } from './shared';

export function AccountSetupScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('enrol.setup.title')} subtitle={t('enrol.setup.subtitle')} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card variant="flush">
          <ListRow
            icon="id-card"
            tint="blue"
            title={t('enrol.setup.haveIdTitle')}
            subtitle={t('enrol.setup.haveIdSubtitle')}
            onPress={() => navigation.navigate('LinkHealthId')}
            divider
          />
          <ListRow
            icon="phone"
            tint="green"
            title={t('enrol.setup.newTitle')}
            subtitle={t('enrol.setup.newSubtitle')}
            onPress={() => navigation.navigate('PhoneVerification', { then: 'register' })}
          />
        </Card>

        <Note icon="lock" text={t('enrol.setup.privacyNote')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
});
