import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
/**
 * Appointment detail — OPES CARE-003 ported onto this route.
 *
 * Layout from design reference `src/screens/care/AppointmentDetailScreen.tsx` (archived prototype, see docs/DESIGN_REFERENCE.md): state
 * banners (`NoticeBanner`), the summary card (type glyph, status pill,
 * reference, date / time / status facts), the provider card with its
 * "Message" action, an "Appointment Information" card of `InfoRow`s, the
 * cancellation record as `SummaryLine`s, pre-visit instructions, then the
 * actions.
 *
 * Presentation only. Data is unchanged: GET /mobile/appointments/{id} via
 * `useAppointmentDetail`; cancellation is the REAL destructive mutation
 * (POST …/cancel, releases the slot) behind the kit `Dialog` — `Alert.alert`
 * is a no-op on react-native-web, so the confirm has to be a real sheet;
 * messaging starts a thread on this appointment with `useStartMessageThread`.
 *
 * The payload carries no facility / provider ids and no coordinates, so there
 * is no facility or provider link and no map here — and no external maps
 * link, by design.
 *
 * **Reschedule** (POST …/reschedule) is the second real mutation on this
 * screen. It exists because the only way out of an appointment a patient
 * cannot make used to be `cancel`, which releases the slot to everyone else
 * and leaves the patient holding nothing. The server performs the move as one
 * transaction — new slot claimed, old one released, under row locks — so a
 * refusal is genuinely harmless, and the refusal body carries the appointment
 * as it still stands. `ReschedulePanel` below shows the patient exactly that:
 * on failure it names the time they still hold rather than claiming
 * "nothing changed".
 */
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Chip,
  EmptyState,
  GradientButton,
  Icon,
  ScreenHeader,
  SectionHeader,
  StatusBadge,
  fmtLastLoaded,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatTime,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  useTranslation as useKitTranslation,
  type IconName,
  type Palette,
  type TFunction,
} from '@/components/opes-ui';
import { CatalogImage } from '@/components/ui/CatalogImage';
import {
  CareButton,
  InfoRow,
  LoadingBlock,
  NoticeBanner,
  ProviderAvatar,
  SummaryLine,
} from '@/components/care/shared';
import {
  appointmentReference,
  canCancelStatus,
  isUpcomingStatus,
  relativeDayLabel,
  statusIconOf,
  statusLabelOf,
  statusTintOf,
  statusToneOf,
  typeIconOf,
  typeLabelOf,
} from '@/components/care/apptLabels';
import {
  useAppointmentDetail,
  useCancelAppointment,
  useStartMessageThread,
  type AppointmentDetail,
} from '@/lib/api/queries';
import {
  canRescheduleStatus,
  rescheduleCodeKey,
  rescheduleFailure,
  useRescheduleAppointment,
  useRescheduleOptions,
  type RescheduleSlotOption,
} from '@/lib/api/rescheduleQueries';
// The booking wizard already decided how a slot window is split into days and
// read as a clinic diary. Reusing those four helpers is what keeps the
// reschedule picker and the booking picker showing the same times the same way.
import {
  daysCoveredBySlots,
  firstSlotAfterDay,
  groupSlotsByPeriod,
  localDateKey,
  slotDurationMinutes,
  slotsOnDay,
} from '@/lib/api/bookingQueries';

const BOOK_ROUTE = '/appointments/book';
const MESSAGES_ROUTE = '/(tabs)/messages';
const MESSAGE_MAX = 2000;

/** Icons for the three parts of a clinic day, matching the booking wizard's. */
const PERIOD_ICON: Record<string, IconName> = {
  morning: 'sun',
  afternoon: 'sun',
  evening: 'moon',
};

/** "Mon 14 Sep · 09:30" — the one time format the reschedule copy uses. */
function whenLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  return `${formatDateLong(iso)} · ${formatTime(iso)}`;
}

/**
 * The catalogue's pre-visit list minus its cancellation-fee line: the Finder
 * has no fee policy to promise, and the arrive-early / bring-ID / medications
 * lines are exactly what the previous "What to expect" panel said.
 */
const PRE_VISIT: { icon: IconName; key: string }[] = [
  { icon: 'clipboard', key: 'opesCare.detail.preVisitArrive' },
  { icon: 'id-card', key: 'opesCare.detail.preVisitId' },
  { icon: 'document-text', key: 'opesCare.detail.preVisitMeds' },
];

export default function AppointmentDetailScreen() {
  usePrivateScreen();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { t: uiT } = useKitTranslation();
  const router = useRouter();
  const { colors, tintMap } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();

  const { data: appointment, isLoading, isError, isFetching, refetch, dataUpdatedAt } =
    useAppointmentDetail(id);
  const cancelMutation = useCancelAppointment();
  const startThread = useStartMessageThread();

  const [justCancelled, setJustCancelled] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeBody, setComposeBody] = useState('');
  const [messageSent, setMessageSent] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  /** Set once a move succeeds, so the banner can name both times. */
  const [justRescheduled, setJustRescheduled] = useState<{ from: string; to: string } | null>(null);

  const goBook = () => router.push(BOOK_ROUTE);
  const goMessages = () => router.push(MESSAGES_ROUTE);

  const askCancel = () => {
    if (!appointment) return;
    const appointmentId = appointment.id;
    dialog.confirm({
      title: t('appointments.detail.cancelConfirmTitle'),
      message: [
        t('appointments.detail.cancelConfirmBody'),
        '',
        `• ${t('appointments.detail.cancelConsequence1')}`,
        `• ${t('appointments.detail.cancelConsequence2')}`,
        `• ${t('appointments.detail.cancelConsequence3')}`,
      ].join('\n'),
      confirmLabel: t('appointments.detail.cancelConfirmYes'),
      cancelLabel: t('appointments.detail.cancelConfirmNo'),
      destructive: true,
      onConfirm: async () => {
        try {
          await cancelMutation.mutateAsync({ id: appointmentId });
          setJustCancelled(true);
        } catch {
          // Opening a new sheet from inside the action keeps it on screen
          // after the confirm closes — the kit Dialog's documented behaviour.
          dialog.alert(t('appointments.detail.cancelError'));
        }
      },
    });
  };

  const sendMessage = async () => {
    const body = composeBody.trim();
    if (!appointment || !body || startThread.isPending) return;
    try {
      await startThread.mutateAsync({ appointment_id: appointment.id, body });
      setComposeBody('');
      setComposeOpen(false);
      setMessageSent(true);
    } catch {
      // startThread.isError renders the inline notice below the composer.
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title={t('opesCare.detail.title')} subtitle={t('opesCare.detail.subtitle')} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={() => {
              void refetch();
            }}
            tintColor={colors.blue}
          />
        }
      >
        {isLoading ? (
          <LoadingBlock label={t('opesCare.detail.loading')} />
        ) : isError || !appointment ? (
          <Card>
            <EmptyState
              icon="alert-circle"
              tint="red"
              title={isError ? t('appointments.detail.loadError') : t('appointments.detail.notFound')}
              actionLabel={isError ? t('appointments.retry') : undefined}
              onAction={
                isError
                  ? () => {
                      void refetch();
                    }
                  : undefined
              }
            />
          </Card>
        ) : (
          <DetailBody
            appointment={appointment}
            styles={styles}
            justCancelled={justCancelled}
            composeOpen={composeOpen}
            composeBody={composeBody}
            messageSent={messageSent}
            sending={startThread.isPending}
            sendFailed={startThread.isError}
            cancelling={cancelMutation.isPending}
            loadedAt={dataUpdatedAt ? new Date(dataUpdatedAt) : null}
            onToggleCompose={() => setComposeOpen((v) => !v)}
            onChangeBody={setComposeBody}
            onSend={sendMessage}
            onOpenMessages={goMessages}
            onCancel={askCancel}
            onBook={goBook}
            rescheduleOpen={rescheduleOpen}
            justRescheduled={justRescheduled}
            onToggleReschedule={() => {
              // Re-opening the picker after a successful move clears the
              // success banner: the "moved from X to Y" line would otherwise
              // describe the previous move while the patient plans the next.
              setJustRescheduled(null);
              setRescheduleOpen((v) => !v);
            }}
            onRescheduled={(from, to) => {
              setJustRescheduled({ from, to });
              setRescheduleOpen(false);
            }}
            tintMap={tintMap}
            colors={colors}
            t={t}
            uiT={uiT}
          />
        )}
      </ScrollView>

      {dialog.element}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------

function DetailBody({
  appointment: a,
  styles,
  justCancelled,
  composeOpen,
  composeBody,
  messageSent,
  sending,
  sendFailed,
  cancelling,
  loadedAt,
  onToggleCompose,
  onChangeBody,
  onSend,
  onOpenMessages,
  onCancel,
  onBook,
  rescheduleOpen,
  justRescheduled,
  onToggleReschedule,
  onRescheduled,
  tintMap,
  colors,
  t,
  uiT,
}: {
  appointment: AppointmentDetail;
  styles: Styles;
  justCancelled: boolean;
  composeOpen: boolean;
  composeBody: string;
  messageSent: boolean;
  sending: boolean;
  sendFailed: boolean;
  cancelling: boolean;
  loadedAt: Date | null;
  onToggleCompose: () => void;
  onChangeBody: (v: string) => void;
  onSend: () => void;
  onOpenMessages: () => void;
  onCancel: () => void;
  onBook: () => void;
  rescheduleOpen: boolean;
  justRescheduled: { from: string; to: string } | null;
  onToggleReschedule: () => void;
  onRescheduled: (from: string, to: string) => void;
  tintMap: ReturnType<typeof useTheme>['tintMap'];
  colors: Palette;
  t: TFunction;
  uiT: TFunction;
}) {
  const tint = tintMap[statusTintOf(a.status)];
  const kind = typeLabelOf(t, a.appointment_type);
  const statusLabel = statusLabelOf(t, a.status);
  const relative = relativeDayLabel(t, a.scheduled_at);
  const canCancel = canCancelStatus(a.status);
  const upcoming = isUpcomingStatus(a.status);
  // A pre-check only: it decides whether to offer the button. The server
  // re-decides on the options call and again under a row lock on the write.
  const canReschedule = canRescheduleStatus(a.status);
  const canMessage = !!a.provider_name;
  // Surfaced whenever the API sends them, not only when status === 'cancelled':
  // a facility can record a cancellation reason against a row whose status has
  // since moved on, and silently dropping it would hide real information.
  const hasCancellationInfo = Boolean(a.cancellation_reason || a.cancelled_at);

  const infoRows: { icon: IconName; label: string; value: string }[] = [
    { icon: typeIconOf(a.appointment_type), label: t('appointments.detail.type'), value: kind },
    {
      icon: 'calendar',
      label: t('opesCare.detail.scheduledFor'),
      value: a.scheduled_at
        ? `${formatDateLong(a.scheduled_at)} · ${formatTime(a.scheduled_at)}`
        : t('appointments.noDate'),
    },
    ...(a.facility_name
      ? [{ icon: 'building' as IconName, label: t('appointments.detail.facility'), value: a.facility_name }]
      : []),
    ...(a.provider_name
      ? [{ icon: 'stethoscope' as IconName, label: t('appointments.detail.provider'), value: a.provider_name }]
      : []),
    {
      icon: 'clipboard',
      label: t('opesCare.appt.reasonForVisit'),
      value: a.reason || t('opesCare.appt.notSpecified'),
    },
    ...(a.checked_in_at
      ? [
          {
            icon: 'calendar-check' as IconName,
            label: t('appointments.detail.checkedInAt'),
            value: formatDateTime(a.checked_in_at, '—'),
          },
        ]
      : []),
  ];

  return (
    <>
      {/* State banners — the one for the action just performed comes first. */}
      {justRescheduled ? (
        <NoticeBanner
          icon="calendar-check"
          tone="normal"
          title={t('appointments.reschedule.successTitle')}
          message={t('appointments.reschedule.successBody', justRescheduled)}
        />
      ) : null}
      {justCancelled ? (
        <NoticeBanner icon="check-circle" tone="normal" message={t('appointments.detail.cancelSuccess')} />
      ) : a.status === 'cancelled' ? (
        <NoticeBanner
          icon="x-circle"
          tone="critical"
          title={t('opesCare.detail.cancelledTitle')}
          message={
            a.cancellation_reason
              ? t('opesCare.detail.cancelledReason', { reason: a.cancellation_reason })
              : t('opesCare.detail.cancelledNoReason')
          }
        />
      ) : null}
      {a.status === 'no_show' ? (
        <NoticeBanner
          icon="alert-circle"
          tone="warning"
          title={t('appointments.detail.noShowBanner')}
          message={
            a.no_show_at
              ? `${t('appointments.detail.noShowAt')}: ${formatDateTime(a.no_show_at, '—')}`
              : ''
          }
        />
      ) : null}
      {a.status === 'completed' ? (
        <NoticeBanner icon="check-circle" tone="normal" message={t('appointments.detail.completedBanner')} />
      ) : null}
      {a.status === 'checked_in' ? (
        <NoticeBanner icon="location" tone="pending" message={t('appointments.detail.checkedInBanner')} />
      ) : null}
      {a.status === 'rescheduled' ? (
        <NoticeBanner
          icon="refresh"
          tone="pending"
          title={t('opesCare.detail.rescheduledTitle')}
          message={t('opesCare.detail.rescheduledMessage')}
        />
      ) : null}

      {/* Summary card */}
      <Card>
        <View style={styles.summaryTop}>
          <View style={styles.summaryIcon}>
            <Icon name={typeIconOf(a.appointment_type)} size={26} color={tint.fg} />
          </View>
          <View style={styles.summaryHead}>
            <StatusBadge
              status={a.status}
              tone={statusToneOf(a.status)}
              icon={statusIconOf(a.status)}
              label={statusLabel}
              size="sm"
            />
            <Text style={styles.summaryTitle}>{kind}</Text>
            {!!relative && <Text style={styles.summaryWhen}>{relative}</Text>}
            <Text style={styles.summaryId} numberOfLines={1}>
              {t('opesCare.detail.appointmentId')}
              <Text style={styles.summaryIdValue}>{appointmentReference(a.id)}</Text>
            </Text>
          </View>
        </View>
        <View style={styles.factRow}>
          <Fact
            styles={styles}
            color={colors.blue}
            icon="calendar"
            label={t('opesCare.appt.date')}
            value={formatDate(a.scheduled_at, '—')}
          />
          <Fact
            styles={styles}
            color={colors.blue}
            icon="clock"
            label={t('opesCare.appt.time')}
            value={formatTime(a.scheduled_at, '—')}
          />
          <Fact
            styles={styles}
            color={colors.blue}
            icon={statusIconOf(a.status)}
            label={t('opesCare.appt.status')}
            value={statusLabel}
          />
        </View>
      </Card>

      {/* Provider card */}
      <Card>
        <View style={styles.providerRow}>
          <ProviderAvatar name={a.provider_name ?? t('opesCare.appt.careTeam')} size={56} />
          <View style={styles.providerBody}>
            <Text style={styles.providerName} numberOfLines={2}>
              {a.provider_name ?? t('opesCare.appt.providerTbd')}
            </Text>
            <View style={styles.providerMetaRow}>
              <CatalogImage
                uri={a.facility_logo_url}
                size={16}
                radius={4}
                fit="contain"
                fallback={<Icon name="building" size={16} color={colors.textSecondary} />}
              />
              <Text style={styles.providerMeta} numberOfLines={2}>
                {a.facility_name ?? t('opesCare.appt.facilityTbd')}
              </Text>
            </View>
          </View>
        </View>

        {canMessage ? (
          <>
            <View style={styles.circleActions}>
              <CircleAction
                styles={styles}
                color={colors.blue}
                icon="chat"
                label={t('opesCare.detail.actionMessage')}
                selected={composeOpen}
                onPress={onToggleCompose}
              />
            </View>

            {messageSent ? (
              <View style={styles.composer}>
                <NoticeBanner icon="check-circle" tone="normal" message={t('doctor.messageSent')} />
                <CareButton
                  label={t('doctor.openMessages')}
                  variant="secondary"
                  icon="chat"
                  iconRight="chevron-right"
                  onPress={onOpenMessages}
                />
              </View>
            ) : null}

            {composeOpen ? (
              <View style={styles.composer}>
                <TextInput
                  style={styles.composerInput}
                  value={composeBody}
                  onChangeText={onChangeBody}
                  placeholder={t('messages.composeMessagePlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  textAlignVertical="top"
                  maxLength={MESSAGE_MAX}
                  editable={!sending}
                  accessibilityLabel={t('opesCare.detail.actionMessage')}
                />
                <Text style={styles.composerCount}>
                  {t('messages.charCount', { used: composeBody.length, max: MESSAGE_MAX })}
                </Text>
                {sendFailed ? (
                  <NoticeBanner icon="alert-circle" tone="critical" message={t('doctor.messageError')} />
                ) : null}
                <GradientButton
                  label={sending ? t('doctor.messageSending') : t('messages.composeSend')}
                  onPress={onSend}
                  loading={sending}
                  disabled={!composeBody.trim()}
                  icon="none"
                />
              </View>
            ) : null}
          </>
        ) : null}
      </Card>

      {/* Appointment information */}
      <View>
        <SectionHeader title={t('opesCare.detail.infoHeading')} variant="overline" />
        <Card>
          {infoRows.map((row, i) => (
            <InfoRow
              key={row.label}
              icon={row.icon}
              label={row.label}
              value={row.value}
              divider={i < infoRows.length - 1}
            />
          ))}
        </Card>
      </View>

      {/* Cancellation record */}
      {hasCancellationInfo ? (
        <View>
          <SectionHeader title={t('appointments.detail.cancellationReason')} variant="overline" />
          <Card>
            <SummaryLine
              label={t('appointments.detail.cancellationReason')}
              value={a.cancellation_reason || t('appointments.detail.noReason')}
            />
            {a.cancelled_at ? (
              <>
                <View style={styles.hair} />
                <SummaryLine
                  label={t('appointments.detail.cancelledAt')}
                  value={formatDateTime(a.cancelled_at, '—')}
                />
              </>
            ) : null}
          </Card>
        </View>
      ) : null}

      {/* Pre-visit instructions — only meaningful while the visit is still ahead */}
      {upcoming ? (
        <View>
          <SectionHeader title={t('opesCare.detail.preVisitHeading')} variant="overline" />
          <Card variant="flush">
            {PRE_VISIT.map((p, i) => (
              <View
                key={p.key}
                style={[styles.instruction, i < PRE_VISIT.length - 1 && styles.instructionDivider]}
              >
                <Icon name={p.icon} size={20} color={colors.blue} />
                <Text style={styles.instructionText}>{t(p.key)}</Text>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {/* Reschedule — the picker, open in place rather than on another route so
          the patient can still see the appointment they are moving. */}
      {rescheduleOpen && canReschedule ? (
        <ReschedulePanel
          appointment={a}
          styles={styles}
          colors={colors}
          t={t}
          onClose={onToggleReschedule}
          onRescheduled={onRescheduled}
        />
      ) : null}

      {/* Actions. Reschedule sits above Cancel deliberately: it is the
          non-destructive way out of "I cannot make this time", and offering it
          first is what stops a patient releasing a slot they did not need to. */}
      {canReschedule ? (
        <CareButton
          label={rescheduleOpen ? t('appointments.reschedule.close') : t('appointments.reschedule.cta')}
          icon={rescheduleOpen ? 'chevron-up' : 'refresh'}
          variant="secondary"
          onPress={onToggleReschedule}
        />
      ) : null}

      {canCancel ? (
        <CareButton
          label={t('opesCare.detail.cancelCta')}
          icon="trash"
          variant="danger"
          loading={cancelling}
          onPress={onCancel}
        />
      ) : (
        <GradientButton label={t('appointments.detail.bookFollowUp')} onPress={onBook} />
      )}

      {/* The clinic can move an appointment; say when this was read. */}
      <Text
        style={styles.loaded}
        accessibilityLabel={uiT('components.loadedA11y', { when: fmtLastLoaded(loadedAt, uiT) })}
      >
        {uiT('components.loadedAt', { when: fmtLastLoaded(loadedAt, uiT) })}
      </Text>
    </>
  );
}

// ---------------------------------------------------------------------------

/**
 * The reschedule picker.
 *
 * Self-contained: it owns its query, its selection, its mutation and its own
 * confirm sheet, and reports upward only when a move actually lands. That keeps
 * the failure story in one place, which matters more here than anywhere else on
 * this screen — a patient who tries to move an appointment and sees an error
 * needs to know, in the same breath, that they still hold the original.
 *
 * Times are grouped the way the booking wizard groups them, by reusing its
 * helpers. `slotsOnDay` / `groupSlotsByPeriod` return the narrower
 * `AppointmentSlotOption`, so each returned slot is looked back up by id to
 * recover `is_current` — reuse of the logic without re-declaring it.
 */
function ReschedulePanel({
  appointment: a,
  styles,
  colors,
  t,
  onClose,
  onRescheduled,
}: {
  appointment: AppointmentDetail;
  styles: Styles;
  colors: Palette;
  t: TFunction;
  onClose: () => void;
  onRescheduled: (from: string, to: string) => void;
}) {
  const dialog = useDialog();
  const { data, isLoading, isError, refetch } = useRescheduleOptions(a.id, true);
  const mutation = useRescheduleAppointment();

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selected, setSelected] = useState<RescheduleSlotOption | null>(null);
  /** Survives the confirm sheet closing, so the reason stays readable. */
  const [failure, setFailure] = useState<{ reason: string; kept: string } | null>(null);

  const slots = useMemo(() => data?.slots ?? [], [data]);
  const byId = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);

  const days = useMemo(
    () => Array.from(daysCoveredBySlots(slots)).sort(),
    [slots],
  );

  // Land on the first day that has anything, and re-land if the window shifts
  // under a refetch (a slot filling can empty the day the patient was on).
  useEffect(() => {
    if (days.length === 0) {
      setSelectedDay(null);
    } else if (!selectedDay || !days.includes(selectedDay)) {
      setSelectedDay(days[0]);
    }
  }, [days, selectedDay]);

  const daySlots = useMemo(
    () => (selectedDay ? slotsOnDay(slots, selectedDay) : []),
    [slots, selectedDay],
  );

  const groups = useMemo(
    () =>
      groupSlotsByPeriod(daySlots).map((group) => ({
        period: group.period,
        slots: group.slots.map((s) => byId.get(s.id)).filter((s): s is RescheduleSlotOption => !!s),
      })),
    [daySlots, byId],
  );

  const nextAhead = useMemo(
    () => (selectedDay ? firstSlotAfterDay(slots, selectedDay) : null),
    [slots, selectedDay],
  );

  const currentWhen = whenLabel(data?.current.scheduled_at ?? a.scheduled_at);

  const confirmMove = (slot: RescheduleSlotOption) => {
    const from = currentWhen;
    const to = whenLabel(slot.starts_at);

    dialog.confirm({
      title: t('appointments.reschedule.confirmTitle'),
      // Both times, spelled out. A confirm that says only "are you sure?" is
      // the one a patient taps through and then finds the wrong day booked.
      message: t('appointments.reschedule.confirmBody', { from, to }),
      confirmLabel: t('appointments.reschedule.confirmYes'),
      cancelLabel: t('appointments.reschedule.confirmNo'),
      onConfirm: async () => {
        setFailure(null);
        try {
          await mutation.mutateAsync({ id: a.id, appointment_slot_id: slot.id });
          onRescheduled(from, to);
        } catch (error) {
          const result = rescheduleFailure(error);
          const reason = t(`appointments.reschedule.${result.key}`);
          // What the patient still holds, taken from the server's own answer
          // rather than assumed. A dropped connection is the one case where
          // the outcome is genuinely unknown, and it says so.
          const kept =
            result.key === 'errNetwork'
              ? t('appointments.reschedule.unconfirmed')
              : result.appointment?.scheduled_at
                ? t('appointments.reschedule.keptOriginal', {
                    when: whenLabel(result.appointment.scheduled_at),
                  })
                : t('appointments.reschedule.keptOriginalUnknownTime');

          setFailure({ reason, kept });
          // Opening a sheet from inside the action keeps it on screen after the
          // confirm closes — the kit Dialog's documented behaviour.
          dialog.alert(t('appointments.reschedule.failedTitle'), `${reason}\n\n${kept}`, 'critical');
          // The window is stale by definition once a slot has been refused.
          void refetch();
          setSelected(null);
        }
      },
    });
  };

  return (
    <View>
      <SectionHeader title={t('appointments.reschedule.panelTitle')} variant="overline" />
      <Card>
        {isLoading ? (
          <LoadingBlock label={t('appointments.reschedule.loading')} />
        ) : isError || !data ? (
          <View style={styles.reschedStack}>
            <NoticeBanner icon="alert-circle" tone="critical" message={t('appointments.reschedule.loadError')} />
            <CareButton
              label={t('appointments.retry')}
              icon="refresh"
              variant="secondary"
              onPress={() => {
                void refetch();
              }}
            />
          </View>
        ) : !data.can_reschedule ? (
          // The server already knows this appointment cannot move. Say why here
          // rather than letting the patient pick a time and then be refused.
          <NoticeBanner
            icon="alert-circle"
            tone="warning"
            title={t('appointments.reschedule.failedTitle')}
            message={t(`appointments.reschedule.${rescheduleCodeKey(data.blocked_reason?.error_code)}`)}
          />
        ) : slots.filter((s) => !s.is_current).length === 0 ? (
          <NoticeBanner
            icon="clock"
            tone="warning"
            title={t('appointments.reschedule.noSlotsTitle')}
            message={t('appointments.reschedule.noSlotsBody', { when: currentWhen })}
          />
        ) : (
          <View style={styles.reschedStack}>
            <NoticeBanner
              icon="info"
              tone="pending"
              message={t('appointments.reschedule.panelIntro', {
                facility: data.current.facility_name ?? a.facility_name ?? '',
              })}
            />

            <Text style={styles.reschedCurrent}>
              {t('appointments.reschedule.currentTime', { when: currentWhen })}
            </Text>

            {failure ? (
              <NoticeBanner
                icon="alert-circle"
                tone="critical"
                title={failure.reason}
                message={failure.kept}
              />
            ) : null}

            {/* Date strip */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reschedRow}>
              {days.map((day) => (
                <Chip
                  key={day}
                  label={formatDate(`${day}T12:00:00`)}
                  selected={day === selectedDay}
                  onPress={() => {
                    setSelectedDay(day);
                    setSelected(null);
                  }}
                />
              ))}
            </ScrollView>

            {/* Times for the chosen day */}
            {groups.length === 0 ? (
              <View style={styles.reschedStack}>
                <NoticeBanner
                  icon="clock"
                  tone="warning"
                  title={t('appointments.reschedule.emptyDayTitle')}
                  message={t('appointments.reschedule.emptyDayBody')}
                />
                {nextAhead ? (
                  <CareButton
                    label={t('appointments.reschedule.jumpToNext', { when: formatDate(nextAhead.starts_at) })}
                    icon="calendar-check"
                    variant="secondary"
                    onPress={() => {
                      setSelectedDay(localDateKey(nextAhead.starts_at));
                      setSelected(null);
                    }}
                  />
                ) : (
                  <CareButton
                    label={t('appointments.reschedule.backToFirstDay')}
                    icon="calendar"
                    variant="secondary"
                    onPress={() => {
                      setSelectedDay(days[0] ?? null);
                      setSelected(null);
                    }}
                  />
                )}
              </View>
            ) : (
              groups.map((group) => (
                <View key={group.period}>
                  <View style={styles.reschedBucketHead}>
                    <Icon name={PERIOD_ICON[group.period] ?? 'clock'} size={16} color={colors.textSecondary} />
                    <Text style={styles.reschedBucketLabel}>{t(`opesCare.slots.${group.period}`)}</Text>
                  </View>
                  <View style={styles.reschedGrid}>
                    {group.slots.map((slot) => {
                      const start = formatTime(slot.starts_at);
                      const scarce = !slot.is_current && slot.available_count <= 1;
                      return (
                        <Chip
                          key={slot.id}
                          label={
                            slot.is_current
                              ? `${start} · ${t('appointments.reschedule.currentBadge')}`
                              : scarce
                                ? `${start} · ${t('appointments.book.spotsLeft', { count: slot.available_count })}`
                                : start
                          }
                          icon={slot.is_current ? 'calendar-check' : scarce ? 'alert-circle' : undefined}
                          selected={selected?.id === slot.id}
                          // No onPress on the current slot: the kit renders an
                          // unpressable chip as text, which is exactly right —
                          // it is a marker, not an option.
                          onPress={slot.is_current ? undefined : () => setSelected(slot)}
                          accessibilityLabel={t('appointments.reschedule.slotA11y', {
                            start,
                            end: formatTime(slot.ends_at),
                          })}
                          accessibilityHint={
                            slot.is_current ? t('appointments.reschedule.currentSlotHint') : undefined
                          }
                          style={styles.reschedChip}
                        />
                      );
                    })}
                  </View>
                </View>
              ))
            )}

            <Text style={styles.reschedSelected}>
              {selected
                ? t('appointments.reschedule.selectedSlot', {
                    time: whenLabel(selected.starts_at),
                    minutes: slotDurationMinutes(selected) ?? '—',
                  })
                : t('appointments.reschedule.selectPrompt')}
            </Text>

            <GradientButton
              label={mutation.isPending ? t('appointments.reschedule.moving') : t('appointments.reschedule.review')}
              onPress={() => selected && confirmMove(selected)}
              disabled={!selected || mutation.isPending}
              loading={mutation.isPending}
              icon="none"
            />
            <CareButton
              label={t('appointments.reschedule.close')}
              icon="close"
              variant="ghost"
              onPress={onClose}
            />
          </View>
        )}
      </Card>

      {dialog.element}
    </View>
  );
}

// ---------------------------------------------------------------------------

function Fact({
  styles,
  color,
  icon,
  label,
  value,
}: {
  styles: Styles;
  color: string;
  icon: IconName;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label}, ${value}`}>
      <Icon name={icon} size={20} color={color} />
      <View style={styles.factText}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={styles.factValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function CircleAction({
  styles,
  color,
  icon,
  label,
  selected,
  onPress,
}: {
  styles: Styles;
  color: string;
  icon: IconName;
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.circleAction}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: !!selected }}
    >
      <View style={styles.circleActionCircle}>
        <Icon name={icon} size={26} color={color} />
      </View>
      <Text style={[styles.circleActionLabel, selected && styles.circleActionLabelOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------

type Styles = ReturnType<typeof makeStyles>;

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },

    summaryTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    summaryIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    summaryHead: { flex: 1, minWidth: 0, gap: 4 },
    summaryTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      color: colors.textPrimary,
    },
    summaryWhen: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.link,
    },
    summaryId: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    summaryIdValue: { fontFamily: typography.fontFamily.medium, color: colors.link },

    factRow: {
      flexDirection: 'row',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      gap: spacing.sm,
    },
    fact: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
    factText: { flex: 1, minWidth: 0 },
    factLabel: { fontFamily: typography.fontFamily.regular, fontSize: 11, color: colors.textMuted },
    factValue: { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.xs, color: colors.link },

    providerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md - 2 },
    providerBody: { flex: 1, minWidth: 0, gap: 2 },
    providerName: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      color: colors.textPrimary,
    },
    providerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    providerMeta: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      color: colors.textSecondary,
    },
    circleActions: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    circleAction: { alignItems: 'center', gap: 6 },
    circleActionCircle: {
      width: 46,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
    },
    circleActionLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textPrimary,
    },
    circleActionLabelOn: { color: colors.blue },

    composer: { marginTop: spacing.md, gap: spacing.sm + 2 },
    composerInput: {
      minHeight: 96,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md - 2,
      paddingVertical: spacing.sm + 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    composerCount: {
      alignSelf: 'flex-end',
      fontFamily: typography.fontFamily.regular,
      fontSize: 11,
      color: colors.textMuted,
    },

    hair: { height: 1, backgroundColor: colors.divider },

    // ── Reschedule picker ────────────────────────────────────────────────
    reschedStack: { gap: spacing.sm + 2 },
    reschedCurrent: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    reschedRow: { gap: spacing.sm, paddingVertical: 2 },
    reschedBucketHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
    reschedBucketLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    reschedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    reschedChip: { minWidth: 92, justifyContent: 'center' },
    reschedSelected: {
      fontFamily: typography.fontFamily.medium,
      fontSize: typography.size.sm,
      color: colors.link,
      textAlign: 'center',
    },

    instruction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: spacing.md,
      paddingVertical: 13,
    },
    instructionDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
    instructionText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },

    loaded: {
      textAlign: 'center',
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
  });
