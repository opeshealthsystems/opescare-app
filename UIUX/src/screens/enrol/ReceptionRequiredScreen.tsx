/**
 * The 409 from `POST /patient/self-register`, told as what it is: one more step,
 * done in person.
 *
 * Three things this screen must never do, and does not:
 *
 *   1. Blame. The patient filled the form correctly; the copy says so.
 *   2. Speculate. The server withholds every detail of why — no matched name,
 *      no partial ID, no "we found something". This screen holds no such data
 *      and states no such thing, because a hint is a leak with better manners.
 *   3. Read as a failure. There is no red, no alert icon and no retry: it is a
 *      next step with an address, a list of what to bring, and what happens
 *      when the patient gets there.
 */
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, GradientButton, ScreenHeader, SectionHeader } from '../../components';
import { useTranslation } from '../../i18n';
import { colors, spacing, typography } from '../../theme/theme';
import { CareButton } from '../care/shared';
import { Bullet, Note, Step } from './shared';

export function ReceptionRequiredScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('enrol.reception.title')} showBack={false} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>{t('enrol.reception.intro')}</Text>

        <View>
          <SectionHeader title={t('enrol.reception.bringTitle')} variant="overline" />
          <Card>
            <Bullet icon="id-card" text={t('enrol.reception.bringId')} />
            <Bullet icon="phone" text={t('enrol.reception.bringPhone')} />
            <Bullet icon="credit-card" text={t('enrol.reception.bringCover')} />
          </Card>
        </View>

        <View>
          <SectionHeader title={t('enrol.reception.nextTitle')} variant="overline" />
          <Card>
            <Step index={1} text={t('enrol.reception.nextStep1')} />
            <Step index={2} text={t('enrol.reception.nextStep2')} />
            <Step index={3} text={t('enrol.reception.nextStep3')} />
          </Card>
        </View>

        <Note icon="shield-check" text={t('enrol.reception.reassure')} />
        <Text style={styles.hours}>{t('enrol.reception.hoursNote')}</Text>

        <GradientButton
          label={t('enrol.reception.findUs')}
          icon="none"
          onPress={() => navigation.navigate('FindFacility')}
        />
        <CareButton
          label={t('enrol.reception.done')}
          variant="secondary"
          onPress={() => navigation.navigate('MainTabs', { screen: 'HomeTab' })}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  intro: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.md,
    lineHeight: typography.lineHeight.md,
    color: colors.textSecondary,
  },
  hours: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textMuted,
    marginLeft: spacing.sm,
    marginBottom: spacing.xs,
  },
});
