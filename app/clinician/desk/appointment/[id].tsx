/**
 * Front desk — one row of the book (`/clinician/desk/appointment/[id]?date=`).
 *
 * The desk record plus the actions a receptionist actually takes on it. Each
 * maps to a writer that exists in the Front-desk contract
 * (`lib/api/deskQueries.ts`):
 *
 *   Confirm        `useConfirmDeskAppointment`     POST …/confirm
 *   Check in       `useCheckInDeskAppointment`     POST …/check-in  (opens the visit)
 *   No-show        `useNoShowDeskAppointment`      POST …/no-show
 *   Cancel         `useCancelDeskAppointment`      POST …/cancel { reason }  — reason required
 *   Reschedule     `useRescheduleDeskAppointment`  PUT  …           { scheduled_at }
 *   Route          `useRouteDeskAppointment`       PATCH …/route    { provider_id }
 *
 * ── THE RULES THIS SCREEN KEEPS ──────────────────────────────────────────
 *  1. THE ROW IS DERIVED, NEVER FETCHED ALONE. The contract has no single-item
 *     GET, so `useDeskAppointment` reads the day list the row was opened from
 *     (`?date=`) and the server's answer to any write made here.
 *  2. EVERY ACTION IS CONFIRMED in a kit `Dialog` naming the patient, the
 *     type, the date and the time. Check-in says plainly what it does: it
 *     opens a visit at this facility under the receptionist's name.
 *  3. NEVER CLAIM A SUCCESS WE CANNOT SEE. A failed write is reported by what
 *     it was — a state conflict (409: the row moved on, re-read), a refusal on
 *     its merits (422), a role refusal (403), a server that does not serve the
 *     desk (404/405) — and the row is re-read rather than repainted from a guess.
 *  4. THE ACTIONS ARE GATED AS THE WRITERS GATE THEM (`deskAbilities`): a
 *     closed row offers none and says why; a row with the clinician offers
 *     none and says so.
 *  5. The reschedule grid marks only times ACTUALLY booked in this facility's
 *     book for the chosen day (a real read); nothing else is claimed free.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RoleGate } from '@/components/doctor/RoleGate';
import {
  Card,
  EmptyState,
  Icon,
  PillInput,
  ScreenHeader,
  SectionHeader,
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
  ProviderAvatar,
  describeFailure,
  fmtDateLong,
  fmtTime,
  type Translate,
} from '@/components/care/shared';
import { typeLabelOf } from '@/components/care/apptLabels';
import {
  deskAbilities,
  deskDayOf,
  deskErrorMessage,
  deskStatusFamily,
  isDeskRecordNotFound,
  isNotServed,
  isRoleForbidden,
  isStateConflict,
  isValidationFailure,
  useCancelDeskAppointment,
  useCheckInDeskAppointment,
  useConfirmDeskAppointment,
  useDeskAppointment,
  useDeskAppointments,
  useDeskProviders,
  useNoShowDeskAppointment,
  useRescheduleDeskAppointment,
  useRouteDeskAppointment,
  type DeskAppointment,
  type DeskProvider,
} from '@/lib/api/deskQueries';
import {
  DeskFailureState,
  DeskStatusBadge,
  FactRow,
  FieldLabel,
  UnassignedBadge,
  patientShortName,
  providerLabel,
} from '@/components/desk/shared';
import {
  DateField,
  SlotGrid,
  TimeField,
  composeLocal,
  timeOfIso,
} from '@/components/desk/DateTimeFields';
import { ProviderPicker } from '@/components/desk/ProviderPicker';
import { deskRoutes } from '@/components/desk/routes';

type PendingKey = 'confirm' | 'check-in' | 'no-show' | 'cancel' | 'reschedule' | 'route';
type Panel = 'none' | 'cancel' | 'reschedule' | 'route';

const REASON_MAX = 500;

export default function DeskAppointmentScreen() {
  return (
    <RoleGate need={['front_desk']}>
      <DeskAppointmentScreenBody />
    </RoleGate>
  );
}

function DeskAppointmentScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const params = useLocalSearchParams<{ id: string; date?: string }>();
  const appointmentId = typeof params.id === 'string' ? params.id : '';
  const fromDay = typeof params.date === 'string' ? params.date : null;

  const tr = useCallback<Translate>((key, p) => String(t(key, p as Record<string, unknown>)), [t]);

  const detail = useDeskAppointment(appointmentId || undefined, fromDay);
  const a = detail.appointment;
  const { refetch } = detail;

  const confirm = useConfirmDeskAppointment();
  const checkIn = useCheckInDeskAppointment();
  const noShow = useNoShowDeskAppointment();
  const cancel = useCancelDeskAppointment();
  const reschedule = useRescheduleDeskAppointment();
  const route = useRouteDeskAppointment();

  const [panel, setPanel] = useState<Panel>('none');
  const providers = useDeskProviders({ enabled: panel === 'route' });

  /** One write at a time, whichever button started it — guards the double tap. */
  const busy = useRef(false);
  const [pending, setPending] = useState<PendingKey | null>(null);

  /**
   * Runs one write and names its failure truthfully. The mutations write the
   * server's answer back and re-read the lists on success, so what lands on
   * screen is the server's row — never an optimistic repaint.
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
        if (isStateConflict(e)) {
          dialog.alert(t('desk.errors.conflictTitle'), deskErrorMessage(e, t('desk.errors.conflictBody')), 'warning');
        } else if (isRoleForbidden(e)) {
          dialog.alert(t('opesDoctor.roleGate.serverRefusedTitle'), t('opesDoctor.roleGate.serverRefusedBody'), 'warning');
        } else if (isNotServed(e)) {
          dialog.alert(t('desk.notServedTitle'), t('desk.notServedActions'), 'info');
        } else if (isDeskRecordNotFound(e)) {
          dialog.alert(t('desk.errors.goneTitle'), deskErrorMessage(e, t('desk.errors.goneBody')), 'warning');
        } else if (isValidationFailure(e)) {
          const f = describeFailure(e);
          dialog.alert(f.title, f.message, 'warning');
        } else {
          const f = describeFailure(e);
          const outcomeUnknown = f.kind === 'timeout' || f.kind === 'server' || f.kind === 'unknown';
          dialog.alert(
            t('desk.errors.writeFailedTitle'),
            outcomeUnknown
              ? tr('opesCore.errors.unknownOutcome', { message: f.message, checkHint: t('desk.errors.checkHint') })
              : f.message,
            'critical',
          );
        }
        // The write may or may not have landed — re-read rather than guess.
        void refetch();
        return false;
      } finally {
        busy.current = false;
        setPending(null);
      }
    },
    [dialog, refetch, t, tr],
  );

  /** The four facts every confirmation sheet names. */
  const describe = (row: DeskAppointment) => ({
    patient: patientShortName(t, row.patient),
    type: typeLabelOf(t, row.appointment_type),
    date: fmtDateLong(row.scheduled_at),
    time: fmtTime(row.scheduled_at),
  });

  function askToConfirm(row: DeskAppointment) {
    dialog.confirm({
      title: t('desk.appointment.confirmTitle'),
      message: t('desk.appointment.confirmMessage', describe(row)),
      confirmLabel: t('desk.appointment.confirm'),
      tone: 'info',
      onConfirm: async () => {
        await run('confirm', () => confirm.mutateAsync(row.id));
      },
    });
  }

  function askToCheckIn(row: DeskAppointment) {
    dialog.confirm({
      title: t('desk.appointment.checkInTitle'),
      message: t('desk.appointment.checkInMessage', describe(row)),
      confirmLabel: t('desk.appointment.checkIn'),
      tone: 'info',
      onConfirm: async () => {
        const ok = await run('check-in', () => checkIn.mutateAsync(row.id));
        if (ok) {
          dialog.alert(
            t('desk.appointment.checkedInTitle'),
            t('desk.appointment.checkedInBody', { patient: patientShortName(t, row.patient) }),
            'success',
          );
        }
      },
    });
  }

  function askToMarkNoShow(row: DeskAppointment) {
    dialog.confirm({
      title: t('desk.appointment.noShowTitle'),
      message: t('desk.appointment.noShowMessage', describe(row)),
      confirmLabel: t('desk.appointment.noShow'),
      destructive: true,
      onConfirm: async () => {
        await run('no-show', () => noShow.mutateAsync(row.id));
      },
    });
  }

  function askToCancel(row: DeskAppointment, reason: string) {
    dialog.confirm({
      title: t('desk.appointment.cancelTitle'),
      message: t('desk.appointment.cancelMessage', { ...describe(row), reason }),
      confirmLabel: t('desk.appointment.cancelConfirm'),
      cancelLabel: t('desk.appointment.cancelKeep'),
      destructive: true,
      onConfirm: async () => {
        const ok = await run('cancel', () => cancel.mutateAsync({ id: row.id, reason }));
        if (ok) setPanel('none');
      },
    });
  }

  function askToMove(row: DeskAppointment, when: Date) {
    const iso = when.toISOString();
    dialog.confirm({
      title: t('desk.appointment.moveTitle'),
      message: t('desk.appointment.moveMessage', {
        patient: patientShortName(t, row.patient),
        date: fmtDateLong(iso),
        time: fmtTime(iso),
      }),
      confirmLabel: t('desk.appointment.moveConfirm'),
      onConfirm: async () => {
        const ok = await run('reschedule', () => reschedule.mutateAsync({ id: row.id, when }));
        if (ok) setPanel('none');
      },
    });
  }

  function askToRoute(row: DeskAppointment, provider: DeskProvider) {
    dialog.confirm({
      title: t('desk.appointment.routeTitle'),
      message: t('desk.appointment.routeMessage', {
        patient: patientShortName(t, row.patient),
        provider: providerLabel(t, provider),
        time: fmtTime(row.scheduled_at),
      }),
      confirmLabel: t('desk.appointment.routeConfirm'),
      onConfirm: async () => {
        const ok = await run('route', () => route.mutateAsync({ id: row.id, providerId: provider.id }));
        if (ok) setPanel('none');
      },
    });
  }

  const togglePanel = (next: Panel) => setPanel((cur) => (cur === next ? 'none' : next));

  // A refresh that failed while the row is on screen must never pass as fresh
  // — the status here is what the actions are decided on.
  const stale = detail.isStale ? (
    <StaleNotice
      message={describeFailure(detail.error).message}
      loadedAt={detail.list.dataUpdatedAt ? new Date(detail.list.dataUpdatedAt) : null}
      onRetry={() => void refetch()}
      retrying={detail.isFetching}
    />
  ) : null;

  let body: React.ReactNode;
  if (!appointmentId) {
    body = (
      <EmptyState
        icon="calendar"
        tint="blue"
        title={t('desk.appointment.missingIdTitle')}
        message={t('desk.appointment.missingIdBody')}
        actionLabel={t('desk.book.title')}
        onAction={() => router.replace(deskRoutes.index)}
      />
    );
  } else if (detail.isPending) {
    body = <LoadingBlock label={t('desk.appointment.loading')} />;
  } else if (detail.isError) {
    body = (
      <DeskFailureState
        error={detail.error}
        onRetry={() => void refetch()}
        notServedMessage={t('desk.notServedAppointment')}
      />
    );
  } else if (detail.notInDay || !a) {
    body = (
      <EmptyState
        icon="calendar"
        tint="blue"
        title={t('desk.appointment.notInDayTitle')}
        message={t('desk.appointment.notInDayBody', { date: fmtDateLong(`${detail.day}T00:00:00`) })}
        actionLabel={t('desk.book.title')}
        onAction={() => router.replace(deskRoutes.index)}
      />
    );
  } else {
    const can = deskAbilities(a);
    const anyPending = pending !== null;
    body = (
      <>
        <Card>
          <View style={styles.patientRow}>
            <ProviderAvatar name={patientShortName(t, a.patient)} size={52} />
            <View style={styles.patientText}>
              <Text style={styles.patientName} numberOfLines={1}>
                {patientShortName(t, a.patient)}
              </Text>
              <Text style={styles.patientMeta} numberOfLines={1}>
                {a.patient.health_id ?? t('desk.patient.healthIdMissing')}
              </Text>
            </View>
            <DeskStatusBadge status={a.status} />
          </View>
        </Card>

        <Card>
          <FactRow icon="calendar" label={t('desk.appointment.date')} value={fmtDateLong(a.scheduled_at)} divider />
          <FactRow icon="clock" label={t('desk.appointment.time')} value={fmtTime(a.scheduled_at)} divider />
          <FactRow
            icon="clipboard"
            tint="purple"
            label={t('desk.appointment.type')}
            value={typeLabelOf(t, a.appointment_type)}
            divider
          />
          <FactRow
            icon="stethoscope"
            tint={a.provider ? 'green' : 'amber'}
            label={t('desk.appointment.provider')}
            value={providerLabel(t, a.provider)}
            divider={!!a.reason || !!a.checked_in_at}
            trailing={a.provider ? undefined : <UnassignedBadge />}
          />
          {!!a.reason && (
            <FactRow
              icon="document-text"
              label={t('desk.appointment.reason')}
              value={a.reason}
              divider={!!a.checked_in_at}
            />
          )}
          {!!a.checked_in_at && (
            <FactRow
              icon="location"
              tint="purple"
              label={t('desk.appointment.checkedInAt')}
              value={fmtTime(a.checked_in_at)}
            />
          )}
        </Card>

        {can.closed ? (
          <NoticeBanner
            icon="info"
            tone={deskStatusFamily(a.status) === 'completed' ? 'normal' : 'warning'}
            title={t('desk.appointment.closedTitle')}
            message={
              deskStatusFamily(a.status) === 'completed'
                ? t('desk.appointment.closedCompleted')
                : t('desk.appointment.closedOther')
            }
          />
        ) : can.withClinician ? (
          <NoticeBanner
            icon="stethoscope"
            tone="pending"
            title={t('desk.appointment.withClinicianTitle')}
            message={t('desk.appointment.withClinicianBody')}
          />
        ) : deskStatusFamily(a.status) === 'unknown' ? (
          <NoticeBanner
            icon="alert-circle"
            tone="warning"
            title={t('desk.appointment.unknownStatusTitle')}
            message={t('desk.appointment.unknownStatusBody', { status: a.status })}
          />
        ) : (
          <Card>
            <SectionHeader title={t('desk.appointment.actions')} variant="overline" />
            <View style={styles.actions}>
              {can.confirm && (
                <CareButton
                  label={t('desk.appointment.confirm')}
                  icon="check-circle"
                  loading={pending === 'confirm'}
                  disabled={anyPending && pending !== 'confirm'}
                  onPress={() => askToConfirm(a)}
                />
              )}
              {can.checkIn && (
                <CareButton
                  label={t('desk.appointment.checkIn')}
                  icon="location"
                  variant={can.confirm ? 'deep' : 'primary'}
                  loading={pending === 'check-in'}
                  disabled={anyPending && pending !== 'check-in'}
                  onPress={() => askToCheckIn(a)}
                />
              )}
              {can.route && (
                <CareButton
                  label={
                    panel === 'route'
                      ? t('desk.appointment.closePanel')
                      : a.provider
                        ? t('desk.appointment.reroute')
                        : t('desk.appointment.route')
                  }
                  icon="stethoscope"
                  variant="secondary"
                  disabled={anyPending}
                  onPress={() => togglePanel('route')}
                />
              )}
              {can.reschedule && (
                <CareButton
                  label={panel === 'reschedule' ? t('desk.appointment.closePanel') : t('desk.appointment.reschedule')}
                  icon="calendar"
                  variant="secondary"
                  disabled={anyPending}
                  onPress={() => togglePanel('reschedule')}
                />
              )}
              {can.noShow && (
                <CareButton
                  label={t('desk.appointment.noShow')}
                  icon="alert-circle"
                  variant="danger"
                  loading={pending === 'no-show'}
                  disabled={anyPending && pending !== 'no-show'}
                  onPress={() => askToMarkNoShow(a)}
                />
              )}
              {can.cancel && (
                <CareButton
                  label={panel === 'cancel' ? t('desk.appointment.closePanel') : t('desk.appointment.cancel')}
                  icon="close"
                  variant="danger"
                  disabled={anyPending}
                  onPress={() => togglePanel('cancel')}
                />
              )}
            </View>
          </Card>
        )}

        {panel === 'route' && can.route && (
          <RoutePanel
            appointment={a}
            providers={providers.data ?? []}
            loading={providers.isPending}
            error={providers.isError ? providers.error : undefined}
            onRetry={() => void providers.refetch()}
            busy={anyPending}
            styles={styles}
            onPick={(p) => askToRoute(a, p)}
          />
        )}

        {panel === 'reschedule' && can.reschedule && (
          <ReschedulePanel appointment={a} busy={anyPending} styles={styles} onPick={(when) => askToMove(a, when)} />
        )}

        {panel === 'cancel' && can.cancel && (
          <CancelPanel busy={anyPending} styles={styles} onSubmit={(reason) => askToCancel(a, reason)} />
        )}
      </>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader title={t('desk.appointment.title')} subtitle={t('desk.appointment.subtitle')} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={detail.isFetching && !detail.isPending}
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

// ── Panels ─────────────────────────────────────────────────────────────────

/** Pick a clinician posted here. The one already assigned is not offered again. */
function RoutePanel({
  appointment: a,
  providers,
  loading,
  error,
  onRetry,
  busy,
  styles,
  onPick,
}: {
  appointment: DeskAppointment;
  providers: readonly DeskProvider[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  busy: boolean;
  styles: ReturnType<typeof makeStyles>;
  onPick: (provider: DeskProvider) => void;
}) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<string | null>(null);
  const provider = providers.find((p) => p.id === chosen) ?? null;
  return (
    <Card>
      <SectionHeader title={t('desk.appointment.routeTo')} variant="overline" />
      <Text style={styles.hint}>{t('desk.appointment.routeHint')}</Text>
      <View style={styles.panelBody}>
        <ProviderPicker
          providers={providers}
          loading={loading}
          error={error}
          onRetry={onRetry}
          value={chosen}
          onChange={(id) => setChosen(id)}
          excludeId={a.provider?.id ?? null}
          disabled={busy}
        />
      </View>
      <CareButton
        label={t('desk.appointment.routeConfirm')}
        icon="arrow-right"
        disabled={busy || !provider}
        onPress={() => provider && onPick(provider)}
      />
    </Card>
  );
}

/**
 * Day + time for a move. The times marked "Booked" are this FACILITY'S rows
 * for the chosen day, read from the book; nothing else is presented as free.
 */
function ReschedulePanel({
  appointment: a,
  busy,
  styles,
  onPick,
}: {
  appointment: DeskAppointment;
  busy: boolean;
  styles: ReturnType<typeof makeStyles>;
  onPick: (when: Date) => void;
}) {
  const { t } = useTranslation();
  const [day, setDay] = useState<string>(() => deskDayOf(a.scheduled_at) ?? '');
  const [time, setTime] = useState<string>(() => timeOfIso(a.scheduled_at));
  const [error, setError] = useState<string | null>(null);

  // A real read of the book for the chosen day; the grid marks what is taken.
  const book = useDeskAppointments({ date: day });
  const taken = useMemo(() => {
    const set = new Set<string>();
    for (const row of book.data ?? []) {
      if (row.id === a.id) continue;
      const f = deskStatusFamily(row.status);
      if (f === 'cancelled' || f === 'no_show') continue;
      const hhmm = timeOfIso(row.scheduled_at);
      if (hhmm) set.add(hhmm);
    }
    return set;
  }, [book.data, a.id]);

  const submit = () => {
    const when = composeLocal(day, time);
    if (!when) {
      setError(t('desk.book.dateTimeInvalid'));
      return;
    }
    if (when.getTime() < Date.now()) {
      setError(t('desk.book.timePast'));
      return;
    }
    setError(null);
    onPick(when);
  };

  return (
    <Card>
      <SectionHeader title={t('desk.appointment.moveTo')} variant="overline" />
      <Text style={styles.hint}>{t('desk.appointment.moveHint')}</Text>
      <View style={styles.panelBody}>
        <DateField label={t('desk.book.dateLabel')} value={day} onChange={setDay} />
        <TimeField label={t('desk.book.timeLabel')} value={time} onChange={setTime} error={error} />
        <FieldLabel text={t('desk.slots.title')} />
        <SlotGrid
          day={day}
          value={time}
          onPick={setTime}
          taken={book.data ? taken : undefined}
          disabled={busy}
        />
        {book.isError && <Text style={styles.hint}>{t('desk.appointment.bookReadFailed')}</Text>}
      </View>
      <CareButton
        label={t('desk.appointment.moveConfirm')}
        icon="calendar"
        disabled={busy || !day || !time}
        onPress={submit}
      />
    </Card>
  );
}

/** The cancellation reason — required by the contract, so the button waits for it. */
function CancelPanel({
  busy,
  styles,
  onSubmit,
}: {
  busy: boolean;
  styles: ReturnType<typeof makeStyles>;
  onSubmit: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError(t('desk.appointment.cancelReasonRequired'));
      return;
    }
    setError(null);
    onSubmit(trimmed);
  };

  return (
    <Card>
      <SectionHeader title={t('desk.appointment.cancelReasonTitle')} variant="overline" />
      <Text style={styles.hint}>{t('desk.appointment.cancelReasonHint')}</Text>
      <View style={styles.panelBody}>
        <PillInput
          icon={<Icon name="document-text" size={18} color={colors.blue} />}
          value={reason}
          onChangeText={(v) => {
            setReason(v);
            if (error) setError(null);
          }}
          placeholder={t('desk.appointment.cancelReasonPlaceholder')}
          multiline
          maxLength={REASON_MAX}
          error={error ?? undefined}
          accessibilityLabel={t('desk.appointment.cancelReasonTitle')}
          style={styles.multiline}
        />
      </View>
      <CareButton
        label={t('desk.appointment.cancelConfirm')}
        icon="close"
        variant="dangerSolid"
        disabled={busy || !reason.trim()}
        onPress={submit}
      />
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
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.xs,
      letterSpacing: 0.4,
      color: colors.textMuted,
    },

    actions: { gap: spacing.sm, marginTop: spacing.sm },
    panelBody: { marginTop: spacing.sm, marginBottom: spacing.sm, gap: spacing.xs },
    hint: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      lineHeight: typography.lineHeight.xs,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
    multiline: { minHeight: 72, textAlignVertical: 'top' },
  });
