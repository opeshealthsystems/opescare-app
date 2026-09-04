/**
 * Doctor — Appointment record (`/clinician/appointments/[id]`).
 *
 * Port of `UIUX/src/screens/doctor/DoctorAppointmentDetailScreen.tsx` onto
 * expo-router, the OPES UI kit and this app's doctor foundation.
 *
 * The full visit record plus the actions a clinician actually takes on it.
 * Every action maps to a mutation that exists in `lib/api/doctorQueries.ts`:
 *
 *   Check in          `useCheckInAppointment`        scheduled|confirmed → arrived
 *   Start / Complete  `useSetAppointmentStatus`      → in_progress / completed
 *   No-show           `useMarkNoShow`
 *   Cancel            `useCancelDoctorAppointment`
 *   Reschedule        `useRescheduleDoctorAppointment`  moves it outright
 *
 * ── THE RULES THIS SCREEN KEEPS ──────────────────────────────────────────
 *  1. EVERY ACTION IS CONFIRMED. Each one opens a kit `Dialog` naming the
 *     patient, the visit type, the date and the time, so a mis-tap between
 *     consultations cannot close, cancel or move somebody's appointment.
 *  2. NEVER CLAIM A SUCCESS WE CANNOT SEE. A failed write is reported in a
 *     Dialog that says plainly when the outcome is unknown and where to check,
 *     and the record is re-read from the server rather than repainted from a
 *     guess.
 *  3. NEVER PRESENT STALE DATA AS CURRENT. A refresh that failed over a record
 *     already on screen renders the kit's `StaleNotice` above it.
 *  4. NEVER CLAIM AVAILABILITY WE DO NOT HAVE. There is no staff slot
 *     endpoint, so the reschedule grid marks only the times already taken in
 *     THIS clinician's own diary (real data, read from the schedule endpoint)
 *     and says so; nothing else is presented as free.
 *  5. Telemedicine shows a notice, not a "Start Video Visit" button: the
 *     session endpoints are patient-portal only, so a button here would do
 *     nothing.
 *
 * Backend gap: the finder does not serve `/mobile/doctor/*` yet, so these
 * hooks 404 today. A 404 (or any failure with nothing on screen) renders an
 * honest EmptyState with a retry; nothing spins forever.
 *
 * i18n: `opesDoctor.*` is being migrated into the app locales. Every string
 * carries a `defaultValue` until the keys land. Locale files are not edited
 * here.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  Card,
  EmptyState,
  ScreenHeader,
  SectionHeader,
  StaleNotice,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import {
  CareButton,
  InfoRow,
  LoadingBlock,
  NoticeBanner,
  ProviderAvatar,
  StatusPill,
  SummaryLine,
  describeFailure,
  fmtDateLong,
  fmtDuration,
  fmtTime,
  isoDay,
  type Translate,
} from '@/components/care/shared';
// ── Doctor foundation (owned by the foundation agent) ─────────────────────
import {
  useCancelDoctorAppointment,
  useCheckInAppointment,
  useDoctorAppointment,
  useDoctorSchedule,
  useMarkNoShow,
  useRescheduleDoctorAppointment,
  useSetAppointmentStatus,
  type StaffAppointment,
} from '@/lib/api/doctorQueries';
import {
  isTelemedicine,
  patientLine,
  patientName,
  staffTypeLabel,
} from '@/components/doctor/scheduleShared';
import { priorityLabel } from '@/components/doctor/chartShared';
import { doctorRoutes } from '@/components/doctor/chartRoutes';

/** Clinic day presented by the reschedule grid, in 30-minute steps. */
const GRID_START_HOUR = 8;
const GRID_END_HOUR = 18;
const GRID_STEP_MIN = 30;
const RESCHEDULE_WINDOW_DAYS = 21;

/** Only a fallback for `opesDoctor.weekday.*`; the catalogue is the source. */
const DEFAULT_WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Which key on the action block is mid-flight. One write at a time. */
type PendingKey = 'check-in' | 'start' | 'complete' | 'no-show' | 'cancel' | 'reschedule';

type Tx = (key: string, defaultValue: string, params?: Record<string, unknown>) => string;

/** 404 / 501: this server does not serve the clinician surface yet. */
function isNotServed(e: unknown): boolean {
  const status = axios.isAxiosError(e) ? e.response?.status : undefined;
  return status === 404 || status === 501;
}

/**
 * Failure copy for a write. When the request left the phone but no answer came
 * back, the app genuinely does not know whether it landed — and says so, with
 * where to check.
 */
function writeFailureMessage(t: Translate, e: unknown, checkHint: string): string {
  const f = describeFailure(e);
  const outcomeUnknown = f.kind === 'timeout' || f.kind === 'server' || f.kind === 'unknown';
  return outcomeUnknown
    ? t('opesCore.errors.unknownOutcome', { message: f.message, checkHint })
    : f.message;
}

/** The three statuses the writer refuses outright (409) — a closed record. */
function canEdit(a: StaffAppointment): boolean {
  return !['cancelled', 'completed', 'no_show'].includes(a.status);
}

export default function DoctorAppointmentDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const { id } = useLocalSearchParams<{ id: string }>();
  const appointmentId = typeof id === 'string' ? id : '';

  /** `opesDoctor.<key>` with a readable default until the catalogue lands. */
  const tx = useCallback<Tx>(
    (key, defaultValue, params) => String(t(`opesDoctor.${key}`, { defaultValue, ...params })),
    [t]
  );
  const tr = useCallback<Translate>(
    (key, params) => String(t(key, params as Record<string, unknown>)),
    [t]
  );

  const appointment = useDoctorAppointment(appointmentId || undefined);
  const { refetch } = appointment;

  const checkIn = useCheckInAppointment();
  const setStatus = useSetAppointmentStatus();
  const noShow = useMarkNoShow();
  const cancel = useCancelDoctorAppointment();
  const reschedule = useRescheduleDoctorAppointment();

  /** One write at a time, whichever button started it — guards the double tap. */
  const busy = useRef(false);
  const [pending, setPending] = useState<PendingKey | null>(null);
  const [rescheduling, setRescheduling] = useState(false);

  const checkHint = tx(
    'appointment.checkHint',
    'Reopen this appointment to see its current status before trying again.'
  );

  /**
   * Runs one write. The mutations invalidate the appointment, the schedule and
   * the requests list on success, so what lands on screen afterwards is the
   * server's answer — never an optimistic repaint. On failure the honest copy
   * goes up and the record is re-read.
   */
  const run = useCallback(
    async (key: PendingKey, action: () => Promise<unknown>): Promise<boolean> => {
      if (busy.current) return false;
      busy.current = true;
      setPending(key);
      try {
        await action();
        return true;
      } catch (e) {
        dialog.alert(
          tx('appointment.writeFailedTitle', "We couldn't complete that"),
          writeFailureMessage(tr, e, checkHint),
          'critical'
        );
        // The write may or may not have landed — re-read rather than leave a
        // guess about it on screen.
        void refetch();
        return false;
      } finally {
        busy.current = false;
        setPending(null);
      }
    },
    [checkHint, dialog, refetch, tr, tx]
  );

  /** The four facts every confirmation sheet names. */
  const describe = (a: StaffAppointment) => ({
    patient: patientName(a),
    type: staffTypeLabel(a.appointment_type),
    date: fmtDateLong(a.scheduled_at),
    time: fmtTime(a.scheduled_at),
  });

  function askToCheckIn(a: StaffAppointment) {
    dialog.confirm({
      title: tx('appointment.checkInTitle', 'Check this patient in?'),
      message: tx(
        'appointment.checkInMessage',
        '{{patient}} — {{type}} on {{date}} at {{time}}. This records the patient as arrived and waiting to be seen.',
        describe(a)
      ),
      confirmLabel: tx('appointment.checkIn', 'Check In Patient'),
      tone: 'info',
      onConfirm: async () => {
        await run('check-in', () => checkIn.mutateAsync(a.id));
      },
    });
  }

  function askToStart(a: StaffAppointment) {
    dialog.confirm({
      title: tx('appointment.startTitle', 'Start this consultation?'),
      message: tx(
        'appointment.startMessage',
        '{{patient}} — {{type}} on {{date}} at {{time}}. This marks the visit as in progress on the hospital record.',
        describe(a)
      ),
      confirmLabel: tx('appointment.start', 'Start Consultation'),
      tone: 'info',
      onConfirm: async () => {
        await run('start', () => setStatus.mutateAsync({ id: a.id, status: 'in_progress' }));
      },
    });
  }

  function askToComplete(a: StaffAppointment) {
    dialog.confirm({
      title: tx('appointment.completeTitle', 'Mark this visit completed?'),
      message: tx(
        'appointment.completeMessage',
        '{{patient}} — {{type}} on {{date}} at {{time}}. This closes the appointment; nothing further can be changed here afterwards.',
        describe(a)
      ),
      confirmLabel: tx('appointment.complete', 'Mark Completed'),
      onConfirm: async () => {
        await run('complete', () => setStatus.mutateAsync({ id: a.id, status: 'completed' }));
      },
    });
  }

  function askToMarkNoShow(a: StaffAppointment) {
    dialog.confirm({
      title: tx('appointment.noShowTitle', 'Mark as no-show?'),
      message: tx(
        'appointment.noShowMessage',
        '{{patient}} — {{type}} on {{date}} at {{time}}. This closes the appointment and records that the patient did not attend.',
        describe(a)
      ),
      confirmLabel: tx('appointment.noShowConfirm', 'Mark No-Show'),
      destructive: true,
      onConfirm: async () => {
        await run('no-show', () => noShow.mutateAsync(a.id));
      },
    });
  }

  function askToCancel(a: StaffAppointment) {
    dialog.confirm({
      title: tx('appointment.cancelTitle', 'Cancel this appointment?'),
      message: tx(
        'appointment.cancelMessage',
        '{{patient}} — {{type}} on {{date}} at {{time}}. The appointment is cancelled for the patient and cannot be reinstated from here.',
        describe(a)
      ),
      confirmLabel: tx('appointment.cancelConfirm', 'Cancel Appointment'),
      cancelLabel: tx('appointment.cancelKeep', 'Keep It'),
      destructive: true,
      onConfirm: async () => {
        await run('cancel', () =>
          cancel.mutateAsync({
            id: a.id,
            reason: tx('appointment.cancelledByClinician', 'Cancelled by the clinician'),
          })
        );
      },
    });
  }

  function askToMove(a: StaffAppointment, when: Date) {
    const iso = when.toISOString();
    dialog.confirm({
      title: tx('appointment.moveTitle', 'Move this appointment?'),
      message: tx(
        'appointment.moveMessage',
        '{{patient}} moves to {{date}} at {{time}}. The change takes effect immediately — the patient is not asked to approve it.',
        { patient: patientName(a), date: fmtDateLong(iso), time: fmtTime(iso) }
      ),
      confirmLabel: tx('appointment.moveConfirm', 'Move Appointment'),
      onConfirm: async () => {
        const moved = await run('reschedule', () =>
          reschedule.mutateAsync({
            id: a.id,
            when,
            durationMinutes: a.duration_minutes ?? undefined,
          })
        );
        // Only close the grid on a move the server actually made.
        if (moved) setRescheduling(false);
      },
    });
  }

  const a = appointment.data;

  // A refresh that failed while the record is on screen must never pass as
  // fresh — the status here is what the actions are decided on.
  const stale =
    appointment.isError && a !== undefined ? (
      <StaleNotice
        message={describeFailure(appointment.error).message}
        loadedAt={appointment.dataUpdatedAt ? new Date(appointment.dataUpdatedAt) : null}
        onRetry={() => void refetch()}
        retrying={appointment.isFetching}
      />
    ) : null;

  let body: React.ReactNode;
  if (!appointmentId) {
    // A malformed link. The query is disabled, so without this the screen
    // would sit on a loading block that never resolves.
    body = (
      <EmptyState
        icon="calendar"
        tint="blue"
        title={tx('appointment.missingIdTitle', 'No appointment to show')}
        message={tx(
          'appointment.missingIdBody',
          'This link does not name an appointment. Open it from your schedule instead.'
        )}
        actionLabel={tx('schedule.title', 'My Schedule')}
        onAction={() => router.push(doctorRoutes.schedule)}
      />
    );
  } else if (appointment.isPending) {
    body = <LoadingBlock label={tx('appointment.loading', 'Loading appointment…')} />;
  } else if (appointment.isError && a === undefined) {
    const notServed = isNotServed(appointment.error);
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
                'shared.notServedAppointment',
                "Clinician data isn't connected yet. Appointment records will open here once the clinician service is enabled for this app."
              )
            : describeFailure(appointment.error).message
        }
        actionLabel={tr('opesCore.common.retry')}
        onAction={() => void refetch()}
      />
    );
  } else if (a) {
    const telemedicine = isTelemedicine(a);
    body = (
      <>
        <Card>
          <View style={styles.patientRow}>
            <ProviderAvatar name={patientName(a)} size={52} />
            <View style={styles.patientText}>
              <Text style={styles.patientName} numberOfLines={1}>
                {patientName(a)}
              </Text>
              {!!patientLine(a) && <Text style={styles.patientMeta}>{patientLine(a)}</Text>}
            </View>
            <StatusPill status={a.status} />
          </View>

          {!!a.patient_id && (
            <View style={styles.chartRow}>
              <CareButton
                label={tx('appointment.openChart', 'Open Patient Chart')}
                icon="folder"
                variant="ghost"
                size="sm"
                onPress={() => router.push(doctorRoutes.patient(a.patient_id))}
              />
            </View>
          )}
        </Card>

        <Card>
          <InfoRow
            icon="calendar"
            label={tx('appointment.date', 'Date')}
            value={fmtDateLong(a.scheduled_at)}
            divider
          />
          <InfoRow
            icon="clock"
            label={tx('appointment.time', 'Time')}
            value={`${fmtTime(a.scheduled_at)}${
              a.duration_minutes ? ` · ${fmtDuration(a.duration_minutes)}` : ''
            }`}
            divider
          />
          <InfoRow
            icon={telemedicine ? 'video' : 'location'}
            tint={telemedicine ? 'purple' : 'blue'}
            label={
              telemedicine
                ? tx('appointment.visitMode', 'Visit mode')
                : tx('appointment.where', 'Where')
            }
            value={
              telemedicine
                ? tx('vocab.telemedicine', 'Telemedicine')
                : a.room ||
                  a.location ||
                  tx('appointment.locationNotRecorded', 'Location not recorded')
            }
          />
        </Card>

        <Card>
          <SectionHeader title={tx('appointment.visit', 'Visit')} variant="overline" />
          <SummaryLine
            label={tx('appointment.type', 'Type')}
            value={staffTypeLabel(a.appointment_type)}
          />
          <SummaryLine
            label={tx('appointment.reason', 'Reason')}
            value={a.reason || tx('vocab.notRecorded', 'Not recorded')}
          />
          <SummaryLine
            label={tx('appointment.provider', 'Provider')}
            value={a.provider_name || tx('appointment.unassigned', 'Unassigned')}
          />
          {!!a.priority && (
            <SummaryLine
              label={tx('appointment.priority', 'Priority')}
              value={priorityLabel(a.priority)}
            />
          )}
          {!!a.checked_in_at && (
            <SummaryLine
              label={tx('appointment.checkedIn', 'Checked in')}
              value={fmtTime(a.checked_in_at)}
            />
          )}
          {!!a.cancel_reason && (
            <SummaryLine
              label={tx('appointment.cancelReason', 'Cancellation reason')}
              value={a.cancel_reason}
            />
          )}
        </Card>

        {telemedicine && (
          <NoticeBanner
            icon="video"
            tone="warning"
            title={tx('appointment.telemedicineTitle', 'Telemedicine visit')}
            message={tx(
              'appointment.telemedicineBody',
              'This visit is booked as telemedicine. The video session can only be started from the desktop EMR — the mobile API has no clinician telemedicine endpoint yet.'
            )}
          />
        )}

        <ActionBlock
          appointment={a}
          pending={pending}
          rescheduling={rescheduling}
          styles={styles}
          tx={tx}
          onCheckIn={() => askToCheckIn(a)}
          onStart={() => askToStart(a)}
          onComplete={() => askToComplete(a)}
          onNoShow={() => askToMarkNoShow(a)}
          onCancel={() => askToCancel(a)}
          onToggleReschedule={() => setRescheduling((v) => !v)}
        />

        {rescheduling && canEdit(a) && (
          <RescheduleBlock
            appointment={a}
            busy={pending !== null}
            styles={styles}
            tx={tx}
            onPick={(when) => askToMove(a, when)}
          />
        )}
      </>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={tx('appointment.title', 'Appointment')}
        subtitle={tx('appointment.subtitle', 'Patient visit record')}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={appointment.isFetching && !appointment.isPending}
            onRefresh={() => void refetch()}
            tintColor={colors.blue}
          />
        }
      >
        {stale}
        {body}
      </ScrollView>
      {dialog.element}
    </SafeAreaView>
  );
}

/**
 * The actions, gated exactly as the API gates them — a button that the writer
 * would refuse is not offered. A closed record offers none at all and says
 * why.
 */
function ActionBlock({
  appointment: a,
  pending,
  rescheduling,
  styles,
  tx,
  onCheckIn,
  onStart,
  onComplete,
  onNoShow,
  onCancel,
  onToggleReschedule,
}: {
  appointment: StaffAppointment;
  pending: PendingKey | null;
  rescheduling: boolean;
  styles: ReturnType<typeof makeStyles>;
  tx: Tx;
  onCheckIn: () => void;
  onStart: () => void;
  onComplete: () => void;
  onNoShow: () => void;
  onCancel: () => void;
  onToggleReschedule: () => void;
}) {
  const anyPending = pending !== null;
  // Check-in is refused by the API for anything but these two.
  const canCheckIn = ['scheduled', 'confirmed'].includes(a.status);
  const canStart = ['arrived', 'confirmed', 'scheduled'].includes(a.status);
  const canComplete = a.status === 'in_progress' || a.status === 'arrived';

  if (!canEdit(a)) {
    return (
      <NoticeBanner
        icon="info"
        tone={a.status === 'completed' ? 'normal' : 'warning'}
        title={tx('appointment.closedTitle', 'This appointment is closed')}
        message={
          a.status === 'completed'
            ? tx(
                'appointment.closedCompleted',
                'The visit is marked completed. Nothing further can be changed here.'
              )
            : tx(
                'appointment.closedOther',
                'The appointment is cancelled or recorded as a no-show and can no longer be changed from the app.'
              )
        }
      />
    );
  }

  return (
    <Card>
      <SectionHeader title={tx('appointment.actions', 'Actions')} variant="overline" />
      <View style={styles.actions}>
        {canCheckIn && (
          <CareButton
            label={tx('appointment.checkIn', 'Check In Patient')}
            icon="check-circle"
            loading={pending === 'check-in'}
            disabled={anyPending && pending !== 'check-in'}
            onPress={onCheckIn}
          />
        )}
        {canStart && (
          <CareButton
            label={tx('appointment.start', 'Start Consultation')}
            icon="stethoscope"
            variant="deep"
            loading={pending === 'start'}
            disabled={anyPending && pending !== 'start'}
            onPress={onStart}
          />
        )}
        {canComplete && (
          <CareButton
            label={tx('appointment.complete', 'Mark Completed')}
            icon="check-double"
            variant="secondary"
            loading={pending === 'complete'}
            disabled={anyPending && pending !== 'complete'}
            onPress={onComplete}
          />
        )}
        <CareButton
          label={
            rescheduling
              ? tx('appointment.closeReschedule', 'Close Reschedule')
              : tx('appointment.reschedule', 'Reschedule')
          }
          icon="calendar"
          variant="secondary"
          disabled={anyPending}
          onPress={onToggleReschedule}
        />
        <CareButton
          label={tx('appointment.noShow', 'Mark No-Show')}
          icon="alert-circle"
          variant="danger"
          loading={pending === 'no-show'}
          disabled={anyPending && pending !== 'no-show'}
          onPress={onNoShow}
        />
        <CareButton
          label={tx('appointment.cancel', 'Cancel Appointment')}
          icon="close"
          variant="danger"
          loading={pending === 'cancel'}
          disabled={anyPending && pending !== 'cancel'}
          onPress={onCancel}
        />
      </View>
    </Card>
  );
}

/**
 * Day + time picker for a reschedule.
 *
 * The times marked "Booked" are THIS clinician's own appointments for the
 * chosen day, read from the schedule endpoint. The API exposes no clinic-wide
 * staff availability, so nothing else on this grid is presented as known —
 * and when that diary read fails, the grid says the marks are missing instead
 * of quietly showing every slot as free.
 */
function RescheduleBlock({
  appointment: a,
  busy,
  styles,
  tx,
  onPick,
}: {
  appointment: StaffAppointment;
  busy: boolean;
  styles: ReturnType<typeof makeStyles>;
  tx: Tx;
  onPick: (when: Date) => void;
}) {
  const [day, setDay] = useState<Date>(() => {
    const d = new Date(a.scheduled_at);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  });

  const days = useMemo(
    () =>
      Array.from({ length: RESCHEDULE_WINDOW_DAYS }, (_, i) => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + i);
        return d;
      }),
    []
  );

  const dayKey = isoDay(day);
  // The same paginated envelope as the schedule screen: rows are one level in.
  const diary = useDoctorSchedule({ from: dayKey, to: dayKey, per_page: 100 });
  const takenRows = (diary.data?.data ?? []).filter(
    (x) => !['cancelled', 'no_show'].includes(x.status)
  );

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

  const takenKeys = new Set(
    takenRows
      .filter((x) => x.id !== a.id)
      .map((x) => {
        const d = new Date(x.scheduled_at);
        return `${d.getHours()}:${d.getMinutes()}`;
      })
  );

  // Marks we could not read are stated, never assumed absent.
  const marksMissing = diary.isError && diary.data === undefined;

  return (
    <Card>
      <SectionHeader title={tx('appointment.moveTo', 'Move to')} variant="overline" />
      <Text style={styles.hint}>
        {tx(
          'appointment.moveHint',
          'Times already booked in your own diary for the chosen day are marked. The API publishes no clinic-wide availability, so nothing else is claimed to be free.'
        )}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
        {days.map((d) => {
          const on = isoDay(d) === dayKey;
          return (
            <TouchableOpacity
              key={isoDay(d)}
              onPress={() => setDay(d)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
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

      {marksMissing && (
        <Text style={styles.hint}>
          {tx(
            'appointment.diaryFailed',
            'Your diary for this day could not be loaded, so booked times are not marked.'
          )}
        </Text>
      )}

      <View style={styles.slots}>
        {slots.map((s) => {
          const key = `${s.getHours()}:${s.getMinutes()}`;
          const isTaken = takenKeys.has(key);
          const past = s.getTime() < Date.now();
          const off = isTaken || past || busy;
          return (
            <TouchableOpacity
              key={s.toISOString()}
              disabled={off}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ disabled: off }}
              onPress={() => onPick(s)}
              style={[styles.slot, off && styles.slotOff]}
            >
              <Text style={[styles.slotText, off && styles.slotTextOff]}>
                {fmtTime(s.toISOString())}
              </Text>
              {isTaken && <Text style={styles.slotNote}>{tx('appointment.slotBooked', 'Booked')}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </Card>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },

    patientRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
    patientText: { flex: 1, minWidth: 0, gap: 2 },
    patientName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      color: colors.textPrimary,
    },
    patientMeta: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    chartRow: { marginTop: spacing.md },

    actions: { gap: spacing.sm, marginTop: spacing.sm },

    hint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },

    dayStrip: { gap: spacing.sm, paddingVertical: spacing.sm },
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

    slots: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
    slot: {
      minWidth: 92,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radii.sm + 2,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    slotOff: { backgroundColor: colors.divider, borderColor: colors.divider },
    slotText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.link,
    },
    slotTextOff: { color: colors.textMuted },
    slotNote: {
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      color: colors.textMuted,
    },
  });
