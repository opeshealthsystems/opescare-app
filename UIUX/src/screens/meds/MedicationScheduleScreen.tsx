/**
 * Medication Schedule — the patient's dosing timeline, day by day.
 *
 * The MED-001 "MEDICATION SCHEDULE" panel opened out into its own screen: a
 * week strip you can move through, the day's progress, and every dose on the
 * timeline with real taken/skip writes.
 *
 * Live data (verified against https://emr.opesware.com/api/v1):
 *   GET  /patient/medications/schedule?date=&days=   → { from, to, total, days[] }
 *   POST /patient/medications/doses/{id}/taken
 *   POST /patient/medications/doses/{id}/skip
 *
 * Composition only — every colour, radius and type size comes from
 * `src/theme/theme`, and every part from `src/components` or `./shared`.
 */
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  fetchMedicationSchedule,
  markDoseSkipped,
  markDoseTaken,
  type MedicationDose,
  type MedicationSchedule,
} from '../../api';
import { Card, EmptyState, Icon, LastUpdatedLine, ScreenHeader, useDialog } from '../../components';
import { type TFunction, useTranslation } from '../../i18n';
import { writeFailureMessage } from '../../lib/errors';
import { colors, radii, spacing, typography } from '../../theme/theme';
import {
  AsyncBoundary,
  DoseRow,
  MedButton,
  clock,
  fmtShortDate,
  sortDoses,
  toDate,
  useAsync,
} from './shared';

/** The strip shows a week at a time — the same window the API caps at 31 days. */
const WINDOW_DAYS = 7;

/** Literal keys so `npm run i18n:check` sees each one. */
function weekday(index: number, t: TFunction): string {
  switch (index) {
    case 0:
      return t('meds.schedule.weekdaySun');
    case 1:
      return t('meds.schedule.weekdayMon');
    case 2:
      return t('meds.schedule.weekdayTue');
    case 3:
      return t('meds.schedule.weekdayWed');
    case 4:
      return t('meds.schedule.weekdayThu');
    case 5:
      return t('meds.schedule.weekdayFri');
    default:
      return t('meds.schedule.weekdaySat');
  }
}

/** "2026-09-02" in local time, which is what the endpoint's `date` expects. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Parse a plain "YYYY-MM-DD" as a local date, not a UTC instant. */
function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function shiftDay(day: string, by: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + by);
  return isoDay(d);
}

function dayTitle(day: string, t: TFunction): string {
  const today = isoDay(new Date());
  if (day === today) return t('meds.schedule.dayToday');
  if (day === shiftDay(today, 1)) return t('meds.schedule.dayTomorrow');
  if (day === shiftDay(today, -1)) return t('meds.schedule.dayYesterday');
  return weekday(parseDay(day).getDay(), t);
}

export function MedicationScheduleScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const dialog = useDialog();
  const { t } = useTranslation();

  // The strip always starts on the day we were asked to show.
  const [from, setFrom] = useState<string>(() => {
    const wanted = route.params?.date as string | undefined;
    return wanted && /^\d{4}-\d{2}-\d{2}$/.test(wanted) ? wanted : isoDay(new Date());
  });
  const [selected, setSelected] = useState<string>(from);
  const [busyDose, setBusyDose] = useState<string | null>(null);
  /**
   * Doses whose last write failed. The app cannot tell whether the change
   * landed, so the row has to keep saying so out loud until a reload proves
   * otherwise — silence would sound like success.
   */
  const [unknownDoses, setUnknownDoses] = useState<Set<string>>(() => new Set());
  // Flips synchronously, before React re-renders the disabled row — a double
  // tap on a slow link must not record the same dose twice.
  const writing = useRef(false);

  const load = useCallback(
    () => fetchMedicationSchedule({ date: from, days: WINDOW_DAYS }),
    [from]
  );
  const state = useAsync<MedicationSchedule>(load, [from]);
  const { reload } = state;

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  /** Every day in the window, whether or not the API returned doses for it. */
  const days = useMemo(() => Array.from({ length: WINDOW_DAYS }, (_, i) => shiftDay(from, i)), [from]);

  function moveWindow(by: number) {
    const next = shiftDay(from, by * WINDOW_DAYS);
    setFrom(next);
    setSelected(next);
  }

  function onDosePress(dose: MedicationDose) {
    if (dose.status === 'taken' || dose.status === 'skipped') {
      navigation.navigate('MedicationDetail', { medicationId: dose.prescription_id });
      return;
    }

    dialog.show({
      title: dose.drug_name,
      tone: 'info',
      message: t('meds.dose.sheetMessage', {
        dose: dose.dose_label ?? t('meds.dose.sheetFallback'),
        time: clock(toDate(dose.scheduled_at)),
      }),
      cancelLabel: t('meds.dose.notNow'),
      actions: [
        { label: t('meds.dose.markTaken'), onPress: () => recordDose(dose, 'taken') },
        {
          label: t('meds.dose.skipDose'),
          variant: 'destructive',
          onPress: () => recordDose(dose, 'skipped'),
        },
        {
          label: t('meds.dose.viewMedication'),
          variant: 'secondary',
          onPress: () => navigation.navigate('MedicationDetail', { medicationId: dose.prescription_id }),
        },
      ],
    });
  }

  async function recordDose(dose: MedicationDose, next: 'taken' | 'skipped') {
    if (writing.current) return;
    writing.current = true;
    setBusyDose(dose.id);
    setUnknownDoses((prev) => {
      if (!prev.has(dose.id)) return prev;
      const next = new Set(prev);
      next.delete(dose.id);
      return next;
    });
    try {
      if (next === 'taken') await markDoseTaken(dose.id);
      else await markDoseSkipped(dose.id);
      reload();
    } catch (e) {
      // Reload either way: if the write did land, the row must stop saying
      // "upcoming", and the refreshed timeline is how the patient checks.
      reload();
      setUnknownDoses((prev) => new Set(prev).add(dose.id));
      dialog.show({
        title: t('meds.dose.failTitle'),
        tone: 'critical',
        cancelLabel: t('meds.dose.failOk'),
        message: writeFailureMessage(e, t('meds.dose.failHintTimeline')),
      });
    } finally {
      writing.current = false;
      setBusyDose(null);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('meds.schedule.title')}
        subtitle={t('meds.schedule.subtitle')}
        actions={[
          {
            icon: 'calendar',
            accessibilityLabel: t('meds.schedule.jumpToToday'),
            onPress: () => {
              const today = isoDay(new Date());
              setFrom(today);
              setSelected(today);
            },
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
          loadingLabel={t('meds.schedule.loading')}
        >
          {(schedule) => {
            const day = schedule.days.find((d) => d.date === selected);
            const doses = day ? sortDoses(day.doses) : [];
            const taken = day?.taken ?? 0;
            const total = day?.total ?? 0;

            return (
              <>
                <Card>
                  <View style={styles.weekHead}>
                    <TouchableOpacity
                      onPress={() => moveWindow(-1)}
                      hitSlop={10}
                      accessibilityLabel={t('meds.schedule.previousWeek')}
                      accessibilityRole="button"
                    >
                      <Icon name="chevron-left" size={20} color={colors.link} />
                    </TouchableOpacity>
                    <Text style={styles.weekLabel}>
                      {`${fmtShortDate(schedule.from)} – ${fmtShortDate(schedule.to)}`}
                    </Text>
                    <TouchableOpacity
                      onPress={() => moveWindow(1)}
                      hitSlop={10}
                      accessibilityLabel={t('meds.schedule.nextWeek')}
                      accessibilityRole="button"
                    >
                      <Icon name="chevron-right" size={20} color={colors.link} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.week}>
                    {days.map((d) => {
                      const info = schedule.days.find((x) => x.date === d);
                      return (
                        <DayChip
                          key={d}
                          day={d}
                          t={t}
                          taken={info?.taken ?? 0}
                          total={info?.total ?? 0}
                          active={d === selected}
                          onPress={() => setSelected(d)}
                        />
                      );
                    })}
                  </View>
                </Card>

                <Card>
                  <View style={styles.dayHead}>
                    <View style={styles.dayHeadText}>
                      <Text style={styles.dayTitle}>{dayTitle(selected, t)}</Text>
                      <Text style={styles.daySubtitle}>{fmtShortDate(selected)}</Text>
                    </View>
                    <Text style={styles.dayCount}>
                      {total === 0
                        ? t('meds.schedule.noDoses')
                        : t('meds.schedule.takenOfTotal', { taken, total })}
                    </Text>
                  </View>

                  {total > 0 && (
                    <View style={styles.track}>
                      <View style={[styles.trackFill, { width: `${Math.round((taken / total) * 100)}%` }]} />
                    </View>
                  )}

                  {doses.length === 0 ? (
                    <EmptyState
                      icon="clock"
                      tint="blue"
                      title={t('meds.schedule.emptyTitle')}
                      message={t('meds.schedule.emptyBody')}
                    />
                  ) : (
                    <View style={styles.timeline}>
                      {doses.map((d, i) => (
                        <DoseRow
                          key={d.id}
                          dose={d}
                          first={i === 0}
                          last={i === doses.length - 1}
                          busy={busyDose === d.id}
                          outcomeUnknown={unknownDoses.has(d.id)}
                          locked={busyDose !== null && busyDose !== d.id}
                          onPress={() => onDosePress(d)}
                        />
                      ))}
                    </View>
                  )}
                </Card>

                <MedButton
                  label={t('meds.schedule.viewMedications')}
                  icon="pill"
                  variant="secondary"
                  onPress={() => navigation.navigate('Medications')}
                />

                {/* Doses are time-sensitive — say when this was read. */}
                <LastUpdatedLine loadedAt={state.loadedAt} />
              </>
            );
          }}
        </AsyncBoundary>
      </ScrollView>

      {dialog.element}
    </View>
  );
}

/** One day in the week strip: weekday, date, and how much of it is done. */
function DayChip({
  day,
  taken,
  total,
  active,
  t,
  onPress,
}: {
  day: string;
  taken: number;
  total: number;
  active: boolean;
  t: TFunction;
  onPress: () => void;
}) {
  const d = parseDay(day);
  const done = total > 0 && taken >= total;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={t('meds.schedule.chipA11y', {
        weekday: weekday(d.getDay(), t),
        date: fmtShortDate(day),
        count: total,
      })}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipDay, active && styles.chipOn]}>{weekday(d.getDay(), t)}</Text>
      <Text style={[styles.chipDate, active && styles.chipOn]}>{String(d.getDate()).padStart(2, '0')}</Text>
      <View
        style={[
          styles.chipDot,
          total === 0
            ? styles.chipDotEmpty
            : { backgroundColor: done ? colors.statusNormal : colors.statusPending },
          active && done && styles.chipDotOnActive,
        ]}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

  weekHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  weekLabel: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },

  week: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  chip: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipDay: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  chipDate: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  chipOn: { color: colors.textOnBrand },
  chipDot: { width: 6, height: 6, borderRadius: radii.pill },
  chipDotEmpty: { backgroundColor: colors.divider },
  chipDotOnActive: { backgroundColor: colors.textOnBrand },

  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  dayHeadText: { minWidth: 0 },
  dayTitle: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.md,
    color: colors.textPrimary,
  },
  daySubtitle: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  dayCount: {
    fontFamily: typography.fontFamily.semiBold,
    fontSize: typography.size.xs,
    color: colors.link,
  },

  track: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  trackFill: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.statusNormal },

  timeline: { marginTop: spacing.sm },
});
