/**
 * Doctor — Appointment Requests (`/(doctor)/requests`).
 *
 * Port of `UIUX/src/screens/doctor/AppointmentRequestsScreen.tsx` onto
 * expo-router, the OPES UI kit and this app's doctor foundation.
 *
 * A "request" is not a separate API object: a booking lands as an appointment
 * with status `scheduled`, and the clinician's decision is what moves it on.
 *   Accept     → status `confirmed`
 *   Decline    → cancel, reason "declined by the clinician"
 *   Reschedule → the appointment record, which moves it outright. Nothing
 *                here proposes a time and waits for the patient — the API has
 *                no proposal object, so the copy never claims one.
 *
 * Both decisions are confirmed in a sheet that names the patient, the visit
 * type, the date and the time — an accidental tap cannot decide an
 * appointment. A failed decision is reported in a Dialog and the list is
 * re-read from the server; the app never paints a decision it did not see
 * the server make.
 *
 * Backend gap: the finder does not serve `/mobile/doctor/*` yet. A 404 (or any
 * failure with nothing on screen) renders an honest EmptyState with a retry.
 *
 * i18n: `opesDoctor.*` is being migrated into the app locales. Every string
 * carries a `defaultValue` so the screen reads correctly before the keys land
 * and picks the catalogue up the moment they do. Locale files are not edited
 * here.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  Card,
  EmptyState,
  ScreenHeader,
  StaleNotice,
  spacing,
  typography,
  useDialog,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import {
  CareButton,
  LoadingBlock,
  NoticeBanner,
  describeFailure,
  fmtDateLong,
  fmtTime,
  type Translate,
} from '@/components/care/shared';
// ── Doctor foundation (owned by the foundation agent) ─────────────────────
import {
  useAcceptAppointmentRequest,
  useAppointmentRequests,
  useDeclineAppointmentRequest,
  type StaffAppointment,
} from '@/lib/api/doctorQueries';
import { ScheduleRow, patientName, staffTypeLabel } from '@/components/doctor/scheduleShared';
import { doctorRoutes } from '@/components/doctor/chartRoutes';

/** How far ahead a doctor is asked to decide — the OPES screen's horizon. */
const HORIZON_DAYS = 60;

/** 404 / 501: this server does not serve the clinician surface yet. */
function isNotServed(e: unknown): boolean {
  const status = axios.isAxiosError(e) ? e.response?.status : undefined;
  return status === 404 || status === 501;
}

/**
 * Failure copy for a write. When the request left the phone but no answer
 * came back, the app genuinely does not know whether the decision landed —
 * and says so, with where to check.
 */
function writeFailureMessage(t: Translate, e: unknown, checkHint: string): string {
  const f = describeFailure(e);
  const outcomeUnknown = f.kind === 'timeout' || f.kind === 'server' || f.kind === 'unknown';
  return outcomeUnknown
    ? t('opesCore.errors.unknownOutcome', { message: f.message, checkHint })
    : f.message;
}

export default function AppointmentRequestsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  /** `opesDoctor.<key>` with a readable default until the catalogue lands. */
  const tx = useCallback(
    (key: string, defaultValue: string, params?: Record<string, unknown>) =>
      String(t(`opesDoctor.${key}`, { defaultValue, ...params })),
    [t]
  );
  const tr = useCallback<Translate>(
    (key, params) => String(t(key, params as Record<string, unknown>)),
    [t]
  );

  const requests = useAppointmentRequests();
  const accept = useAcceptAppointmentRequest();
  const decline = useDeclineAppointmentRequest();
  const { refetch } = requests;

  /** One write at a time, whichever row started it — guards the double tap. */
  const busy = useRef(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Coming back from the appointment record (a reschedule, a cancel) must not
  // leave a decided row sitting in the list. The first focus is the mount
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

  // `useAppointmentRequests` answers the contract's paginated envelope
  // (`DoctorPage<T>` = { data, meta.pagination }), not a bare array — the rows
  // are one level in. `?? []` covers the first render and a failed read, so
  // the list below renders an EmptyState rather than throwing on undefined.
  const rows: StaffAppointment[] = requests.data?.data ?? [];

  const describe = (a: StaffAppointment) => ({
    patient: patientName(a),
    type: staffTypeLabel(a.appointment_type),
    date: fmtDateLong(a.scheduled_at),
    time: fmtTime(a.scheduled_at),
  });

  async function run(a: StaffAppointment, action: () => Promise<unknown>, checkHint: string) {
    if (busy.current) return;
    busy.current = true;
    setPendingId(a.id);
    try {
      await action();
      // A decided appointment is no longer a request. Re-read rather than
      // drop the row on the strength of a resolved promise alone.
      await refetch();
    } catch (e) {
      dialog.alert(
        tx('appointment.writeFailedTitle', "We couldn't complete that"),
        writeFailureMessage(tr, e, checkHint),
        'critical'
      );
      // The decision may or may not have landed — re-read the list from the
      // server rather than leave a guess about it on screen.
      void refetch();
    } finally {
      busy.current = false;
      setPendingId(null);
    }
  }

  function askToAccept(a: StaffAppointment) {
    dialog.confirm({
      title: tx('requests.acceptTitle', 'Accept this appointment?'),
      message: tx(
        'requests.acceptMessage',
        '{{patient}} — {{type}} on {{date}} at {{time}}. Accepting confirms the appointment for the patient.',
        describe(a)
      ),
      confirmLabel: tx('requests.accept', 'Accept'),
      tone: 'info',
      onConfirm: () =>
        run(
          a,
          // The accept mutation takes the id itself; only decline carries a reason.
          () => accept.mutateAsync(a.id),
          tx(
            'requests.checkBeforeAccept',
            "Check this appointment's status on your schedule before accepting it again."
          )
        ),
    });
  }

  function askToDecline(a: StaffAppointment) {
    dialog.confirm({
      title: tx('requests.declineTitle', 'Decline this appointment?'),
      message: tx(
        'requests.declineMessage',
        '{{patient}} — {{type}} on {{date}} at {{time}}. Declining cancels the appointment for the patient. This cannot be undone from here.',
        describe(a)
      ),
      confirmLabel: tx('requests.declineConfirm', 'Decline & Cancel'),
      destructive: true,
      onConfirm: () =>
        run(
          a,
          () =>
            decline.mutateAsync({
              id: a.id,
              reason: tx('requests.declinedByClinician', 'Declined by the clinician'),
            }),
          tx(
            'requests.checkBeforeDecline',
            "Check this appointment's status on your schedule before declining it again."
          )
        ),
    });
  }

  const openAppointment = (a: StaffAppointment) => router.push(doctorRoutes.appointment(a.id));

  // A refresh that failed while rows are on screen must never pass as fresh.
  const stale =
    requests.isError && requests.data !== undefined ? (
      <StaleNotice
        message={describeFailure(requests.error).message}
        loadedAt={requests.dataUpdatedAt ? new Date(requests.dataUpdatedAt) : null}
        onRetry={() => void refetch()}
        retrying={requests.isFetching}
      />
    ) : null;

  let body: React.ReactNode;
  if (requests.isPending) {
    body = <LoadingBlock label={tx('requests.loading', 'Loading requests…')} />;
  } else if (requests.isError && requests.data === undefined) {
    const notServed = isNotServed(requests.error);
    body = (
      <EmptyState
        icon={notServed ? 'clipboard' : 'alert-circle'}
        tint={notServed ? 'blue' : 'red'}
        title={
          notServed
            ? tx('shared.notServedTitle', 'Not available on this server yet')
            : tr('opesCore.errors.unknownTitle')
        }
        message={
          notServed
            ? tx(
                'shared.notServedRequests',
                'Appointment requests will appear here once the clinician service is enabled for this app.'
              )
            : describeFailure(requests.error).message
        }
        actionLabel={tr('opesCore.common.retry')}
        onAction={() => void refetch()}
      />
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon="check-circle"
        tint="green"
        title={tx('requests.emptyTitle', 'Nothing waiting on you')}
        message={tx(
          'requests.emptyBody',
          'No appointment in the next {{days}} days is still awaiting your decision.',
          { days: HORIZON_DAYS }
        )}
      />
    );
  } else {
    body = (
      <>
        <NoticeBanner
          icon="info"
          tone="pending"
          title={tx(
            'requests.banner',
            rows.length === 1 ? '1 request' : '{{count}} requests',
            { count: rows.length }
          )}
          message={tx(
            'requests.bannerBody',
            'Accepting confirms the appointment for the patient. Declining cancels it. Rescheduling opens the record and moves the appointment outright — the API has no way to propose a time and wait for the patient to agree.'
          )}
        />

        {rows.map((a) => (
          <Card key={a.id} variant="flush">
            <ScheduleRow appointment={a} showDate onPress={() => openAppointment(a)} />
            {!!a.reason && (
              <View style={styles.reason}>
                <Text style={styles.reasonLabel}>{tx('requests.reasonGiven', 'Reason given')}</Text>
                <Text style={styles.reasonText}>{a.reason}</Text>
              </View>
            )}
            <View style={styles.actions}>
              <CareButton
                label={tx('requests.accept', 'Accept')}
                icon="check"
                size="sm"
                style={styles.action}
                loading={pendingId === a.id}
                disabled={pendingId !== null && pendingId !== a.id}
                onPress={() => askToAccept(a)}
              />
              <CareButton
                label={tx('requests.reschedule', 'Reschedule')}
                icon="calendar"
                variant="secondary"
                size="sm"
                style={styles.action}
                disabled={pendingId !== null}
                onPress={() => openAppointment(a)}
              />
              <CareButton
                label={tx('requests.decline', 'Decline')}
                icon="close"
                variant="danger"
                size="sm"
                style={styles.action}
                disabled={pendingId !== null}
                onPress={() => askToDecline(a)}
              />
            </View>
          </Card>
        ))}
      </>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={tx('requests.title', 'Appointment Requests')}
        subtitle={tx('requests.subtitle', 'Bookings waiting on your decision')}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={requests.isFetching && !requests.isPending}
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

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
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
