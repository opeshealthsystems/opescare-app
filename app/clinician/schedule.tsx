/**
 * Doctor — My Schedule (`/clinician/schedule`).
 *
 * Port of `UIUX/src/screens/doctor/DoctorScheduleScreen.tsx` onto expo-router,
 * the OPES UI kit and this app's doctor foundation.
 *
 * The screen a doctor opens between consultations: their own diary for a day
 * or a week, read time-first, with the patient's name, the type and the live
 * status. A row opens the appointment record — the only place a visit is
 * moved, closed or cancelled.
 *
 * EVERY COUNT ON THIS SCREEN IS DERIVED FROM THE ROWS ACTUALLY LOADED. The
 * staff API has no schedule-summary endpoint, and an invented number on a
 * clinical screen is worse than no number, so the strip counts what is on
 * screen and claims nothing about the rest of the clinic.
 *
 * Deep link: `/clinician/schedule?date=YYYY-MM-DD` opens on that day. An
 * unparseable date falls back to today rather than rendering Invalid Date.
 *
 * Backend gap: the finder does not serve `/mobile/doctor/*` yet, so this hook
 * 404s today. A 404 (or any failure with nothing on screen) renders an honest
 * EmptyState with a retry; nothing spins forever and nothing is invented.
 *
 * i18n: `opesDoctor.*` is being migrated into the app locales. Every string
 * carries a `defaultValue` until the keys land. Locale files are not edited
 * here.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RoleGate } from '@/components/doctor/RoleGate';
import {
  Card,
  EmptyState,
  Icon,
  ScreenHeader,
  SectionHeader,
  StaleNotice,
  radii,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import {
  LoadingBlock,
  describeFailure,
  fmtDateLong,
  fmtRelativeDay,
  isoDay,
  type Translate,
} from '@/components/care/shared';
// ── Doctor foundation (owned by the foundation agent) ─────────────────────
import {
  isDoctorFeatureUnserved,
  useDoctorSchedule,
  type StaffAppointment,
} from '@/lib/api/doctorQueries';
import {
  ACTIVE_STATUSES,
  CountStrip,
  REQUEST_STATUSES,
  ScheduleRow,
} from '@/components/doctor/scheduleShared';
import { doctorRoutes } from '@/components/doctor/chartRoutes';

type Range = 'day' | 'week';

/** Days offered in the horizontal picker above the list. */
const STRIP_DAYS = 7;

/** One read covers a whole week; the staff diary is never that long. */
const PER_PAGE = 100;

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

/**
 * Role gate — schedule. A role without it never mounts the screen
 * below, so none of its queries run and the server is never asked what it
 * would refuse (`lib/staffCapabilities.ts`, mirror of config/staff_capabilities.php).
 */
export default function DoctorScheduleScreen() {
  return (
    <RoleGate need={['schedule']}>
      <DoctorScheduleScreenBody />
    </RoleGate>
  );
}

function DoctorScheduleScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ date?: string }>();

  /** `opesDoctor.<key>` with a readable default until the catalogue lands. */
  const tx = useCallback(
    (key: string, defaultValue: string, p?: Record<string, unknown>) =>
      String(t(`opesDoctor.${key}`, { defaultValue, ...p })),
    [t]
  );
  const tr = useCallback<Translate>(
    (key, p) => String(t(key, p as Record<string, unknown>)),
    [t]
  );

  const [range, setRange] = useState<Range>('day');
  // `date` is the deep-link entry point ("show me this day"). Parsed at local
  // midnight; anything unparseable falls back to today.
  const [anchor, setAnchor] = useState<Date>(() => {
    const raw = typeof params.date === 'string' ? params.date : undefined;
    const d = raw ? new Date(`${raw}T00:00:00`) : new Date();
    return Number.isNaN(d.getTime()) ? new Date() : d;
  });

  const from = range === 'day' ? anchor : startOfWeek(anchor);
  const to = range === 'day' ? anchor : addDays(startOfWeek(anchor), 6);
  const fromKey = isoDay(from);
  const toKey = isoDay(to);

  const schedule = useDoctorSchedule({ from: fromKey, to: toKey, per_page: PER_PAGE });
  const { refetch } = schedule;

  // Coming back from an appointment that was checked in, moved or cancelled
  // must not leave the old status on the diary. The first focus is the mount
  // fetch itself, so it is skipped.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void refetch();
    }, [refetch])
  );

  // `useDoctorSchedule` answers the paginated envelope (`DoctorPage<T>` =
  // { data, meta.pagination }), not a bare array — the rows are one level in.
  // `?? []` covers the first render and a failed read.
  const rows: StaffAppointment[] = schedule.data?.data ?? [];

  const strip = useMemo(() => {
    const first = range === 'week' ? startOfWeek(anchor) : addDays(anchor, -2);
    return Array.from({ length: STRIP_DAYS }, (_, i) => addDays(first, i));
  }, [anchor, range]);

  const openAppointment = (a: StaffAppointment) => router.push(doctorRoutes.appointment(a.id));
  const openRequests = () => router.push(doctorRoutes.requests);

  // A refresh that failed while rows are on screen must never pass as fresh.
  const stale =
    schedule.isError && schedule.data !== undefined ? (
      <StaleNotice
        message={describeFailure(schedule.error).message}
        loadedAt={schedule.dataUpdatedAt ? new Date(schedule.dataUpdatedAt) : null}
        onRetry={() => void refetch()}
        retrying={schedule.isFetching}
      />
    ) : null;

  let body: React.ReactNode;
  if (schedule.isPending) {
    body = <LoadingBlock label={tx('schedule.loading', 'Loading your schedule…')} />;
  } else if (schedule.isError && schedule.data === undefined) {
    const notServed = isDoctorFeatureUnserved(schedule.error);
    body = (
      <EmptyState
        icon={notServed ? 'calendar' : 'alert-circle'}
        tint={notServed ? 'blue' : 'red'}
        title={
          notServed
            ? tx('shared.notServedTitle', 'Not available on this server yet')
            : tr('opesCore.errors.unknownTitle')
        }
        message={
          notServed
            ? tx(
                'shared.notServedSchedule',
                "Clinician data isn't connected yet. Your diary will appear here once the clinician service is enabled for this app."
              )
            : describeFailure(schedule.error).message
        }
        actionLabel={tr('opesCore.common.retry')}
        onAction={() => void refetch()}
      />
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon="calendar"
        tint="blue"
        title={
          range === 'day'
            ? tx('schedule.emptyDay', 'Nothing booked this day')
            : tx('schedule.emptyWeek', 'Nothing booked this week')
        }
        message={tx(
          'schedule.emptyBody',
          'Appointments assigned to you will appear here as soon as they are booked.'
        )}
      />
    );
  } else {
    body = (
      <ScheduleBody
        rows={rows}
        range={range}
        styles={styles}
        colors={colors}
        tx={tx}
        onOpen={openAppointment}
        onRequests={openRequests}
      />
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={tx('schedule.title', 'My Schedule')}
        subtitle={
          range === 'day'
            ? fmtDateLong(from.toISOString())
            : `${fmtDateLong(from.toISOString())} — ${fmtDateLong(to.toISOString())}`
        }
        showBack={false}
        actions={[
          {
            icon: 'clipboard',
            accessibilityLabel: tx('schedule.requestsAction', 'Appointment requests'),
            onPress: openRequests,
          },
        ]}
      />

      <View style={styles.controls}>
        <View style={styles.rangeRow}>
          {(['day', 'week'] as Range[]).map((r) => {
            const on = range === r;
            return (
              <TouchableOpacity
                key={r}
                onPress={() => setRange(r)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.rangeTab, on && styles.rangeTabOn]}
              >
                <Text style={[styles.rangeText, on && styles.rangeTextOn]}>
                  {r === 'day' ? tx('schedule.day', 'Day') : tx('schedule.week', 'Week')}
                </Text>
              </TouchableOpacity>
            );
          })}
          <View style={styles.spacer} />
          <TouchableOpacity
            onPress={() => setAnchor(new Date())}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.today}>{tx('schedule.today', 'Today')}</Text>
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
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                // The two lines read as "Mon" then "04" otherwise — a date
                // nobody can act on without reassembling it.
                accessibilityLabel={fmtDateLong(d.toISOString())}
                style={[styles.day, on && styles.dayOn]}
              >
                <Text style={[styles.dayName, on && styles.dayTextOn]}>
                  {tx(`weekday.${d.getDay()}`, DEFAULT_WEEKDAY[d.getDay()] ?? '')}
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
            refreshing={schedule.isFetching && !schedule.isPending}
            onRefresh={() => void refetch()}
            tintColor={colors.blue}
          />
        }
      >
        {stale}
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Only a fallback for `opesDoctor.weekday.*`; the catalogue is the source. */
const DEFAULT_WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ScheduleBody({
  rows,
  range,
  styles,
  colors,
  tx,
  onOpen,
  onRequests,
}: {
  rows: StaffAppointment[];
  range: Range;
  styles: ReturnType<typeof makeStyles>;
  colors: Palette;
  tx: (key: string, defaultValue: string, p?: Record<string, unknown>) => string;
  onOpen: (a: StaffAppointment) => void;
  onRequests: () => void;
}) {
  // Counted from the rows on screen — see the file header.
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
      // `items[0]` exists: a bucket is only created with a row in it.
      label: fmtRelativeDay(items[0]!.scheduled_at),
      items,
    }));
  }, [rows, range]);

  return (
    <>
      <CountStrip
        items={[
          { label: tx('schedule.countToSee', 'To see'), value: counts.active, tint: 'blue' },
          { label: tx('schedule.countCompleted', 'Completed'), value: counts.done, tint: 'green' },
          { label: tx('schedule.countAwaiting', 'Awaiting you'), value: counts.requests, tint: 'amber' },
        ]}
      />

      {counts.requests > 0 && (
        <TouchableOpacity
          onPress={onRequests}
          activeOpacity={0.8}
          accessibilityRole="button"
          style={styles.requestsLink}
        >
          <Icon name="clipboard" size={18} color={colors.link} />
          <Text style={styles.requestsText}>
            {tx(
              'schedule.awaitingLink',
              counts.requests === 1
                ? '1 appointment in this range is still awaiting your decision'
                : '{{count}} appointments in this range are still awaiting your decision',
              { count: counts.requests }
            )}
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

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
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
