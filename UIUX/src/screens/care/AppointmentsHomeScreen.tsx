/**
 * CARE-001 — Appointments & Care.
 *
 * Hero next-appointment panel, the four lifetime counters, and the upcoming /
 * recent appointment lists. Everything is live: `/patient/appointments/summary`
 * plus two scoped pages of `/patient/appointments`.
 */
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  fetchAppointments,
  fetchAppointmentSummary,
  type AppointmentSummary,
  type PortalAppointment,
} from '../../api';
import { Card, EmptyState, Icon, IconName, ScreenHeader, SectionHeader } from '../../components';
import { useTranslation, type TFunction } from '../../i18n';
import { colors, radii, spacing, typography, Tint, tintMap } from '../../theme/theme';
import { AppointmentRow, AsyncBoundary, CareButton, isoDay, useAsync } from './shared';
import { relativeDay, typeLabelOf } from './apptLabels';
import { formatTime } from '../../utils/format';
import { cacheKeys } from '../../lib/offlineCache';

type HomeData = {
  summary: AppointmentSummary;
  upcoming: PortalAppointment[];
  past: PortalAppointment[];
};

const STATS: { key: keyof AppointmentSummary; labelKey: string; icon: IconName; tint: Tint }[] = [
  { key: 'upcoming', labelKey: 'care.home.statUpcoming', icon: 'calendar', tint: 'blue' },
  { key: 'completed', labelKey: 'care.home.statCompleted', icon: 'check-circle', tint: 'green' },
  { key: 'cancelled', labelKey: 'care.home.statCancelled', icon: 'clock', tint: 'amber' },
  { key: 'rescheduled', labelKey: 'care.home.statRescheduled', icon: 'refresh', tint: 'purple' },
];

async function load(): Promise<HomeData> {
  const [summary, upcoming, past] = await Promise.all([
    fetchAppointmentSummary(),
    fetchAppointments({ scope: 'upcoming', per_page: 3 }),
    fetchAppointments({ scope: 'past', per_page: 3 }),
  ]);
  return { summary, upcoming: upcoming.data, past: past.data };
}

export function AppointmentsHomeScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const state = useAsync<HomeData>(load, [], { cacheKey: cacheKeys.appointmentsHome });
  const { reload, reloadIfStale } = state;

  // Coming back from a booking / cancellation must show the new truth.
  useFocusEffect(
    useCallback(() => {
      reloadIfStale();
    }, [reloadIfStale])
  );

  const goLink = () => navigation.navigate('MyHealthId');

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('care.home.title')}
        subtitle={t('care.home.subtitle')}
        showBack={navigation.canGoBack()}
        right={
          <CareButton
            label={t('care.home.bookNew')}
            icon="calendar-plus"
            variant="primary"
            size="sm"
            onPress={() => navigation.navigate('FindProvider')}
          />
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={state.loading && state.data !== null} onRefresh={reload} tintColor={colors.blue} />}
      >
        <AsyncBoundary state={state} onLink={goLink} loadingLabel={t('care.home.loading')}>
          {(data) => (
            <>
              <NextAppointmentHero
                t={t}
                appointment={data.upcoming[0]}
                onDetails={(id) => navigation.navigate('AppointmentDetail', { appointmentId: id })}
                onBook={() => navigation.navigate('FindProvider')}
              />

              <View>
                <SectionHeader title={t('care.home.overview')} actionLabel={t('care.home.allTime')} onAction={() => navigation.navigate('AppointmentList', { filter: 'all' })} actionChevron />
                <Card>
                  <View style={styles.statsRow}>
                    {STATS.map((s, i) => (
                      <View key={s.key} style={[styles.stat, i > 0 && styles.statDivided]}>
                        <View style={[styles.statCircle, { backgroundColor: tintMap[s.tint].bg }]}>
                          <Icon name={s.icon} size={22} color={tintMap[s.tint].fg} />
                        </View>
                        <Text style={styles.statValue}>{data.summary[s.key]}</Text>
                        <Text style={[styles.statLabel, { color: tintMap[s.tint].fg }]}>{t(s.labelKey)}</Text>
                      </View>
                    ))}
                  </View>
                </Card>
              </View>

              <View>
                <SectionHeader
                  title={t('care.home.upcomingTitle')}
                  actionLabel={t('care.home.viewCalendar')}
                  actionChevron
                  /*
                    CARE-023 was built and then nothing ever navigated to it,
                    while this action — labelled "View calendar" — opened a
                    flat list instead. The label was always the honest one; it
                    is the destination that was wrong. `isoDay(new Date())`
                    opens on today, which is what a calendar reached from
                    "upcoming" should show.
                  */
                  onAction={() => navigation.navigate('CalendarDay', { date: isoDay(new Date()) })}
                />
                {data.upcoming.length === 0 ? (
                  <Card>
                    <EmptyState
                      icon="calendar-plus"
                      tint="blue"
                      title={t('care.home.upcomingEmptyTitle')}
                      message={t('care.home.upcomingEmptyMessage')}
                      actionLabel={t('care.appt.findProvider')}
                      onAction={() => navigation.navigate('FindProvider')}
                    />
                  </Card>
                ) : (
                  <View style={styles.stack}>
                    {data.upcoming.map((a) => (
                      <Card key={a.id} variant="flush">
                        <AppointmentRow
                          appointment={a}
                          onPress={() => navigation.navigate('AppointmentDetail', { appointmentId: a.id })}
                          onMenu={() => navigation.navigate('AppointmentDetail', { appointmentId: a.id })}
                        />
                      </Card>
                    ))}
                  </View>
                )}
              </View>

              {data.past.length > 0 && (
                <View>
                  <SectionHeader
                    title={t('care.home.recentTitle')}
                    actionChevron
                    onAction={() => navigation.navigate('AppointmentList', { filter: 'past' })}
                  />
                  <View style={styles.stack}>
                    {data.past.map((a) => (
                      <Card key={a.id} variant="flush">
                        <AppointmentRow
                          appointment={a}
                          onPress={() => navigation.navigate('AppointmentDetail', { appointmentId: a.id })}
                          onMenu={() => navigation.navigate('AppointmentDetail', { appointmentId: a.id })}
                        />
                      </Card>
                    ))}
                  </View>
                </View>
              )}

              <View>
                <SectionHeader title={t('care.home.findCare')} />
                <View style={styles.stack}>
                  <Card variant="flush">
                    <QuickAction
                      icon="person-search"
                      tint="blue"
                      title={t('care.appt.findProvider')}
                      subtitle={t('care.home.findProviderSubtitle')}
                      onPress={() => navigation.navigate('FindProvider')}
                      divider
                    />
                    <QuickAction
                      icon="building"
                      tint="purple"
                      title={t('care.home.findDepartmentTitle')}
                      subtitle={t('care.home.findDepartmentSubtitle')}
                      onPress={() => navigation.navigate('FindFacility')}
                    />
                  </Card>
                </View>
              </View>
            </>
          )}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

function QuickAction({
  icon,
  tint,
  title,
  subtitle,
  onPress,
  divider,
}: {
  icon: IconName;
  tint: Tint;
  title: string;
  subtitle: string;
  onPress: () => void;
  divider?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.quick, divider && styles.quickDivider]}>
      <View style={[styles.quickCircle, { backgroundColor: tintMap[tint].bg }]}>
        <Icon name={icon} size={20} color={tintMap[tint].fg} />
      </View>
      <View style={styles.quickBody}>
        <Text style={styles.quickTitle}>{title}</Text>
        <Text style={styles.quickSubtitle}>{subtitle}</Text>
      </View>
      <Icon name="chevron-right" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function NextAppointmentHero({
  t,
  appointment,
  onDetails,
  onBook,
}: {
  t: TFunction;
  appointment?: PortalAppointment;
  onDetails: (id: string) => void;
  onBook: () => void;
}) {
  if (!appointment) {
    return (
      <Card>
        <View style={styles.heroEmpty}>
          <View style={styles.heroEmptyCircle}>
            <Icon name="calendar" size={24} color={colors.blue} />
          </View>
          <View style={styles.heroEmptyBody}>
            <Text style={styles.heroEmptyTitle}>{t('care.home.heroEmptyTitle')}</Text>
            <Text style={styles.heroEmptyText}>{t('care.home.heroEmptyText')}</Text>
          </View>
        </View>
        <CareButton
          label={t('care.home.heroEmptyCta')}
          icon="calendar-plus"
          onPress={onBook}
          style={{ marginTop: spacing.md }}
        />
      </Card>
    );
  }

  const a = appointment;
  return (
    <View style={styles.hero}>
      <View style={styles.heroLeft}>
        <View style={styles.heroIcon}>
          <Icon name="calendar" size={26} color={colors.textOnBrand} />
        </View>
        <Text style={styles.heroKicker}>{t('care.home.heroKicker')}</Text>
        <Text style={styles.heroDay}>{relativeDay(t, a.scheduled_at)}</Text>
        <Text style={styles.heroTime}>{formatTime(a.scheduled_at)}</Text>
      </View>
      <View style={styles.heroRight}>
        <Text style={styles.heroType}>{typeLabelOf(t, a.appointment_type)}</Text>
        <Text style={styles.heroName} numberOfLines={2}>
          {a.provider_name ?? t('care.appt.providerTbd')}
        </Text>
        {!!a.provider_specialty && (
          <View style={styles.heroMetaRow}>
            <Icon name="stethoscope" size={18} color={colors.textSecondary} />
            <Text style={styles.heroMeta} numberOfLines={1}>
              {a.provider_specialty}
            </Text>
          </View>
        )}
        <View style={styles.heroMetaRow}>
          <Icon name="building" size={18} color={colors.textSecondary} />
          <View style={styles.heroMetaStack}>
            <Text style={styles.heroMeta} numberOfLines={1}>
              {a.facility_name ?? t('care.appt.facilityTbd')}
            </Text>
            {!!a.location && (
              <Text style={styles.heroMeta} numberOfLines={1}>
                {a.location}
              </Text>
            )}
          </View>
        </View>
        <CareButton
          label={t('care.home.heroDetails')}
          variant="secondary"
          iconRight="chevron-right"
          onPress={() => onDetails(a.id)}
          style={styles.heroButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  stack: { gap: spacing.sm + 2 },

  hero: {
    flexDirection: 'row',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  heroLeft: {
    width: 148,
    backgroundColor: colors.primaryDeep,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    gap: 2,
  },
  heroIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm + 2,
  },
  heroKicker: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textOnBrand,
  },
  heroDay: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textOnBrand,
    marginTop: 2,
  },
  heroTime: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textOnBrand,
  },
  heroRight: { flex: 1, padding: spacing.md, gap: 6 },
  heroType: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.link,
  },
  heroName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  heroMetaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  heroMetaStack: { flex: 1, minWidth: 0 },
  heroMeta: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  heroButton: { marginTop: spacing.sm + 2 },

  heroEmpty: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroEmptyCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmptyBody: { flex: 1, minWidth: 0 },
  heroEmptyTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  heroEmptyText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    lineHeight: typography.lineHeight.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },

  statsRow: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', gap: 6 },
  statDivided: { borderLeftWidth: 1, borderLeftColor: colors.divider },
  statCircle: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  statValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.xl,
    color: colors.textPrimary,
  },
  statLabel: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs },

  quick: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md - 2 },
  quickDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  quickCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  quickBody: { flex: 1, minWidth: 0 },
  quickTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  quickSubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
});
