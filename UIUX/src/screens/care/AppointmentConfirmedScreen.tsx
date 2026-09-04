/**
 * CARE-011 — Appointment Confirmed.
 *
 * Renders the appointment the API actually created — it is re-fetched from
 * `GET /patient/appointments/{id}`, never echoed from the form's inputs.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React from 'react';
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchAppointment, type PortalAppointment } from '../../api';
import { Card, Icon, IconName, ScreenHeader } from '../../components';
import { useTranslation } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { typeLabelOf, visitModeLabelOf } from './apptLabels';
import {
  AsyncBoundary,
  CareButton,
  fmtDateLong,
  fmtDuration,
  fmtTime,
  ProviderAvatar,
  useAsync,
} from './shared';

function endTime(a: PortalAppointment): string {
  const end = new Date(new Date(a.scheduled_at).getTime() + a.duration_minutes * 60_000);
  return fmtTime(end.toISOString());
}

export function AppointmentConfirmedScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'AppointmentConfirmed'>>();
  const id = params.appointmentId;

  const state = useAsync<PortalAppointment>(() => fetchAppointment(id), [id]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('care.confirmed.title')} align="center" showBack={false} />
      <ScrollView contentContainerStyle={styles.content}>
        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel={t('care.confirmed.loading')}>
          {(a) => (
            <>
              <View style={styles.hero}>
                <View style={styles.heroMark}>
                  <Icon name="check" size={38} color={colors.textOnBrand} />
                </View>
                <Text style={styles.heroTitle}>{t('care.confirmed.heroTitle')}</Text>
                <Text style={styles.heroText}>{t('care.confirmed.heroText')}</Text>
              </View>

              <Card variant="flush">
                <View style={styles.detailsHead}>
                  <Icon name="calendar" size={22} color={colors.blue} />
                  <Text style={styles.detailsTitle}>{t('care.confirmed.detailsTitle')}</Text>
                </View>

                <View style={styles.providerRow}>
                  <ProviderAvatar name={a.provider_name ?? t('care.appt.careTeam')} size={66} />
                  <View style={styles.providerBody}>
                    <Text style={styles.providerLabel}>{t('care.confirmed.providerLabel')}</Text>
                    <Text style={styles.providerName} numberOfLines={2}>
                      {a.provider_name ?? t('care.appt.providerTbd')}
                    </Text>
                    {!!a.provider_specialty && <Text style={styles.providerSpecialty}>{a.provider_specialty}</Text>}
                    <View style={styles.metaRow}>
                      <Icon name="building" size={15} color={colors.textSecondary} />
                      <Text style={styles.meta} numberOfLines={1}>
                        {a.facility_name ?? t('care.appt.facilityTbd')}
                      </Text>
                    </View>
                    {!!a.location && (
                      <View style={styles.metaRow}>
                        <Icon name="location" size={15} color={colors.textSecondary} />
                        <Text style={styles.meta} numberOfLines={1}>
                          {a.location}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <DetailRow icon="calendar" label={t('care.confirmed.labelDate')} value={fmtDateLong(a.scheduled_at)} divider />
                <DetailRow
                  icon="clock"
                  label={t('care.confirmed.labelTime')}
                  value={`${fmtTime(a.scheduled_at)} – ${endTime(a)}`}
                  sub={`(${fmtDuration(a.duration_minutes)})`}
                  divider
                />
                <DetailRow
                  icon="person"
                  label={t('care.confirmed.labelType')}
                  value={visitModeLabelOf(t, a.visit_mode)}
                  sub={typeLabelOf(t, a.appointment_type)}
                  divider
                />
                <DetailRow icon="edit" label={t('care.confirmed.labelReason')} value={a.reason ?? t('care.appt.notSpecified')} />
              </Card>

              <View style={styles.info}>
                <View style={styles.infoIcon}>
                  <Icon name="info" size={20} color={colors.textOnBrand} />
                </View>
                <Text style={styles.infoText}>{t('care.confirmed.infoText')}</Text>
              </View>

              <Card>
                <Text style={styles.nextTitle}>{t('care.confirmed.nextTitle')}</Text>
                <NextAction
                  icon="share"
                  title={t('care.confirmed.shareTitle')}
                  onPress={() =>
                    Share.share({
                      message: t('care.confirmed.shareMessage', {
                        type: typeLabelOf(t, a.appointment_type),
                        provider: a.provider_name ?? t('care.confirmed.shareProviderFallback'),
                        date: fmtDateLong(a.scheduled_at),
                        time: fmtTime(a.scheduled_at),
                        facility: a.facility_name ?? '',
                      }).trim(),
                    })
                  }
                  divider
                />
                <NextAction
                  icon="document-text"
                  title={t('care.confirmed.viewDetailsTitle')}
                  subtitle={t('care.confirmed.viewDetailsSub')}
                  onPress={() => navigation.replace('AppointmentDetail', { appointmentId: a.id })}
                  divider
                />
                <NextAction
                  icon="calendar"
                  title={t('care.confirmed.seeAllTitle')}
                  onPress={() => navigation.navigate('AppointmentList', { filter: 'upcoming' })}
                />
              </Card>

              <CareButton
                label={t('care.confirmed.goHome')}
                icon="home"
                onPress={() => navigation.navigate('MainTabs', { screen: 'HomeTab' })}
              />
            </>
          )}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
  sub,
  divider,
}: {
  icon: IconName;
  label: string;
  value: string;
  sub?: string;
  divider?: boolean;
}) {
  return (
    <View style={[styles.detailRow, divider && styles.detailDivider]}>
      <View style={styles.detailCircle}>
        <Icon name={icon} size={20} color={colors.blue} />
      </View>
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={styles.detailValueWrap}>
        <Text style={styles.detailValue}>{value}</Text>
        {!!sub && <Text style={styles.detailSub}>{sub}</Text>}
      </View>
    </View>
  );
}

function NextAction({
  icon,
  title,
  subtitle,
  onPress,
  divider,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
  divider?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.next, divider && styles.nextDivider]}>
      <Icon name={icon} size={22} color={colors.blue} />
      <View style={styles.nextBody}>
        <Text style={styles.nextLabel}>{title}</Text>
        {!!subtitle && <Text style={styles.nextSub}>{subtitle}</Text>}
      </View>
      <Icon name="chevron-right" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  hero: { alignItems: 'center', gap: spacing.sm + 2, paddingVertical: spacing.md },
  heroMark: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.statusNormal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xl,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  heroText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  detailsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  detailsTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },

  providerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md - 2,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  providerBody: { flex: 1, minWidth: 0, gap: 1 },
  providerLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  providerName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  providerSpecialty: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  meta: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  detailDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  detailCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  detailValueWrap: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  detailValue: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    textAlign: 'right',
  },
  detailSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    textAlign: 'right',
  },

  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.md - 2,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.link,
  },

  nextTitle: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  next: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4, paddingVertical: 13 },
  nextDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  nextBody: { flex: 1, minWidth: 0 },
  nextLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  nextSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
});
