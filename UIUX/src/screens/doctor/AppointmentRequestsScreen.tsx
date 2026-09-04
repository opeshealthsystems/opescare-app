/**
 * DOC — Appointment Requests.
 *
 * Incoming appointments that are still waiting on the clinician. The staff API
 * has no separate "request" object: a booking lands as an appointment with
 * status `scheduled`, and the clinician's decision is what moves it on. So:
 *
 *   Accept  → PATCH /appointments/{id}/status  {status: 'confirmed'}
 *   Decline → POST  /appointments/{id}/cancel  {cancel_reason}
 *   Another time → PUT /appointments/{id} (the reschedule screen)
 *
 * There is deliberately no "propose a time and wait for the patient" here: the
 * API has no proposal object and no way to ask the patient to approve, so the
 * copy says what the button really does — it moves the appointment.
 */
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  cancelAppointment,
  fetchSchedule,
  setAppointmentStatus,
  type StaffAppointment,
} from '../../api/doctorScheduling';
import { Card, EmptyState, ScreenHeader, useDialog } from '../../components';
import { writeFailureMessage } from '../../lib/errors';
import { useTranslation } from '../../i18n';
import { colors, spacing, typography } from '../../theme/theme';
import { AsyncBoundary, CareButton, NoticeBanner, fmtDateLong, fmtTime, isoDay, useAsync } from '../care/shared';
import { ScheduleRow, patientName, staffTypeLabel } from './scheduleShared';

/** How far ahead a doctor is asked to decide. */
const HORIZON_DAYS = 60;

export function AppointmentRequestsScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const dialog = useDialog();
  /** One write at a time, whichever row started it — guards the double tap. */
  const busy = useRef(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const from = useMemo(() => isoDay(new Date()), []);
  const to = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + HORIZON_DAYS);
    return isoDay(d);
  }, []);

  const load = useCallback(
    () => fetchSchedule({ from, to, status: ['scheduled'], per_page: 100 }).then((p) => p.data),
    [from, to]
  );

  const state = useAsync<StaffAppointment[]>(load, [from, to]);
  const { reload, data, setData } = state;

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  /** Replace one row in place so the list does not flash on every decision. */
  const replace = useCallback(
    (updated: StaffAppointment) => {
      if (!data) return;
      // A decided appointment is no longer a request — drop it from the list.
      setData(data.filter((a) => a.id !== updated.id));
    },
    [data, setData]
  );

  async function run(
    a: StaffAppointment,
    action: () => Promise<StaffAppointment>,
    checkHint: string
  ) {
    if (busy.current) return;
    busy.current = true;
    setPendingId(a.id);
    try {
      const updated = await action();
      replace(updated);
    } catch (e) {
      dialog.alert(
        t('doctor.appointment.writeFailedTitle'),
        writeFailureMessage(e, checkHint),
        'critical'
      );
      // The decision may or may not have landed — re-read the list from the
      // server rather than leave a guess about it on screen.
      reload();
    } finally {
      busy.current = false;
      setPendingId(null);
    }
  }

  function accept(a: StaffAppointment) {
    void run(
      a,
      () => setAppointmentStatus(a.id, 'confirmed'),
      t('doctor.requests.checkBeforeAccept')
    );
  }

  function decline(a: StaffAppointment) {
    dialog.confirm({
      title: t('doctor.requests.declineTitle'),
      message: t('doctor.requests.declineMessage', {
        patient: patientName(a),
        type: staffTypeLabel(a.appointment_type),
        date: fmtDateLong(a.scheduled_at),
        time: fmtTime(a.scheduled_at),
      }),
      confirmLabel: t('doctor.requests.declineConfirm'),
      destructive: true,
      onConfirm: () =>
        run(
          a,
          () => cancelAppointment(a.id, t('doctor.requests.declinedByClinician')),
          t('doctor.requests.checkBeforeDecline')
        ),
    });
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('doctor.requests.title')} subtitle={t('doctor.requests.subtitle')} />

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
          loadingLabel={t('doctor.requests.loading')}
          isEmpty={(rows) => rows.length === 0}
          empty={
            <EmptyState
              icon="check-circle"
              tint="green"
              title={t('doctor.requests.emptyTitle')}
              message={t('doctor.requests.emptyBody', { days: HORIZON_DAYS })}
            />
          }
        >
          {(rows) => (
            <>
              <NoticeBanner
                icon="info"
                tone="pending"
                title={t('doctor.requests.banner', { count: rows.length })}
                message={t('doctor.requests.bannerBody')}
              />

              {rows.map((a) => (
                <Card key={a.id} variant="flush">
                  <ScheduleRow
                    appointment={a}
                    showDate
                    onPress={() => navigation.navigate('AppointmentDetail', { appointmentId: a.id })}
                  />
                  {!!a.reason && (
                    <View style={styles.reason}>
                      <Text style={styles.reasonLabel}>{t('doctor.requests.reasonGiven')}</Text>
                      <Text style={styles.reasonText}>{a.reason}</Text>
                    </View>
                  )}
                  <View style={styles.actions}>
                    <CareButton
                      label={t('doctor.requests.accept')}
                      icon="check"
                      size="sm"
                      style={styles.action}
                      loading={pendingId === a.id}
                      disabled={pendingId !== null && pendingId !== a.id}
                      onPress={() => accept(a)}
                    />
                    <CareButton
                      label={t('doctor.requests.reschedule')}
                      icon="calendar"
                      variant="secondary"
                      size="sm"
                      style={styles.action}
                      disabled={pendingId !== null}
                      onPress={() => navigation.navigate('AppointmentDetail', { appointmentId: a.id })}
                    />
                    <CareButton
                      label={t('doctor.requests.decline')}
                      icon="close"
                      variant="danger"
                      size="sm"
                      style={styles.action}
                      disabled={pendingId !== null}
                      onPress={() => decline(a)}
                    />
                  </View>
                </Card>
              ))}
            </>
          )}
        </AsyncBoundary>
      </ScrollView>
      {dialog.element}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },

  reason: {
    paddingHorizontal: spacing.md - 2,
    paddingBottom: spacing.sm,
    gap: 2,
  },
  reasonLabel: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  reasonText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.sm,
    lineHeight: typography.lineHeight.sm,
    color: colors.textSecondary,
  },

  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md - 2,
    paddingTop: 0,
  },
  action: { flex: 1 },
});
