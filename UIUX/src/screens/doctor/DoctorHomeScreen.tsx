/**
 * The doctor's landing screen.
 *
 * Every figure here is counted by the server (`GET /doctor/home`) with the
 * same query the screen it links to would run — there is no derived, cached or
 * placeholder number anywhere on this screen. A count of zero is shown as
 * zero, with honest wording, rather than hidden.
 */
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchDoctorHome, type DoctorAppointment, type DoctorHome } from '../../api';
import { Card, EmptyState, Icon, ListRow, ScreenHeader, SectionHeader } from '../../components';
import { useTranslation } from '../../i18n';
import { formatTime } from '../../utils/format';
import { colors, spacing, typography } from '../../theme/theme';
import { AsyncBoundary, NoticeBanner, useAsync } from '../care/shared';
import { CountTile, ResultRow } from './shared';

const APPOINTMENT_ICON = (a: DoctorAppointment) =>
  a.visit_mode === 'telemedicine' ? 'video' : 'stethoscope';

export function DoctorHomeScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const state = useAsync<DoctorHome>(fetchDoctorHome, []);
  const { reload, reloadIfStale } = state;

  // Refetch on focus only if what is on screen has gone stale (report 39, F4).
  // The old plain reload() re-downloaded the whole dashboard on every tab
  // switch and back press — the patient tabs already throttle this the same
  // way. Pull-to-refresh and the explicit retry still force a full reload.
  useFocusEffect(
    useCallback(() => {
      reloadIfStale();
    }, [reloadIfStale])
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('doctor.home.title')}
        subtitle={state.data ? state.data.provider.name : undefined}
        showBack={false}
        actions={[
          {
            icon: 'bell',
            badge: state.data?.counts.unacknowledged_results,
            onPress: () => navigation.navigate('ResultsInbox'),
            accessibilityLabel: t('doctor.home.inboxAction'),
          },
        ]}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={state.loading && state.data !== null}
            onRefresh={reload}
            tintColor={colors.blue}
          />
        }
      >
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('doctor.home.loading')}
        >
          {(home) => (
            <>
              {home.counts.critical_unacknowledged > 0 && (
                <NoticeBanner
                  icon="alert-triangle"
                  tone="critical"
                  title={t('doctor.home.criticalBanner', {
                    count: home.counts.critical_unacknowledged,
                  })}
                  message={t('doctor.home.criticalBannerBody')}
                />
              )}

              <SectionHeader title={t('doctor.home.waitingOnYou')} />
              <Card variant="flush">
                <CountTile
                  icon="alert-circle"
                  tint="red"
                  count={home.counts.unacknowledged_results}
                  label={t('doctor.home.tileResults')}
                  emphasise={home.counts.critical_unacknowledged > 0}
                  onPress={() => navigation.navigate('ResultsInbox')}
                />
                <CountTile
                  icon="chat"
                  tint="blue"
                  count={home.counts.unread_messages}
                  label={t('doctor.home.tileMessages')}
                  onPress={() => navigation.navigate('DoctorMessages')}
                />
                <CountTile
                  icon="calendar"
                  tint="purple"
                  count={home.counts.appointments_today}
                  label={t('doctor.home.tileAppointments')}
                  onPress={() => navigation.navigate('DoctorSchedule')}
                />
              </Card>

              {home.urgent_results.length > 0 && (
                <>
                  <SectionHeader
                    title={t('doctor.home.urgentResults')}
                    actionLabel={t('doctor.home.viewAll')}
                    onAction={() => navigation.navigate('ResultsInbox')}
                  />
                  <Card variant="flush">
                    {home.urgent_results.map((r) => (
                      <ResultRow
                        key={r.id}
                        result={r}
                        onPress={() => navigation.navigate('ResultDetail', { resultId: r.id })}
                      />
                    ))}
                  </Card>
                </>
              )}

              <SectionHeader
                title={t('doctor.home.nextToday')}
                actionLabel={
                  home.counts.appointments_today > 0 ? t('doctor.home.fullSchedule') : undefined
                }
                onAction={
                  home.counts.appointments_today > 0
                    ? () => navigation.navigate('DoctorSchedule')
                    : undefined
                }
              />
              {home.next_appointments.length === 0 ? (
                <EmptyState
                  icon="calendar-check"
                  tint="blue"
                  title={t('doctor.home.nothingTodayTitle')}
                  message={t('doctor.home.nothingTodayBody')}
                />
              ) : (
                <Card variant="flush">
                  {home.next_appointments.map((a) => (
                    <ListRow
                      key={a.id}
                      icon={APPOINTMENT_ICON(a)}
                      tint={a.visit_mode === 'telemedicine' ? 'purple' : 'blue'}
                      title={a.patient_name ?? t('doctor.home.patientNotOnRecord')}
                      meta={[
                        a.scheduled_at
                          ? formatTime(a.scheduled_at)
                          : t('doctor.home.timeNotRecorded'),
                        a.location ?? undefined,
                        a.reason ?? undefined,
                      ]}
                      onPress={() => navigation.navigate('DoctorSchedule')}
                    />
                  ))}
                </Card>
              )}

              <View style={styles.footer}>
                <Icon name="shield-check" size={16} color={colors.textMuted} />
                <Text style={styles.footerText}>{t('doctor.home.countedLive')}</Text>
              </View>
            </>
          )}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.sm,
  },
  footerText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textMuted,
  },
});
