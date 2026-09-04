/**
 * DOC — My Schedule.
 *
 * The screen a doctor opens between consultations: their own diary for a day
 * or a week, read time-first, with the patient's name, the type and the live
 * status. Backed by `GET api/v1/appointments`, which defaults to the
 * authenticated clinician's own appointments.
 *
 * Every count on this screen is derived from the rows actually loaded — there
 * is no summary endpoint on the staff API and a made-up number on a clinical
 * screen is worse than no number.
 */
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchSchedule, type StaffAppointment } from '../../api/doctorScheduling';
import { Card, EmptyState, Icon, ScreenHeader, SectionHeader } from '../../components';
import type { DoctorStackParamList } from '../../navigation/routes';
import { useTranslation } from '../../i18n';
import { colors, radii, spacing, typography } from '../../theme/theme';
import {
  AsyncBoundary,
  fmtDateLong,
  fmtRelativeDay,
  isoDay,
  useAsync,
} from '../care/shared';
import { ACTIVE_STATUSES, CountStrip, ScheduleRow, REQUEST_STATUSES } from './scheduleShared';

type Range = 'day' | 'week';

const STRIP_DAYS = 7;

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

/** Monday-first week containing `d`. */
function startOfWeek(d: Date): Date {
  const day = d.getDay();
  return addDays(d, day === 0 ? -6 : 1 - day);
}

export function DoctorScheduleScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<DoctorStackParamList, 'DoctorSchedule'>>();
  const [range, setRange] = useState<Range>('day');
  // `date` is the deep-link entry point ("show me this day"); an unparseable
  // one falls back to today rather than rendering an Invalid Date.
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = params?.date ? new Date(`${params.date}T00:00:00`) : new Date();
    return Number.isNaN(d.getTime()) ? new Date() : d;
  });

  const from = range === 'day' ? anchor : startOfWeek(anchor);
  const to = range === 'day' ? anchor : addDays(startOfWeek(anchor), 6);
  const fromKey = isoDay(from);
  const toKey = isoDay(to);

  const load = useCallback(
    () => fetchSchedule({ from: fromKey, to: toKey, per_page: 100 }).then((p) => p.data),
    [fromKey, toKey]
  );

  const state = useAsync<StaffAppointment[]>(load, [fromKey, toKey]);
  const { reload } = state;

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const strip = useMemo(() => {
    const first = range === 'week' ? startOfWeek(anchor) : addDays(anchor, -2);
    return Array.from({ length: STRIP_DAYS }, (_, i) => addDays(first, i));
  }, [anchor, range]);

  const open = (a: StaffAppointment) =>
    navigation.navigate('AppointmentDetail', { appointmentId: a.id });

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('doctor.schedule.title')}
        subtitle={range === 'day' ? fmtDateLong(from.toISOString()) : `${fmtDateLong(from.toISOString())} — ${fmtDateLong(to.toISOString())}`}
        showBack={false}
        actions={[
          {
            icon: 'clipboard',
            accessibilityLabel: t('doctor.schedule.requestsAction'),
            onPress: () => navigation.navigate('AppointmentRequests'),
          },
        ]}
      />

      <View style={styles.controls}>
        <View style={styles.rangeRow}>
          {(['day', 'week'] as Range[]).map((r) => (
            <TouchableOpacity
              key={r}
              onPress={() => setRange(r)}
              activeOpacity={0.8}
              style={[styles.rangeTab, range === r && styles.rangeTabOn]}
            >
              <Text style={[styles.rangeText, range === r && styles.rangeTextOn]}>
                {t(r === 'day' ? 'doctor.schedule.day' : 'doctor.schedule.week')}
              </Text>
            </TouchableOpacity>
          ))}
          <View style={styles.spacer} />
          <TouchableOpacity onPress={() => setAnchor(new Date())} hitSlop={8} activeOpacity={0.7}>
            <Text style={styles.today}>{t('doctor.schedule.today')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {strip.map((d) => {
            const on = isoDay(d) === isoDay(anchor);
            return (
              <TouchableOpacity
                key={isoDay(d)}
                onPress={() => setAnchor(d)}
                activeOpacity={0.8}
                style={[styles.day, on && styles.dayOn]}
              >
                <Text style={[styles.dayName, on && styles.dayTextOn]}>
                  {t(`doctor.weekday.${d.getDay()}`)}
                </Text>
                <Text style={[styles.dayNum, on && styles.dayTextOn]}>
                  {String(d.getDate()).padStart(2, '0')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

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
          onLink={() => {}}
          loadingLabel={t('doctor.schedule.loading')}
          isEmpty={(rows) => rows.length === 0}
          empty={
            <EmptyState
              icon="calendar"
              tint="blue"
              title={t(range === 'day' ? 'doctor.schedule.emptyDay' : 'doctor.schedule.emptyWeek')}
              message={t('doctor.schedule.emptyBody')}
            />
          }
        >
          {(rows) => <ScheduleBody rows={rows} range={range} onOpen={open} onRequests={() => navigation.navigate('AppointmentRequests')} />}
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

function ScheduleBody({
  rows,
  range,
  onOpen,
  onRequests,
}: {
  rows: StaffAppointment[];
  range: Range;
  onOpen: (a: StaffAppointment) => void;
  onRequests: () => void;
}) {
  const { t } = useTranslation();
  const counts = useMemo(() => {
    const active = rows.filter((a) => ACTIVE_STATUSES.includes(a.status)).length;
    const done = rows.filter((a) => a.status === 'completed').length;
    const requests = rows.filter((a) => REQUEST_STATUSES.includes(a.status)).length;
    return { active, done, requests };
  }, [rows]);

  /** Week view groups by day; day view is one flat list. */
  const groups = useMemo(() => {
    if (range === 'day') return [{ key: 'all', label: null as string | null, items: rows }];
    const map = new Map<string, StaffAppointment[]>();
    for (const a of rows) {
      const k = isoDay(new Date(a.scheduled_at));
      const bucket = map.get(k);
      if (bucket) bucket.push(a);
      else map.set(k, [a]);
    }
    return [...map.entries()].map(([key, items]) => ({
      key,
      label: fmtRelativeDay(items[0].scheduled_at),
      items,
    }));
  }, [rows, range]);

  return (
    <>
      <CountStrip
        items={[
          { label: t('doctor.schedule.countToSee'), value: counts.active, tint: 'blue' },
          { label: t('doctor.schedule.countCompleted'), value: counts.done, tint: 'green' },
          { label: t('doctor.schedule.countAwaiting'), value: counts.requests, tint: 'amber' },
        ]}
      />

      {counts.requests > 0 && (
        <TouchableOpacity onPress={onRequests} activeOpacity={0.8} style={styles.requestsLink}>
          <Icon name="clipboard" size={18} color={colors.link} />
          <Text style={styles.requestsText}>
            {t('doctor.schedule.awaitingLink', { count: counts.requests })}
          </Text>
          <Icon name="chevron-right" size={18} color={colors.link} />
        </TouchableOpacity>
      )}

      {groups.map((g) => (
        <View key={g.key} style={styles.group}>
          {!!g.label && <SectionHeader title={g.label} />}
          <Card variant="flush">
            {g.items.map((a, i) => (
              <View key={a.id}>
                {i > 0 && <View style={styles.divider} />}
                <ScheduleRow appointment={a} onPress={() => onOpen(a)} showDate={range === 'week'} />
              </View>
            ))}
          </Card>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },

  controls: { paddingHorizontal: spacing.md, gap: spacing.sm },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  spacer: { flex: 1 },
  rangeTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rangeTabOn: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  rangeText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  rangeTextOn: { fontFamily: typography.fontFamily.semiBold, color: colors.link },
  today: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.link,
  },

  strip: { gap: spacing.sm, paddingVertical: spacing.sm },
  day: {
    width: 52,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  dayOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  dayName: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.4,
    color: colors.textMuted,
  },
  dayNum: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  dayTextOn: { color: colors.textOnBrand },

  group: { gap: spacing.sm },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.md },

  requestsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md - 2,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  requestsText: {
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.sm,
    color: colors.link,
  },
});
