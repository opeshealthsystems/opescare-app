/**
 * FollowUpSheet — "Book a follow-up" for one patient, as a bottom sheet.
 *
 * Opened from the chart header (`app/clinician/patient/[id].tsx`, also
 * automatically when the route carries `followUp=1` — a result's "next step")
 * and from an attended or completed visit (`app/clinician/appointments/[id].tsx`).
 * One writer behind it: `useBookFollowUp()` →
 * `POST /mobile/doctor/patients/{id}/follow-up { scheduled_at, reason? }`,
 * which books a `follow_up` appointment with the signed-in clinician as the
 * provider, at the token's facility.
 *
 * ── THE RULES IT KEEPS (the same as the appointment record's) ─────────────
 *  1. NEVER CLAIM AVAILABILITY WE DO NOT HAVE. There is no staff slot
 *     endpoint, so the grid marks only the times already taken in THIS
 *     clinician's own diary (read from the schedule endpoint) and says so;
 *     nothing else is presented as free. A diary that could not be read is
 *     stated, never assumed empty.
 *  2. NEVER CLAIM A SUCCESS WE CANNOT SEE. The booked state is drawn from the
 *     appointment the SERVER returned, and "Open appointment" opens that row.
 *     A failure is named (`describeFailure`), a role refusal is named as a
 *     role refusal, and the sheet stays open so the clinician can try again
 *     or leave.
 *  3. A TIME IN THE PAST IS REFUSED ON THE PHONE FIRST — the server would 422
 *     it anyway, but a slot that has just gone stale should not cost a round
 *     trip to find out.
 *
 * Built from RN `Modal` like the kit `Dialog` and `QuickAddSheet`, so it
 * behaves identically on iOS, Android and the web build. Kit tokens only.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Icon,
  PillInput,
  radii,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { CareButton, describeFailure, fmtDateLong, fmtTime, isoDay } from '@/components/care/shared';
import {
  isRoleForbidden,
  useBookFollowUp,
  useDoctorSchedule,
  type StaffAppointment,
} from '@/lib/api/doctorQueries';
import { staffTypeLabel } from '@/components/doctor/scheduleShared';
import { doctorRoutes } from '@/components/doctor/chartRoutes';

/** Clinic day presented by the grid, in 30-minute steps — as the reschedule grid. */
const GRID_START_HOUR = 8;
const GRID_END_HOUR = 18;
const GRID_STEP_MIN = 30;
/** How far ahead the day strip reaches. Follow-ups are commonly 1–8 weeks out. */
const WINDOW_DAYS = 56;
/** The quick picks, in days from today. */
const QUICK_PICKS: { days: number; key: 'weeks' | 'months'; count: number }[] = [
  { days: 7, key: 'weeks', count: 1 },
  { days: 14, key: 'weeks', count: 2 },
  { days: 28, key: 'weeks', count: 4 },
  { days: 84, key: 'months', count: 3 },
];

/** Only a fallback for `opesDoctor.weekday.*`; the catalogue is the source. */
const DEFAULT_WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type FollowUpSheetProps = {
  visible: boolean;
  /** The Health ID (or record uuid) — the key the chart is opened with. */
  patientId: string;
  /** What to call the patient in the sheet; the Health ID when no name is known. */
  patientLabel?: string | null;
  onClose: () => void;
  /** The appointment the server created, once it has. */
  onBooked?: (appointment: StaffAppointment) => void;
};

type Tx = (key: string, defaultValue: string, params?: Record<string, unknown>) => string;

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function daysFromToday(days: number): Date {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() + days);
  return d;
}

export function FollowUpSheet({ visible, patientId, patientLabel, onClose, onBooked }: FollowUpSheetProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, statusMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const tx = useCallback<Tx>(
    (key, defaultValue, params) => String(t(`opesDoctor.${key}`, { defaultValue, ...params })),
    [t],
  );

  const book = useBookFollowUp();

  const [day, setDay] = useState<Date>(() => daysFromToday(7));
  const [when, setWhen] = useState<Date | null>(null);
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [booked, setBooked] = useState<StaffAppointment | null>(null);

  // Each opening starts clean — a sheet that remembers the last patient's
  // slot and reason would book the wrong thing with one tap.
  useEffect(() => {
    if (!visible) return;
    setDay(daysFromToday(7));
    setWhen(null);
    setReason('');
    setLocalError(null);
    setBooked(null);
    book.reset();
    // `book` is a stable mutation object; listing it would reset on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const days = useMemo(() => Array.from({ length: WINDOW_DAYS }, (_, i) => daysFromToday(i)), []);
  const dayKey = isoDay(day);

  // This clinician's own diary for the chosen day — the ONLY availability
  // this app can honestly show. Read only while the sheet is open.
  const diary = useDoctorSchedule({ from: dayKey, to: dayKey, per_page: 100 }, { enabled: visible && !booked });
  const takenKeys = useMemo(
    () =>
      new Set(
        (diary.data?.data ?? [])
          .filter((x) => !['cancelled', 'no_show'].includes(x.status))
          .map((x) => {
            const d = new Date(x.scheduled_at);
            return `${d.getHours()}:${d.getMinutes()}`;
          }),
      ),
    [diary.data],
  );
  const marksMissing = diary.isError && diary.data === undefined;

  const slots = useMemo(() => {
    const out: Date[] = [];
    for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h += 1) {
      for (let m = 0; m < 60; m += GRID_STEP_MIN) {
        const d = new Date(day);
        d.setHours(h, m, 0, 0);
        out.push(d);
      }
    }
    return out;
  }, [day]);

  const pickDay = (d: Date) => {
    setDay(d);
    setWhen(null);
    setLocalError(null);
  };

  const submit = async () => {
    if (!when || book.isPending) return;
    if (when.getTime() <= Date.now()) {
      setLocalError(tx('followUp.pastTime', 'That time has already passed. Choose a later one.'));
      return;
    }
    setLocalError(null);
    try {
      const appointment = await book.mutateAsync({ patientId, when, reason });
      setBooked(appointment);
      onBooked?.(appointment);
    } catch {
      // Named below from `book.error`; the sheet stays open.
    }
  };

  const openBooked = () => {
    if (!booked) return;
    onClose();
    router.push(doctorRoutes.appointment(booked.id));
  };

  const who = patientLabel?.trim() || patientId;
  const busy = book.isPending;

  // What went wrong, in words. A role refusal is a role refusal; anything else
  // is `describeFailure`'s reading of the answer (a 422's message included).
  const serverError = book.isError
    ? isRoleForbidden(book.error)
      ? tx('followUp.roleRefused', 'Your role does not include booking follow-ups. Nothing was changed.')
      : describeFailure(book.error).message
    : null;
  const errorText = localError ?? serverError;

  const okSkin = statusMap.normal;
  const infoSkin = statusMap.pending;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={busy ? undefined : onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={busy ? undefined : onClose}
        accessibilityRole="button"
        accessibilityLabel={String(t('opesCore.common.close', { defaultValue: 'Close' }))}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none">
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}
          accessibilityViewIsModal
        >
          <View style={styles.grab} />

          {booked ? (
            // ── Booked: what the SERVER stored, never what was asked for ──
            <>
              <View style={styles.head}>
                <View style={styles.mark}>
                  <Icon name="calendar-check" size={24} color={okSkin.fg} />
                </View>
                <View style={styles.headText}>
                  <Text style={styles.title}>{tx('followUp.bookedTitle', 'Follow-up booked')}</Text>
                  <Text style={styles.subtitle}>{who}</Text>
                </View>
              </View>
              <Text style={styles.message}>
                {tx(
                  'followUp.bookedBody',
                  '{{type}} on {{date}} at {{time}}. It is now in your diary.',
                  {
                    type: staffTypeLabel(booked.appointment_type),
                    date: fmtDateLong(booked.scheduled_at),
                    time: fmtTime(booked.scheduled_at),
                  },
                )}
              </Text>
              {!!booked.reason && <Text style={styles.reasonEcho}>{booked.reason}</Text>}
              <View style={styles.actions}>
                <CareButton
                  label={tx('followUp.openAppointment', 'Open appointment')}
                  icon="calendar"
                  onPress={openBooked}
                />
                <CareButton label={tx('followUp.done', 'Done')} variant="secondary" onPress={onClose} />
              </View>
            </>
          ) : (
            // ── The form ────────────────────────────────────────────────
            <>
              <View style={styles.head}>
                <View style={styles.mark}>
                  <Icon name="calendar-plus" size={24} color={infoSkin.fg} />
                </View>
                <View style={styles.headText}>
                  <Text style={styles.title}>{tx('followUp.title', 'Book a follow-up')}</Text>
                  <Text style={styles.subtitle}>{tx('followUp.subtitleFor', 'For {{patient}}', { patient: who })}</Text>
                </View>
              </View>

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.body}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Quick picks: a common interval in one tap, still a day the strip shows. */}
                <Text style={styles.label}>{tx('followUp.quickPicks', 'Quick pick')}</Text>
                <View style={styles.chips}>
                  {QUICK_PICKS.map((q) => {
                    const target = daysFromToday(q.days);
                    const on = isoDay(target) === dayKey;
                    return (
                      <TouchableOpacity
                        key={q.days}
                        onPress={() => pickDay(target)}
                        disabled={busy}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on, disabled: busy }}
                        style={[styles.chip, on && styles.chipOn]}
                      >
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>
                          {q.key === 'weeks'
                            ? tx('followUp.inWeeks', q.count === 1 ? 'In 1 week' : 'In {{count}} weeks', { count: q.count })
                            : tx('followUp.inMonths', q.count === 1 ? 'In 1 month' : 'In {{count}} months', { count: q.count })}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* The day. */}
                <Text style={styles.label}>{tx('followUp.pickDay', 'Day')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
                  {days.map((d) => {
                    const on = isoDay(d) === dayKey;
                    return (
                      <TouchableOpacity
                        key={isoDay(d)}
                        onPress={() => pickDay(d)}
                        disabled={busy}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on, disabled: busy }}
                        accessibilityLabel={fmtDateLong(d.toISOString())}
                        style={[styles.day, on && styles.dayOn]}
                      >
                        <Text style={[styles.dayName, on && styles.dayTextOn]}>
                          {tx(`weekday.${d.getDay()}`, DEFAULT_WEEKDAY[d.getDay()] ?? '')}
                        </Text>
                        <Text style={[styles.dayNum, on && styles.dayTextOn]}>
                          {String(d.getDate()).padStart(2, '0')}
                        </Text>
                        <Text style={[styles.dayMonth, on && styles.dayTextOn]}>
                          {String(d.getMonth() + 1).padStart(2, '0')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* The time. Only this clinician's own bookings are marked. */}
                <Text style={styles.label}>{tx('followUp.pickTime', 'Time')}</Text>
                <Text style={styles.hint}>
                  {tx(
                    'followUp.diaryHint',
                    'Times already booked in your own diary for the chosen day are marked. Nothing else is claimed to be free.',
                  )}
                </Text>
                {marksMissing && (
                  <Text style={styles.hintWarn}>
                    {tx(
                      'appointment.diaryFailed',
                      'Your diary for this day could not be loaded, so booked times are not marked.',
                    )}
                  </Text>
                )}
                <View style={styles.slots}>
                  {slots.map((s) => {
                    const key = `${s.getHours()}:${s.getMinutes()}`;
                    const isTaken = takenKeys.has(key);
                    const past = s.getTime() <= Date.now();
                    const off = isTaken || past || busy;
                    const on = when?.getTime() === s.getTime();
                    return (
                      <TouchableOpacity
                        key={s.toISOString()}
                        disabled={off}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: off, selected: on }}
                        onPress={() => {
                          setWhen(s);
                          setLocalError(null);
                        }}
                        style={[styles.slot, off && styles.slotOff, on && styles.slotOn]}
                      >
                        <Text style={[styles.slotText, off && styles.slotTextOff, on && styles.slotTextOn]}>
                          {fmtTime(s.toISOString())}
                        </Text>
                        {isTaken && <Text style={styles.slotNote}>{tx('appointment.slotBooked', 'Booked')}</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* The reason — optional, carried onto the appointment. */}
                <Text style={styles.label}>{tx('followUp.reasonLabel', 'Reason (optional)')}</Text>
                <PillInput
                  icon={<Icon name="document-text" size={18} color={colors.blue} />}
                  value={reason}
                  onChangeText={setReason}
                  placeholder={tx('followUp.reasonPlaceholder', 'e.g. Review blood pressure and adjust treatment')}
                  editable={!busy}
                  maxLength={500}
                  autoCapitalize="sentences"
                  returnKeyType="done"
                  accessibilityLabel={tx('followUp.reasonLabel', 'Reason (optional)')}
                />

                {/* What will be booked, in one line — or what is still missing. */}
                <View style={[styles.summary, { backgroundColor: when ? infoSkin.bg : colors.surfaceMuted }]}>
                  <Icon name={when ? 'calendar-check' : 'clock'} size={18} color={when ? infoSkin.fg : colors.textMuted} />
                  <Text style={[styles.summaryText, { color: when ? colors.textPrimary : colors.textMuted }]}>
                    {when
                      ? tx('followUp.summary', '{{patient}} — {{date}} at {{time}}', {
                          patient: who,
                          date: fmtDateLong(when.toISOString()),
                          time: fmtTime(when.toISOString()),
                        })
                      : tx('followUp.noTime', 'Choose a day and a time')}
                  </Text>
                </View>

                {!!errorText && (
                  <View style={[styles.summary, { backgroundColor: statusMap.critical.bg }]}>
                    <Icon name="alert-circle" size={18} color={statusMap.critical.fg} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.summaryTitle, { color: statusMap.critical.fg }]}>
                        {tx('followUp.failedTitle', 'The follow-up was not booked')}
                      </Text>
                      <Text style={[styles.summaryText, { color: colors.textPrimary }]}>{errorText}</Text>
                    </View>
                  </View>
                )}
              </ScrollView>

              <View style={styles.actions}>
                <CareButton
                  label={tx('followUp.confirm', 'Book follow-up')}
                  icon="calendar-plus"
                  loading={busy}
                  disabled={!when}
                  onPress={() => void submit()}
                />
                <CareButton
                  label={String(t('opesCore.common.cancel', { defaultValue: 'Cancel' }))}
                  variant="secondary"
                  disabled={busy}
                  onPress={onClose}
                />
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(14,23,41,0.45)' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      maxHeight: '92%',
    },
    grab: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: spacing.sm,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    mark: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    headText: { flex: 1, minWidth: 0 },
    title: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.md,
      color: colors.textPrimary,
    },
    subtitle: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
      marginTop: 1,
    },
    scroll: { flexGrow: 0 },
    body: { paddingBottom: spacing.sm, gap: spacing.xs },
    message: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    reasonEcho: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
    label: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginTop: spacing.sm,
    },
    hint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
    },
    hintWarn: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.statusWarning,
    },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    chip: {
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    chipText: { fontFamily: typography.fontFamily.medium, fontSize: typography.size.xs, color: colors.link },
    chipTextOn: { color: colors.textOnBrand },

    dayStrip: { gap: spacing.xs, paddingVertical: spacing.xs },
    day: {
      width: 52,
      paddingVertical: spacing.xs + 2,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    dayOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    dayName: { fontFamily: typography.fontFamily.medium, fontSize: 11, letterSpacing: 0.4, color: colors.textMuted },
    dayNum: { fontFamily: typography.fontFamily.bold, fontSize: typography.size.md, color: colors.textPrimary },
    dayMonth: { fontFamily: typography.fontFamily.regular, fontSize: 10, color: colors.textMuted },
    dayTextOn: { color: colors.textOnBrand },

    slots: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
    slot: {
      minWidth: 84,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm + 2,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    slotOff: { backgroundColor: colors.divider, borderColor: colors.divider },
    slotOn: { backgroundColor: colors.blue, borderColor: colors.blue },
    slotText: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm, color: colors.link },
    slotTextOff: { color: colors.textMuted },
    slotTextOn: { color: colors.textOnBrand },
    slotNote: { fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.textMuted },

    summary: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.sm + 2,
      borderRadius: radii.md,
      marginTop: spacing.sm,
    },
    summaryTitle: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.sm },
    summaryText: {
      flex: 1,
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
    },

    actions: { gap: spacing.sm, marginTop: spacing.sm },
  });
