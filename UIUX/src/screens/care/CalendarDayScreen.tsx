/**
 * CARE-023 — Calendar · Day.
 *
 * A single day's timeline over `GET /patient/appointments?from=&to=`. The
 * week strip and the arrows re-query the API for the chosen day; the counter
 * strip is derived from the day's real rows (a row carrying
 * `rescheduled_from_id` is presented as "Rescheduled", matching the render).
 */
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { fetchAppointments, type PortalAppointment } from '../../api';
import { Card, EmptyState, Icon, IconName, ScreenHeader } from '../../components';
import { useTranslation } from '../../i18n';
import type { AppStackParamList } from '../../navigation/routes';
import { colors, radii, spacing, statusMap, typography, Tint, tintMap } from '../../theme/theme';
import { formatTime } from '../../utils/format';
import {
  AsyncBoundary,
  dayShort,
  fmtDateLong,
  isoDay,
  SearchField,
  typeIcon,
  typeLabel,
  useAsync,
} from './shared';

/*
 * Day and month names come from `./shared` — the same helpers every other CARE
 * screen formats dates with. This screen used to keep private copies, which is
 * how a wired-up screen ends up spelling a date differently from the one that
 * navigated to it.
 */

/** Presentation status — the API status widened with the "rescheduled" case. */
type DayStatus = 'confirmed' | 'completed' | 'cancelled' | 'rescheduled' | 'pending';

function dayStatus(a: PortalAppointment): DayStatus {
  if (a.status === 'cancelled' || a.status === 'no_show') return 'cancelled';
  if (a.status === 'completed') return 'completed';
  if (a.rescheduled_from_id) return 'rescheduled';
  if (a.status === 'confirmed' || a.status === 'arrived' || a.status === 'in_progress') return 'confirmed';
  return 'pending';
}

/** Catalogue keys, not words — the pill is rendered in the reader's locale. */
const STATUS_KEY: Record<DayStatus, string> = {
  confirmed: 'care.day.statusConfirmed',
  completed: 'care.day.statusCompleted',
  cancelled: 'care.day.statusCancelled',
  rescheduled: 'care.day.statusRescheduled',
  pending: 'care.day.statusPending',
};

const STATUS_TINT: Record<DayStatus, Tint> = {
  confirmed: 'blue',
  completed: 'green',
  cancelled: 'amber',
  rescheduled: 'purple',
  pending: 'blue',
};

const STATUS_TONE: Record<DayStatus, keyof typeof statusMap> = {
  confirmed: 'pending',
  completed: 'normal',
  cancelled: 'warning',
  rescheduled: 'info',
  pending: 'pending',
};

function parseDay(iso: string | undefined): Date {
  const d = iso ? new Date(`${iso.slice(0, 10)}T12:00:00`) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function weekOf(d: Date): Date[] {
  const start = addDays(d, -d.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * The timeline gutter stacks the hour over its meridiem, so it needs the two
 * halves separately — but it must not build them itself. It used to, in
 * English AM/PM regardless of locale. Split `utils/format.formatTime`, which
 * emits « 14:30 » with no meridiem in French: FR simply gets an empty second
 * line, which is what a 24-hour clock should render.
 */
function clock(iso: string): { time: string; meridiem: string } {
  const full = formatTime(iso, '—');
  const [time, meridiem = ''] = full.split(' ');
  return { time, meridiem };
}

export function CalendarDayScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { params } = useRoute<RouteProp<AppStackParamList, 'CalendarDay'>>();

  const [day, setDay] = useState<Date>(() => parseDay(params?.date));
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [hideCancelled, setHideCancelled] = useState(false);

  const key = isoDay(day);

  const load = useCallback(
    () => fetchAppointments({ scope: 'all', from: key, to: key, per_page: 50 }).then((p) => p.data),
    [key]
  );
  const state = useAsync<PortalAppointment[]>(load, [key]);
  const { reload, reloadIfStale } = state;

  useFocusEffect(
    useCallback(() => {
      reloadIfStale();
    }, [reloadIfStale])
  );

  const all = state.data ?? [];

  const counts = useMemo(() => {
    let completed = 0;
    let cancelled = 0;
    let rescheduled = 0;
    for (const a of all) {
      const s = dayStatus(a);
      if (s === 'completed') completed += 1;
      else if (s === 'cancelled') cancelled += 1;
      else if (s === 'rescheduled') rescheduled += 1;
    }
    return { total: all.length, completed, cancelled, rescheduled };
  }, [all]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((a) => (hideCancelled ? dayStatus(a) !== 'cancelled' : true))
      .filter((a) =>
        q
          ? [a.provider_name, a.provider_specialty, a.facility_name, a.location, a.reason, typeLabel(a.appointment_type)]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q))
          : true
      )
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  }, [all, query, hideCancelled]);

  const week = useMemo(() => weekOf(day), [day]);
  // `key` is the local calendar day; noon keeps the label on the right side of
  // any timezone boundary, which `toISOString()` would not.
  const longLabel = fmtDateLong(`${key}T12:00:00`);

  return (
    <View style={s.screen}>
      <ScreenHeader
        title={t('care.day.title')}
        subtitle={t('care.day.subtitle')}
        showBack={navigation.canGoBack()}
        actions={[
          {
            icon: 'search',
            onPress: () => setSearching((v) => !v),
            accessibilityLabel: t('care.day.a11ySearch'),
          },
          {
            icon: 'filter',
            onPress: () => setHideCancelled((v) => !v),
            accessibilityLabel: hideCancelled
              ? t('care.day.a11yShowCancelled')
              : t('care.day.a11yHideCancelled'),
          },
        ]}
      />

      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={state.loading && !!state.data} onRefresh={reload} />}
      >
        {searching && (
          <SearchField value={query} onChangeText={setQuery} placeholder={t('care.day.searchPlaceholder')} />
        )}

        {/* Day switcher */}
        <View style={s.switcher}>
          <TouchableOpacity
            style={s.arrow}
            onPress={() => setDay((d) => addDays(d, -1))}
            accessibilityRole="button"
            accessibilityLabel={t('care.day.a11yPreviousDay')}
          >
            <Icon name="chevron-left" size={22} color={colors.link} strokeWidth={2.2} />
          </TouchableOpacity>
          <View style={s.switcherLabel}>
            <Icon name="calendar" size={20} color={colors.link} />
            <Text style={s.switcherText}>{longLabel}</Text>
          </View>
          <TouchableOpacity
            style={s.arrow}
            onPress={() => setDay((d) => addDays(d, 1))}
            accessibilityRole="button"
            accessibilityLabel={t('care.day.a11yNextDay')}
          >
            <Icon name="chevron-right" size={22} color={colors.link} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        {/* Week strip */}
        <Card variant="flush" style={s.weekCard}>
          <View style={s.week}>
            {week.map((d, i) => {
              const active = isoDay(d) === key;
              return (
                <TouchableOpacity
                  key={isoDay(d)}
                  onPress={() => setDay(d)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[s.weekCell, active && s.weekCellActive, i > 0 && !active && s.weekCellBorder]}
                >
                  <Text style={[s.weekDow, active && s.weekTextActive]}>{dayShort(d)}</Text>
                  <Text style={[s.weekNum, active && s.weekTextActive]}>{d.getDate()}</Text>
                  <View style={[s.weekDot, active && s.weekDotActive]} />
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {/* Counters */}
        <Card variant="flush" style={s.countsCard}>
          <View style={s.counts}>
            <Counter icon="calendar" tint="blue" value={counts.total} label={t('care.day.countAppointments')} />
            <Counter icon="check-circle" tint="green" value={counts.completed} label={t('care.day.countCompleted')} divider />
            <Counter icon="clock" tint="amber" value={counts.cancelled} label={t('care.day.countCancelled')} divider />
            <Counter icon="refresh" tint="purple" value={counts.rescheduled} label={t('care.day.countRescheduled')} divider />
          </View>
        </Card>

        <AsyncBoundary state={state} onLink={() => navigation.navigate('MyHealthId')} loadingLabel={t('care.day.loading')}>
          {() => rows.length === 0 ? (
            <EmptyState
              icon="calendar"
              title={t('care.day.emptyTitle')}
              message={all.length > 0 ? t('care.day.emptyFiltered') : t('care.day.emptyNone')}
              actionLabel={t('care.day.emptyAction')}
              onAction={() => navigation.navigate('FindProvider', {})}
            />
          ) : (
            <View style={s.timeline}>
              {rows.map((a, i) => {
                const st = dayStatus(a);
                const skin = tintMap[STATUS_TINT[st]];
                const tone = statusMap[STATUS_TONE[st]];
                const c = clock(a.scheduled_at);
                return (
                  <View key={a.id} style={s.tlRow}>
                    <View style={s.tlGutter}>
                      <Text style={[s.tlTime, { color: skin.fg }]}>{c.time}</Text>
                      <Text style={[s.tlMeridiem, { color: skin.fg }]}>{c.meridiem}</Text>
                      {i < rows.length - 1 && <View style={s.tlLine} />}
                    </View>
                    <View style={[s.tlDot, { backgroundColor: skin.fg }]} />
                    <TouchableOpacity
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      onPress={() => navigation.navigate('AppointmentDetail', { appointmentId: a.id })}
                      style={[s.event, { backgroundColor: skin.bg }]}
                    >
                      <View style={[s.eventIcon, { backgroundColor: skin.fg }]}>
                        <Icon name={typeIcon(a.appointment_type)} size={22} color={colors.textOnBrand} />
                      </View>
                      <View style={s.eventBody}>
                        <Text style={s.eventTitle} numberOfLines={1}>
                          {a.provider_name ?? typeLabel(a.appointment_type)}
                        </Text>
                        <Text style={s.eventSub} numberOfLines={1}>
                          {a.reason ?? a.provider_specialty ?? typeLabel(a.appointment_type)}
                        </Text>
                        <View style={s.eventMeta}>
                          <Icon name="location" size={14} color={skin.fg} />
                          <Text style={[s.eventMetaText, { color: skin.fg }]} numberOfLines={1}>
                            {a.facility_name ?? a.location ?? t('care.day.locationTbc')}
                          </Text>
                        </View>
                      </View>
                      <View style={s.eventTrailing}>
                        <View style={[s.eventPill, { backgroundColor: tone.bg }]}>
                          <Text style={[s.eventPillText, { color: tone.fg }]}>{t(STATUS_KEY[st])}</Text>
                        </View>
                        <Icon name="chevron-right" size={20} color={skin.fg} />
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </AsyncBoundary>

        <Card style={s.tipCard}>
          <View style={s.tip}>
            <Icon name="info" size={26} color={colors.link} />
            <View style={s.tipBody}>
              <Text style={s.tipTitle}>{t('care.day.tipTitle')}</Text>
              <Text style={s.tipText}>{t('care.day.tipArriveEarly')}</Text>
              <Text style={s.tipText}>{t('care.day.tipReschedule')}</Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

function Counter({
  icon,
  tint,
  value,
  label,
  divider,
}: {
  icon: IconName;
  tint: Tint;
  value: number;
  label: string;
  divider?: boolean;
}) {
  const skin = tintMap[tint];
  return (
    <View style={[s.counter, divider && s.counterDivider]}>
      <View style={s.counterTop}>
        <View style={[s.counterIcon, { backgroundColor: skin.bg }]}>
          <Icon name={icon} size={18} color={skin.fg} />
        </View>
        <Text style={s.counterValue}>{value}</Text>
      </View>
      <Text style={[s.counterLabel, { color: skin.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },

  switcher: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  arrow: {
    width: 46,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switcherLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  switcherText: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.link,
  },

  weekCard: { overflow: 'hidden' },
  week: { flexDirection: 'row' },
  weekCell: { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 2 },
  weekCellBorder: { borderLeftWidth: 1, borderLeftColor: colors.divider },
  weekCellActive: { backgroundColor: colors.blue, borderRadius: radii.md },
  weekDow: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    letterSpacing: 0.4,
    color: colors.textSecondary,
  },
  weekNum: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  weekTextActive: { color: colors.textOnBrand },
  weekDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent' },
  weekDotActive: { backgroundColor: colors.textOnBrand },

  countsCard: { overflow: 'hidden' },
  counts: { flexDirection: 'row', paddingVertical: spacing.md - 4 },
  counter: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  counterDivider: { borderLeftWidth: 1, borderLeftColor: colors.divider },
  counterTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  counterIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  counterValue: {
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.size.lg,
    color: colors.textPrimary,
  },
  counterLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 11,
  },

  timeline: { gap: spacing.md },
  tlRow: { flexDirection: 'row', alignItems: 'flex-start' },
  tlGutter: { width: 62, alignItems: 'flex-start', paddingTop: 6 },
  tlTime: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
  },
  tlMeridiem: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
  },
  tlLine: {
    position: 'absolute',
    left: 56,
    top: 18,
    bottom: -spacing.md - 12,
    width: 1,
    backgroundColor: colors.border,
  },
  tlDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 12,
    marginRight: spacing.md - 4,
    marginLeft: -5,
  },
  event: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    padding: spacing.md - 2,
    borderRadius: radii.md,
  },
  eventIcon: { width: 48, height: 48, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  eventBody: { flex: 1, minWidth: 0, gap: 2 },
  eventTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  eventSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  eventMetaText: { fontFamily: typography.fontFamily.regular, fontSize: typography.size.xs },
  eventTrailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eventPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.sm },
  eventPillText: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs },

  tipCard: { marginTop: spacing.xs },
  tip: { flexDirection: 'row', gap: spacing.md - 4, alignItems: 'flex-start' },
  tipBody: { flex: 1, gap: 2 },
  tipTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  tipText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },
});
