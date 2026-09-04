/**
 * DOC — Appointment Detail (doctor view).
 *
 * The full record plus the actions a doctor actually takes on it. Every action
 * maps to an endpoint that exists on `Api\V1\AppointmentController`:
 *
 *   Check in        POST  /appointments/{id}/check-in   (scheduled|confirmed → arrived)
 *   Start / Complete PATCH /appointments/{id}/status
 *   No-show         POST  /appointments/{id}/no-show
 *   Cancel          POST  /appointments/{id}/cancel
 *   Reschedule      PUT   /appointments/{id}
 *
 * Two things the design implies and the API does not have, so they are stated
 * rather than faked:
 *  - starting a telemedicine visit — the session endpoints are patient-portal
 *    only (`/patient/appointments/{id}/telemedicine/*`), there is no clinician
 *    equivalent, so a telemedicine appointment shows a notice instead of a
 *    "Start Video Visit" button that would do nothing;
 *  - provider availability — there is no staff slot endpoint, so the
 *    reschedule grid marks the times already taken in this doctor's own diary
 *    (real data) and claims nothing about the rest of the clinic.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  cancelAppointment,
  checkInAppointment,
  fetchAppointment,
  fetchSchedule,
  markNoShow,
  rescheduleAppointment,
  setAppointmentStatus,
  type StaffAppointment,
} from '../../api/doctorScheduling';
import { Card, ScreenHeader, SectionHeader, useDialog } from '../../components';
import type { DoctorStackParamList } from '../../navigation/routes';
import { writeFailureMessage } from '../../lib/errors';
import { useTranslation } from '../../i18n';
import { colors, radii, spacing, typography } from '../../theme/theme';
import {
  AsyncBoundary,
  CareButton,
  InfoRow,
  NoticeBanner,
  ProviderAvatar,
  StatusPill,
  SummaryLine,
  fmtDateLong,
  fmtDuration,
  fmtTime,
  isoDay,
  useAsync,
} from '../care/shared';
import { ageFrom, isTelemedicine, patientLine, patientName, staffTypeLabel } from './scheduleShared';
import { priorityLabel } from './chartShared';

/** Clinic day presented by the reschedule grid, in 30-minute steps. */
const GRID_START_HOUR = 8;
const GRID_END_HOUR = 18;
const GRID_STEP_MIN = 30;
const RESCHEDULE_WINDOW_DAYS = 21;

export function DoctorAppointmentDetailScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<DoctorStackParamList, 'AppointmentDetail'>>();
  const appointmentId = params.appointmentId;

  const { t } = useTranslation();
  const dialog = useDialog();
  const busy = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);

  const load = useCallback(() => fetchAppointment(appointmentId), [appointmentId]);
  const state = useAsync<StaffAppointment>(load, [appointmentId]);
  const { reload, setData } = state;

  /**
   * Runs one write. Never claims success it cannot see: on failure the honest
   * copy goes up and the record is re-read from the server.
   */
  async function run(
    key: string,
    action: () => Promise<StaffAppointment>,
    checkHint: string
  ): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    setPending(key);
    try {
      setData(await action());
      return true;
    } catch (e) {
      dialog.alert(t('doctor.appointment.writeFailedTitle'), writeFailureMessage(e, checkHint), 'critical');
      reload();
      return false;
    } finally {
      busy.current = false;
      setPending(null);
    }
  }

  const CHECK_HINT = t('doctor.appointment.checkHint');

  function onCheckIn(a: StaffAppointment) {
    void run(
      'check-in',
      () => checkInAppointment(a.id),
      CHECK_HINT
    );
  }

  function onStatus(a: StaffAppointment, status: 'in_progress' | 'completed', key: string) {
    void run(key, () => setAppointmentStatus(a.id, status), CHECK_HINT);
  }

  function onNoShow(a: StaffAppointment) {
    dialog.confirm({
      title: t('doctor.appointment.noShowTitle'),
      message: t('doctor.appointment.noShowMessage', {
        patient: patientName(a),
        type: staffTypeLabel(a.appointment_type),
        date: fmtDateLong(a.scheduled_at),
        time: fmtTime(a.scheduled_at),
      }),
      confirmLabel: t('doctor.appointment.noShowConfirm'),
      destructive: true,
      onConfirm: async () => {
        await run('no-show', () => markNoShow(a.id), CHECK_HINT);
      },
    });
  }

  function onCancel(a: StaffAppointment) {
    dialog.confirm({
      title: t('doctor.appointment.cancelTitle'),
      message: t('doctor.appointment.cancelMessage', {
        patient: patientName(a),
        type: staffTypeLabel(a.appointment_type),
        date: fmtDateLong(a.scheduled_at),
        time: fmtTime(a.scheduled_at),
      }),
      confirmLabel: t('doctor.appointment.cancelConfirm'),
      destructive: true,
      cancelLabel: t('doctor.appointment.cancelKeep'),
      onConfirm: async () => {
        await run('cancel', () => cancelAppointment(a.id, t('doctor.appointment.cancelledByClinician')), CHECK_HINT);
      },
    });
  }

  function onReschedule(a: StaffAppointment, when: Date) {
    const iso = when.toISOString();
    dialog.confirm({
      title: t('doctor.appointment.moveTitle'),
      message: t('doctor.appointment.moveMessage', {
        patient: patientName(a),
        date: fmtDateLong(iso),
        time: fmtTime(iso),
      }),
      confirmLabel: t('doctor.appointment.moveConfirm'),
      onConfirm: async () => {
        const moved = await run(
          'reschedule',
          () => rescheduleAppointment(a.id, when, a.duration_minutes ?? undefined),
          CHECK_HINT
        );
        if (moved) setRescheduling(false);
      },
    });
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('doctor.appointment.title')} subtitle={t('doctor.appointment.subtitle')} />
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
        <AsyncBoundary state={state} onLink={() => {}} loadingLabel={t('doctor.appointment.loading')}>
          {(a) => (
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

                <View style={styles.chartRow}>
                  <CareButton
                    label={t('doctor.appointment.openChart')}
                    icon="folder"
                    variant="ghost"
                    size="sm"
                    onPress={() => navigation.navigate('PatientChart', { patientId: a.patient_id })}
                  />
                </View>
              </Card>

              <Card>
                <InfoRow
                  icon="calendar"
                  label={t('doctor.appointment.date')}
                  value={fmtDateLong(a.scheduled_at)}
                  divider
                />
                <InfoRow
                  icon="clock"
                  label={t('doctor.appointment.time')}
                  value={`${fmtTime(a.scheduled_at)}${
                    a.duration_minutes ? ` · ${fmtDuration(a.duration_minutes)}` : ''
                  }`}
                  divider
                />
                <InfoRow
                  icon={isTelemedicine(a) ? 'video' : 'location'}
                  tint={isTelemedicine(a) ? 'purple' : 'blue'}
                  label={t(isTelemedicine(a) ? 'doctor.appointment.visitMode' : 'doctor.appointment.where')}
                  value={
                    isTelemedicine(a)
                      ? t('doctor.vocab.telemedicine')
                      : a.room || a.location || t('doctor.appointment.locationNotRecorded')
                  }
                />
              </Card>

              <Card>
                <SectionHeader title={t('doctor.appointment.visit')} variant="overline" />
                <SummaryLine label={t('doctor.appointment.type')} value={staffTypeLabel(a.appointment_type)} />
                <SummaryLine label={t('doctor.appointment.reason')} value={a.reason || t('doctor.vocab.notRecorded')} />
                <SummaryLine label={t('doctor.appointment.provider')} value={a.provider_name || t('doctor.appointment.unassigned')} />
                {!!a.priority && <SummaryLine label={t('doctor.appointment.priority')} value={priorityLabel(a.priority)} />}
                {!!a.checked_in_at && (
                  <SummaryLine label={t('doctor.appointment.checkedIn')} value={fmtTime(a.checked_in_at)} />
                )}
                {!!a.cancel_reason && <SummaryLine label={t('doctor.appointment.cancelReason')} value={a.cancel_reason} />}
              </Card>

              {isTelemedicine(a) && (
                <NoticeBanner
                  icon="video"
                  tone="warning"
                  title={t('doctor.appointment.telemedicineTitle')}
                  message={t('doctor.appointment.telemedicineBody')}
                />
              )}

              <ActionBlock
                appointment={a}
                pending={pending}
                onCheckIn={() => onCheckIn(a)}
                onStart={() => onStatus(a, 'in_progress', 'start')}
                onComplete={() => onStatus(a, 'completed', 'complete')}
                onNoShow={() => onNoShow(a)}
                onCancel={() => onCancel(a)}
                onReschedule={() => setRescheduling((v) => !v)}
                rescheduling={rescheduling}
              />

              {rescheduling && canEdit(a) && (
                <RescheduleBlock appointment={a} onPick={(when) => onReschedule(a, when)} busy={pending !== null} />
              )}
            </>
          )}
        </AsyncBoundary>
      </ScrollView>
      {dialog.element}
    </View>
  );
}

/** `AppointmentController::update` rejects these three outright (409). */
function canEdit(a: StaffAppointment): boolean {
  return !['cancelled', 'completed', 'no_show'].includes(a.status);
}

function ActionBlock({
  appointment: a,
  pending,
  onCheckIn,
  onStart,
  onComplete,
  onNoShow,
  onCancel,
  onReschedule,
  rescheduling,
}: {
  appointment: StaffAppointment;
  pending: string | null;
  onCheckIn: () => void;
  onStart: () => void;
  onComplete: () => void;
  onNoShow: () => void;
  onCancel: () => void;
  onReschedule: () => void;
  rescheduling: boolean;
}) {
  const { t } = useTranslation();
  const anyPending = pending !== null;
  // check-in is refused by the API for anything but these two.
  const canCheckIn = ['scheduled', 'confirmed'].includes(a.status);
  const canStart = ['arrived', 'confirmed', 'scheduled'].includes(a.status);
  const canComplete = a.status === 'in_progress' || a.status === 'arrived';
  const closed = !canEdit(a);

  if (closed) {
    return (
      <NoticeBanner
        icon="info"
        tone={a.status === 'completed' ? 'normal' : 'warning'}
        title={t('doctor.appointment.closedTitle')}
        message={
          a.status === 'completed'
            ? t('doctor.appointment.closedCompleted')
            : t('doctor.appointment.closedOther')
        }
      />
    );
  }

  return (
    <Card>
      <SectionHeader title={t('doctor.appointment.actions')} variant="overline" />
      <View style={styles.actions}>
        {canCheckIn && (
          <CareButton
            label={t('doctor.appointment.checkIn')}
            icon="check-circle"
            loading={pending === 'check-in'}
            disabled={anyPending && pending !== 'check-in'}
            onPress={onCheckIn}
          />
        )}
        {canStart && (
          <CareButton
            label={t('doctor.appointment.start')}
            icon="stethoscope"
            variant="deep"
            loading={pending === 'start'}
            disabled={anyPending && pending !== 'start'}
            onPress={onStart}
          />
        )}
        {canComplete && (
          <CareButton
            label={t('doctor.appointment.complete')}
            icon="check-double"
            variant="secondary"
            loading={pending === 'complete'}
            disabled={anyPending && pending !== 'complete'}
            onPress={onComplete}
          />
        )}
        <CareButton
          label={t(rescheduling ? 'doctor.appointment.closeReschedule' : 'doctor.appointment.reschedule')}
          icon="calendar"
          variant="secondary"
          disabled={anyPending}
          onPress={onReschedule}
        />
        <CareButton
          label={t('doctor.appointment.noShow')}
          icon="alert-circle"
          variant="danger"
          loading={pending === 'no-show'}
          disabled={anyPending && pending !== 'no-show'}
          onPress={onNoShow}
        />
        <CareButton
          label={t('doctor.appointment.cancel')}
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
 * Day + time picker for a reschedule. The taken times are the clinician's own
 * appointments for the chosen day, read from the schedule endpoint — the API
 * exposes no staff availability, so nothing else here is presented as known.
 */
function RescheduleBlock({
  appointment: a,
  onPick,
  busy,
}: {
  appointment: StaffAppointment;
  onPick: (when: Date) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [day, setDay] = useState<Date>(() => new Date(a.scheduled_at));

  const days = Array.from({ length: RESCHEDULE_WINDOW_DAYS }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return d;
  });

  const dayKey = isoDay(day);
  const load = useCallback(
    () =>
      fetchSchedule({ from: dayKey, to: dayKey, per_page: 100 }).then((p) =>
        p.data.filter((x) => !['cancelled', 'no_show'].includes(x.status))
      ),
    [dayKey]
  );
  const taken = useAsync<StaffAppointment[]>(load, [dayKey]);

  const slots: Date[] = [];
  for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h += 1) {
    for (let m = 0; m < 60; m += GRID_STEP_MIN) {
      const d = new Date(day);
      d.setHours(h, m, 0, 0);
      slots.push(d);
    }
  }

  const takenKeys = new Set(
    (taken.data ?? [])
      .filter((x) => x.id !== a.id)
      .map((x) => {
        const d = new Date(x.scheduled_at);
        return `${d.getHours()}:${d.getMinutes()}`;
      })
  );

  return (
    <Card>
      <SectionHeader title={t('doctor.appointment.moveTo')} variant="overline" />
      <Text style={styles.hint}>{t('doctor.appointment.moveHint')}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
        {days.map((d) => {
          const on = isoDay(d) === dayKey;
          return (
            <TouchableOpacity
              key={isoDay(d)}
              onPress={() => setDay(d)}
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

      {taken.error && !taken.data && (
        <Text style={styles.hint}>{t('doctor.appointment.diaryFailed')}</Text>
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
              onPress={() => onPick(s)}
              style={[styles.slot, off && styles.slotOff]}
            >
              <Text style={[styles.slotText, off && styles.slotTextOff]}>{fmtTime(s.toISOString())}</Text>
              {isTaken && <Text style={styles.slotNote}>{t('doctor.appointment.slotBooked')}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
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
