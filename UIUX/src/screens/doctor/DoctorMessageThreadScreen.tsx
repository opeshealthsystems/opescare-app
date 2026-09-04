/**
 * DoctorMessageThread — the clinician's side of a conversation.
 *
 * The deliberate twin of the patient's `chat/MessageThreadScreen`: same
 * `ChatHeader`, `EncryptionBanner`, `DayDivider`, `Bubble`, `CardBubble`,
 * `MessageCard` and `Composer`. Only the data source and the seat differ —
 * `GET/POST /staff/messages/threads/*`, and `is_mine` now means "I, the
 * clinician, sent it". A patient and their doctor therefore read the same
 * conversation rendered by the same components.
 *
 * Two rules this screen will not bend:
 *
 *  1. A reply is never claimed as delivered on hope. The bubble only becomes a
 *     real message when the server returns the persisted row; a failure marks
 *     the draft "Not sent" and shows `writeFailureMessage`, which says outright
 *     when the outcome is unknown rather than guessing.
 *  2. Sending is single-flight (`useRef` latch + a disabled button), so a
 *     double-tap cannot put the same clinical instruction in a patient's
 *     record twice.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
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
  fetchStaffThread,
  sendStaffMessage,
  setStaffThreadState,
  type PortalMessage,
  type StaffThreadDetail,
  type StaffThreadState,
} from '../../api';
import { EmptyState, Icon, useDialog } from '../../components';
import { writeFailureMessage } from '../../lib/errors';
import type { DoctorStackParamList } from '../../navigation/routes';
import { useTranslation } from '../../i18n';
import { colors, spacing, typography } from '../../theme/theme';
import { MessageCard, type CardHandlers } from '../chat/cards';
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
  useAsync,
} from '../chat/shared';

/** A reply the server has not acknowledged yet. */
type Draft = { key: string; body: string; failed: boolean };

export function DoctorMessageThreadScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<DoctorStackParamList, 'DoctorMessageThread'>>();
  const threadId = route.params.threadId;
  const { t } = useTranslation();
  const dialog = useDialog();

  const state = useAsync<StaffThreadDetail>(() => fetchStaffThread(threadId), [threadId]);
  const { setData, reload } = state;

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const scroller = useRef<ScrollView>(null);
  /** Single-flight latch — a second tap while one send is in the air is a no-op. */
  const inFlight = useRef(false);

  const handleSend = useCallback(
    async (body: string) => {
      if (inFlight.current) return;
      inFlight.current = true;

      const key = `draft-${Date.now()}`;
      setDrafts((d) => [...d, { key, body, failed: false }]);
      setSending(true);
      setSendError(null);

      try {
        const message = await sendStaffMessage(threadId, body);
        // Replace the optimistic draft with the row the server actually wrote.
        setDrafts((d) => d.filter((x) => x.key !== key));
        const current = state.data;
        if (current) {
          setData({
            ...current,
            messages: [...current.messages, message],
            last_message_at: message.sent_at,
            last_message_preview: message.body,
            unread_count: 0,
          });
        } else {
          reload();
        }
      } catch (e) {
        setDrafts((d) => d.map((x) => (x.key === key ? { ...x, failed: true } : x)));
        // Never assert "not sent" when we cannot know. writeFailureMessage says
        // so plainly and tells the doctor how to check for themselves.
        setSendError(
          writeFailureMessage(
            e,
            t('doctor.thread.sendFailedHint'),
            t('doctor.thread.sendFailedFallback')
          )
        );
        throw e;
      } finally {
        inFlight.current = false;
        setSending(false);
      }
    },
    [threadId, setData, state.data, reload, t]
  );

  const applyState = useCallback(
    async (next: StaffThreadState) => {
      setStateError(null);
      try {
        const updated = await setStaffThreadState(threadId, next);
        if (next === 'unread' || next === 'archive') {
          // Both take this conversation off the doctor's desk — go back to the
          // list, which re-reads on focus and will show the real new state.
          if (navigation.canGoBack()) navigation.goBack();
          return;
        }
        const current = state.data;
        if (current) setData({ ...current, ...updated, messages: current.messages });
      } catch (e) {
        setStateError(
          writeFailureMessage(
            e,
            t('doctor.thread.stateFailedHint'),
            t('doctor.thread.stateFailedFallback')
          )
        );
      }
    },
    [threadId, navigation, setData, state.data, t]
  );

  const openOptions = useCallback(() => {
    const thread = state.data;
    dialog.show({
      title: t('doctor.thread.optionsTitle'),
      message: thread?.subject ?? undefined,
      actions: [
        { label: t('doctor.thread.markUnread'), variant: 'secondary', onPress: () => applyState('unread') },
        thread?.status === 'archived'
          ? { label: t('doctor.thread.reopen'), variant: 'primary', onPress: () => applyState('reopen') }
          : { label: t('doctor.thread.archive'), variant: 'destructive', onPress: () => applyState('archive') },
      ],
      cancelLabel: t('doctor.thread.cancel'),
    });
  }, [dialog, state.data, applyState, t]);

  // A doctor's chart deep-links. Cards render read-only unless the doctor stack
  // actually has these screens; navigate() is guarded by the id being present.
  const handlers: CardHandlers = {
    onOpenPrescription: () => undefined,
    onOpenCarePlan: () => undefined,
    onOpenReferral: () => undefined,
    onOpenImaging: () => undefined,
    onOpenInvoice: () => undefined,
    onOpenAppointment: () => undefined,
  };

  const thread = state.data;
  const headerName =
    thread?.counterpart_name ?? thread?.patient_name ?? route.params.title ?? t('doctor.thread.fallbackName');
  const closed = thread?.status === 'closed';

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ChatHeader
        name={headerName}
        subtitle={thread?.subject}
        place={thread?.kind === 'patient' ? thread?.patient_number : thread?.facility_name}
        avatarIcon={thread?.kind === 'patient' ? 'person' : 'users'}
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('DoctorMessages'))}
        onMore={openOptions}
      />

      <EncryptionBanner />

      <ScrollView
        ref={scroller}
        contentContainerStyle={styles.content}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
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
          onLink={() => navigation.goBack()}
          loadingLabel={t('doctor.thread.loading')}
        >
          {(data) => (
            <>
              {data.messages.length === 0 && (
                <EmptyState
                  icon="chat"
                  tint="blue"
                  title={t('doctor.thread.emptyTitle')}
                  message={t('doctor.thread.emptyBody')}
                />
              )}
              {data.messages.map((m, i) => (
                <MessageBlock key={m.id} message={m} previous={data.messages[i - 1]} handlers={handlers} />
              ))}
              {drafts.map((d) => (
                <Bubble key={d.key} mine body={d.body} time="" pending={!d.failed} failed={d.failed} />
              ))}
            </>
          )}
        </AsyncBoundary>
      </ScrollView>

      {!!sendError && <Banner text={sendError} />}
      {!!stateError && <Banner text={stateError} />}

      <Composer
        placeholder={t('doctor.thread.placeholder')}
        onSend={handleSend}
        sending={sending}
        disabled={closed}
        disabledNote={closed ? t('doctor.thread.closedNote') : undefined}
      />

      {dialog.element}
    </KeyboardAvoidingView>
  );
}

function Banner({ text }: { text: string }) {
  return (
    <View style={styles.sendError}>
      <Icon name="alert-circle" size={16} color={colors.statusCritical} />
      <Text style={styles.sendErrorText}>{text}</Text>
    </View>
  );
}

/** Day divider on a date change, then the bubble and/or the structured card. */
function MessageBlock({
  message,
  previous,
  handlers,
}: {
  message: PortalMessage;
  previous?: PortalMessage;
  handlers: CardHandlers;
}) {
  const newDay =
    !previous || new Date(previous.sent_at).toDateString() !== new Date(message.sent_at).toDateString();
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
