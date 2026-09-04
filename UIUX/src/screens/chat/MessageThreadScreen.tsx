/**
 * MSG-002 — Message Thread.
 *
 * Loads a real conversation from `GET /patient/messages/threads/{id}` (which
 * also marks it read server-side) and sends with
 * `POST /patient/messages/threads/{id}/messages`. Nothing here is local state
 * theatre: a sent message is the row the API returns, so it survives a reload.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  fetchAppointments,
  fetchThread,
  sendMessage,
  type PortalMessage,
  type PortalThreadDetail,
} from '../../api';
import { EmptyState, Icon, IconName } from '../../components';
import { useTranslation } from '../../i18n';
import { AppStackParamList } from '../../navigation/routes';
import { colors, spacing, typography, Tint } from '../../theme/theme';
import { CardHandlers, MessageCard } from './cards';
import { WidgetSheet } from './WidgetSheet';
import {
  AsyncBoundary,
  Bubble,
  CardBubble,
  ChatHeader,
  chatTime,
  Composer,
  DayDivider,
  dayLabel,
  EncryptionBanner,
  errorMessage,
  QuickActionStrip,
  useAsync,
} from './shared';

/** An in-flight message the API hasn't acknowledged yet. */
type Draft = { key: string; body: string; failed: boolean };

type QuickAction = { icon: IconName; label: string; tint: Tint; route: keyof AppStackParamList };

/**
 * Built per locale rather than at module scope, so the labels are literal
 * `t('…')` calls the parity checker can actually see — and so a language
 * switch re-renders them.
 */
function quickActions(t: (key: string) => string): QuickAction[] {
  return [
    { icon: 'flask', label: t('chat.thread.quickLabResults'), tint: 'green', route: 'DiagnosticsDashboard' },
    { icon: 'pill', label: t('chat.thread.quickPrescription'), tint: 'purple', route: 'Medications' },
    { icon: 'calendar-plus', label: t('chat.thread.quickBookAppointment'), tint: 'amber', route: 'FindProvider' },
    { icon: 'document-text', label: t('chat.thread.quickInvoices'), tint: 'blue', route: 'Billing' },
    { icon: 'help-circle', label: t('chat.thread.quickAskQuestion'), tint: 'purple', route: 'NewMessage' },
  ];
}

export function MessageThreadScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { params } = useRoute<RouteProp<AppStackParamList, 'MessageThread'>>();
  const threadId = params.threadId;

  const state = useAsync<PortalThreadDetail>(() => fetchThread(threadId), [threadId]);
  const { setData, reload } = state;

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [sending, setSending] = useState(false);
  // Synchronous double-send guard: `sending` is state and does not flip until
  // the next render, so two taps in the same frame both pass a `!sending`
  // check and post twice. The ref flips immediately. (Same pattern as
  // NewMessageScreen.)
  const sendingRef = useRef(false);
  const [widgetsOpen, setWidgetsOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scroller = useRef<ScrollView>(null);

  /**
   * A thread is not a video call. The header's call button only makes sense
   * when this doctor actually has an upcoming video visit booked, so look one
   * up and hide the button entirely when there is nothing to join.
   */
  const [videoVisitId, setVideoVisitId] = useState<string | null>(null);
  const providerId = state.data?.provider_id ?? null;

  useEffect(() => {
    if (providerId === null) {
      setVideoVisitId(null);
      return;
    }
    let cancelled = false;
    fetchAppointments({ scope: 'upcoming', per_page: 50 })
      .then((page) => {
        if (cancelled) return;
        const visit = page.data.find((a) => a.provider_id === providerId && a.visit_mode === 'telemedicine');
        setVideoVisitId(visit?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setVideoVisitId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  const handleSend = useCallback(
    async (body: string) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      const key = `draft-${Date.now()}`;
      setDrafts((d) => [...d, { key, body, failed: false }]);
      setSending(true);
      setSendError(null);
      try {
        const message = await sendMessage(threadId, body);
        // Replace the draft with the persisted row the server gave back, and
        // clear any earlier failed twin of the same text: a retry that lands as
        // its own fresh draft must not leave the old "Not sent" bubble behind.
        setDrafts((d) => d.filter((x) => x.key !== key && !(x.failed && x.body === body)));
        setData({
          ...(state.data as PortalThreadDetail),
          messages: [...((state.data as PortalThreadDetail)?.messages ?? []), message],
          last_message_at: message.sent_at,
          last_message_preview: message.body,
        });
      } catch (e) {
        setDrafts((d) => d.map((x) => (x.key === key ? { ...x, failed: true } : x)));
        setSendError(errorMessage(e, t('chat.thread.sendFailed')));
        throw e;
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    // `t` is in the list on purpose (rule 3): without it the memo would hold
    // the English failure text after a language switch.
    [threadId, setData, state.data, t]
  );

  /** A widget wrote a real record; append the message the server persisted. */
  const handleWidgetCompleted = useCallback(
    (message: PortalMessage) => {
      setWidgetsOpen(false);
      setData({
        ...(state.data as PortalThreadDetail),
        messages: [...((state.data as PortalThreadDetail)?.messages ?? []), message],
        last_message_at: message.sent_at,
        last_message_preview: message.body,
      });
    },
    [setData, state.data]
  );

  const handlers: CardHandlers = {
    onOpenPrescription: (id) => id && navigation.navigate('PrescriptionDetail', { prescriptionId: id }),
    onOpenCarePlan: (id) => id && navigation.navigate('CarePlanDetail', { carePlanId: id }),
    onOpenReferral: (id) => id && navigation.navigate('ReferralDetail', { referralId: id }),
    onOpenImaging: (id) => id && navigation.navigate('ImagingResultDetail', { studyId: id }),
    onOpenInvoice: (id) => id && navigation.navigate('PaymentRequestInvoice', { invoiceId: id }),
    onOpenAppointment: (id) => id && navigation.navigate('AppointmentDetail', { appointmentId: id }),
  };

  const thread = state.data;
  // Provider and facility names come from the API — never translated.
  const headerName =
    thread?.provider_name ?? thread?.facility_name ?? params.title ?? t('chat.thread.fallbackTitle');

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ChatHeader
        name={headerName}
        subtitle={thread?.provider_specialty ?? thread?.subject}
        place={thread?.facility_name}
        online={thread?.provider_is_online}
        verified={!!thread?.provider_name}
        avatarIcon={thread?.provider_name ? 'person' : 'building'}
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('MainTabs'))}
        onCall={
          videoVisitId ? () => navigation.navigate('TelemedicineWaitingRoom', { appointmentId: videoVisitId }) : undefined
        }
        onMore={() => navigation.navigate('Notifications')}
        onProfile={
          thread?.provider_id ? () => navigation.navigate('ProviderProfile', { providerId: String(thread.provider_id) }) : undefined
        }
      />

      <EncryptionBanner />

      <ScrollView
        ref={scroller}
        contentContainerStyle={styles.content}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
        refreshControl={
          <RefreshControl refreshing={state.loading && state.data !== null} onRefresh={reload} tintColor={colors.blue} />
        }
      >
        <AsyncBoundary
          state={state}
          onLink={() => navigation.navigate('MyHealthId')}
          loadingLabel={t('chat.thread.loading')}
        >
          {(data) => (
            <>
              {data.messages.length === 0 && (
                <EmptyState
                  icon="chat"
                  tint="blue"
                  title={t('chat.thread.emptyTitle')}
                  message={t('chat.thread.emptyMessage')}
                />
              )}
              {data.messages.map((m, i) => (
                <MessageBlock
                  key={m.id}
                  message={m}
                  previous={data.messages[i - 1]}
                  handlers={handlers}
                />
              ))}
              {drafts.map((d) => (
                <Bubble key={d.key} mine body={d.body} time="" pending={!d.failed} failed={d.failed} />
              ))}
            </>
          )}
        </AsyncBoundary>
      </ScrollView>

      {!!sendError && (
        <View style={styles.sendError}>
          <Icon name="alert-circle" size={16} color={colors.statusCritical} />
          <Text style={styles.sendErrorText}>{sendError}</Text>
        </View>
      )}

      <QuickActionStrip
        actions={quickActions(t).map((q) => ({
          icon: q.icon,
          label: q.label,
          tint: q.tint,
          onPress: () => navigation.navigate(q.route as never),
        }))}
      />

      <Composer
        onSend={handleSend}
        onAttach={thread?.status === 'closed' ? undefined : () => setWidgetsOpen(true)}
        sending={sending}
        disabled={thread?.status === 'closed'}
        disabledNote={thread?.status === 'closed' ? t('chat.thread.closed') : undefined}
      />

      <WidgetSheet
        visible={widgetsOpen}
        threadId={threadId}
        onClose={() => setWidgetsOpen(false)}
        onCompleted={handleWidgetCompleted}
      />
    </KeyboardAvoidingView>
  );
}

/** One message: a day divider when the date changes, then a bubble or a card. */
function MessageBlock({
  message,
  previous,
  handlers,
}: {
  message: PortalMessage;
  previous?: PortalMessage;
  handlers: CardHandlers;
}) {
  const newDay = !previous || new Date(previous.sent_at).toDateString() !== new Date(message.sent_at).toDateString();
  const time = chatTime(message.sent_at);
  const card = message.card_type !== 'none' ? <MessageCard message={message} handlers={handlers} /> : null;

  return (
    <>
      {newDay && <DayDivider label={dayLabel(message.sent_at)} />}
      {!!message.body && (
        <Bubble
          mine={message.is_mine}
          body={message.body}
          time={time}
          read={!!message.read_at}
          senderName={message.is_mine ? null : message.sender_name}
          showAvatar={!message.is_mine}
        />
      )}
      {!!card && (
        <CardBubble senderName={message.sender_name} time={time} showAvatar={!message.is_mine}>
          {card}
        </CardBubble>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm + 4, paddingBottom: spacing.lg },
  sendError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: spacing.sm + 2,
    backgroundColor: colors.statusCriticalBg,
  },
  sendErrorText: {
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.size.xs,
    color: colors.statusCritical,
  },
});
