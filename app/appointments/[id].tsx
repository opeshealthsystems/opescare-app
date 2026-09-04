/**
 * Appointment detail — OPES CARE-003 ported onto this route.
 *
 * Layout from `UIUX/src/screens/care/AppointmentDetailScreen.tsx`: state
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
 */
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
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

const BOOK_ROUTE = '/appointments/book';
const MESSAGES_ROUTE = '/(tabs)/messages';
const MESSAGE_MAX = 2000;

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
          <View style={[styles.summaryIcon, { backgroundColor: tint.bg }]}>
            <Icon name={typeIconOf(a.appointment_type)} size={22} color={tint.fg} />
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
              <Icon name="building" size={16} color={colors.textSecondary} />
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

      {/* Actions */}
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
      <View style={[styles.circleActionCircle, selected && styles.circleActionCircleOn]}>
        <Icon name={icon} size={22} color={color} />
      </View>
      <Text style={styles.circleActionLabel}>{label}</Text>
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
    summaryIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
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
      borderRadius: 23,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.primarySoft,
    },
    circleActionCircleOn: { borderColor: colors.blue },
    circleActionLabel: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textPrimary,
    },

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
