import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
/**
 * Doctor — one conversation (`/clinician/messages/[id]`).
 *
 * Port of design reference `src/screens/doctor/DoctorMessageThreadScreen.tsx` (archived prototype, see docs/DESIGN_REFERENCE.md) onto
 * expo-router, the OPES UI kit and this app's doctor foundation.
 *
 * The deliberate twin of the patient's `app/messages/[id].tsx`: the SAME
 * `ChatHeader`, `EncryptionBanner`, `DayDivider`, `Bubble` and `Composer` from
 * `components/chat`. Only the seat and the data source differ — the doctor
 * contract's `/mobile/doctor/messages/threads/*` — so a patient and their
 * clinician read one conversation rendered by one set of components.
 *
 * Three rules this screen will not bend:
 *
 *  1. A REPLY IS NEVER CLAIMED AS SENT ON HOPE. The outgoing bubble is the
 *     mutation's own in-flight `variables`, drawn `pending`. If the request
 *     fails the bubble disappears with the failed request, the draft goes back
 *     in the composer and a Dialog says what happened — including, plainly,
 *     when the outcome is UNKNOWN and where to check. Nothing is ever painted
 *     as delivered that the server did not acknowledge.
 *  2. SENDING IS SINGLE-FLIGHT. A `useRef` latch plus the composer's own
 *     disabled state, so a double tap cannot put the same clinical instruction
 *     in a patient's record twice.
 *  3. NO READ RECEIPTS ARE INVENTED. The wire carries `status` per message but
 *     no read vocabulary this client can rely on, so outgoing bubbles show a
 *     single "sent" tick — exactly as the patient side does.
 *
 * Reused verbatim from `components/chat` (not edited, not forked): `ChatHeader`,
 * `EncryptionBanner`, `DayDivider`, `dayLabel`, `Bubble`, `chatTime`. The one
 * local piece is the patient-chart link strip: `ChatHeader`'s own profile slot
 * is labelled "View Profile", which is the wrong claim for a clinical chart.
 *
 * Backend gap: the finder does not serve `/mobile/doctor/*` yet. A 404 (or any
 * failure with nothing on screen) renders an honest EmptyState with a retry.
 *
 * i18n: `opesDoctor.thread.*`. Every string carries a `defaultValue`.
 * Locale files are not edited here.
 */
import { PaperWave } from '@/components/ui/PaperWave';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RoleGate } from '@/components/doctor/RoleGate';
import { useStaffCapability } from '@/lib/staffCapabilities';
import {
  EmptyState,
  Icon,
  StaleNotice,
  radii,
  spacing,
  typography,
  useDialog,
  useTheme,
  type IconName,
  type Palette,
} from '@/components/opes-ui';
import { LoadingBlock, describeFailure, type Translate } from '@/components/care/shared';
// The patient side's chat chrome — reused, never forked.
import {
  Bubble,
  ChatHeader,
  Composer,
  DayDivider,
  EncryptionBanner,
  chatTime,
  dayLabel,
} from '@/components/chat';
// ── Doctor foundation (owned by the foundation agent) ─────────────────────
import {
  useDoctorThread,
  useSendDoctorMessage,
  useSetDoctorThreadState,
  type DoctorThreadDetail,
  type DoctorThreadMessage,
  type DoctorThreadState,
  isDoctorFeatureUnserved,
} from '@/lib/api/doctorQueries';
import { doctorRoutes } from '@/components/doctor/chartRoutes';

/**
 * Failure copy for a write. When the request left the phone but no answer came
 * back, the app genuinely does not know whether it landed — and says so, with
 * where to check.
 */
function writeFailureMessage(t: Translate, e: unknown, checkHint: string, fallback: string): string {
  const f = describeFailure(e, fallback);
  const outcomeUnknown = f.kind === 'timeout' || f.kind === 'server' || f.kind === 'unknown';
  return outcomeUnknown
    ? t('opesCore.errors.unknownOutcome', { message: f.message, checkHint })
    : f.message;
}

/** True when these two messages fall on different calendar days. */
function startsNewDay(previous: DoctorThreadMessage | undefined, message: DoctorThreadMessage): boolean {
  if (!message.created_at) return false;
  if (!previous?.created_at) return true;
  const a = new Date(previous.created_at);
  const b = new Date(message.created_at);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  return a.toDateString() !== b.toDateString();
}

/**
 * Role gate — messaging. A role without it never mounts the screen
 * below, so none of its queries run and the server is never asked what it
 * would refuse (`lib/staffCapabilities.ts`, mirror of config/staff_capabilities.php).
 */
export default function DoctorMessageThreadScreen() {
  usePrivateScreen();
  return (
    <RoleGate need={['messaging']}>
      <DoctorMessageThreadScreenBody />
    </RoleGate>
  );
}

function DoctorMessageThreadScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const dialog = useDialog();
  const params = useLocalSearchParams<{ id?: string; title?: string }>();
  // Messaging is held by every professional; the chart is not. No link for a
  // role that would only be refused it.
  const canChart = useStaffCapability('clinical_chart');

  /** `opesDoctor.<key>` with a readable default until the catalogue lands. */
  const tx = useCallback(
    (key: string, defaultValue: string, p?: Record<string, unknown>) =>
      String(t(`opesDoctor.${key}`, { defaultValue, ...p })),
    [t]
  );
  const tr = useCallback<Translate>(
    (key, p) => String(t(key, p as Record<string, unknown>)),
    [t]
  );

  // Thread ids are opaque strings on this contract; an empty one is a
  // malformed link, not a thread, and must not become a request for `''`.
  const threadId = typeof params.id === 'string' && params.id.length > 0 ? params.id : undefined;
  const passedTitle = typeof params.title === 'string' ? params.title : undefined;

  const thread = useDoctorThread(threadId);
  const send = useSendDoctorMessage();
  const setState = useSetDoctorThreadState();
  const { refetch } = thread;

  const scroller = useRef<ScrollView>(null);
  /** Single-flight latch — a second tap while one send is in the air is a no-op. */
  const inFlight = useRef(false);
  const [stateBusy, setStateBusy] = useState(false);

  const data: DoctorThreadDetail | undefined = thread.data;
  const closed = data?.status === 'closed';

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(doctorRoutes.messages);
  }, [router]);

  // ── Sending ──────────────────────────────────────────────────────────────

  /**
   * `onSend` is awaited by the Composer, which restores the draft if it
   * throws — so a failure loses nothing the clinician typed, and shows no
   * message that was not written.
   */
  const handleSend = useCallback(
    async (body: string) => {
      if (!threadId || inFlight.current) return;
      inFlight.current = true;
      try {
        await send.mutateAsync({ threadId, body });
        // The bubble appears only once the refetch brings back the PERSISTED
        // row — never on the strength of a resolved promise alone.
        await refetch();
      } catch (e) {
        dialog.alert(
          tx('thread.sendFailedTitle', 'Reply not sent'),
          writeFailureMessage(
            tr,
            e,
            tx(
              'thread.sendFailedHint',
              'Pull down to refresh this conversation to see whether your reply reached the patient.'
            ),
            tx(
              'thread.sendFailedFallback',
              "Your reply couldn't be sent. Check your connection and try again."
            )
          ),
          'critical'
        );
        // Rethrow so the Composer puts the draft back.
        throw e;
      } finally {
        inFlight.current = false;
      }
    },
    [threadId, send, refetch, dialog, tx, tr]
  );

  // ── Thread state ─────────────────────────────────────────────────────────

  const applyState = useCallback(
    async (next: DoctorThreadState) => {
      if (!threadId || stateBusy) return;
      setStateBusy(true);
      try {
        await setState.mutateAsync({ threadId, state: next });
        if (next === 'unread' || next === 'archive') {
          // Both take this conversation off the clinician's desk. Go back to
          // the list, which re-reads on focus and shows the real new state.
          goBack();
          return;
        }
        await refetch();
      } catch (e) {
        dialog.alert(
          tx('appointment.writeFailedTitle', "We couldn't complete that"),
          writeFailureMessage(
            tr,
            e,
            tx('thread.stateFailedHint', "Open Messages again to see the conversation's current state."),
            tx('thread.stateFailedFallback', "That change couldn't be saved.")
          ),
          'critical'
        );
        // The change may or may not have landed — re-read rather than leave a
        // guess about it on screen.
        void refetch();
      } finally {
        setStateBusy(false);
      }
    },
    [threadId, stateBusy, setState, goBack, refetch, dialog, tx, tr]
  );

  const openOptions = useCallback(() => {
    dialog.show({
      title: tx('thread.optionsTitle', 'Conversation options'),
      message: data?.subject ?? undefined,
      actions: [
        {
          label: tx('thread.markUnread', 'Mark as unread'),
          variant: 'secondary',
          onPress: () => applyState('unread'),
        },
        data?.status === 'archived'
          ? {
              label: tx('thread.reopen', 'Reopen'),
              variant: 'primary',
              onPress: () => applyState('reopen'),
            }
          : {
              label: tx('thread.archive', 'Archive'),
              variant: 'destructive',
              onPress: () => applyState('archive'),
            },
      ],
      cancelLabel: tx('thread.cancel', 'Cancel'),
    });
  }, [dialog, data?.subject, data?.status, applyState, tx]);

  // ── Header ───────────────────────────────────────────────────────────────

  const headerName =
    data?.counterpart_name ??
    data?.patient_name ??
    passedTitle ??
    tx('thread.fallbackName', 'Conversation');
  const isPatientThread = data?.kind === 'patient';
  const avatarIcon: IconName = isPatientThread ? 'person' : 'users';
  const place = isPatientThread ? data?.patient_health_id : data?.facility_name;

  // While the POST is in flight TanStack keeps the submitted body in
  // `variables`, so the outgoing bubble is a real in-flight request rather
  // than an invented message. It vanishes with the request if it fails.
  const inFlightBody = send.isPending ? send.variables?.body : undefined;

  // A refresh that failed while the conversation is on screen must never pass
  // as fresh.
  const stale =
    thread.isError && thread.data !== undefined ? (
      <StaleNotice
        message={describeFailure(thread.error).message}
        loadedAt={thread.dataUpdatedAt ? new Date(thread.dataUpdatedAt) : null}
        onRetry={() => void refetch()}
        retrying={thread.isFetching}
      />
    ) : null;

  let body: React.ReactNode;
  if (!threadId) {
    body = (
      <EmptyState
        icon="alert-circle"
        tint="red"
        title={tx('thread.badLinkTitle', 'Conversation not found')}
        message={tx(
          'thread.badLinkBody',
          'That link does not name a conversation. Open Messages and pick it from the list.'
        )}
        actionLabel={tx('thread.backToMessages', 'Back to Messages')}
        onAction={goBack}
      />
    );
  } else if (thread.isPending) {
    body = <LoadingBlock label={tx('thread.loading', 'Loading conversation…')} />;
  } else if (thread.isError && thread.data === undefined) {
    const notServed = isDoctorFeatureUnserved(thread.error);
    body = (
      <EmptyState
        icon={notServed ? 'chat' : 'alert-circle'}
        tint={notServed ? 'blue' : 'red'}
        title={
          notServed
            ? tx('shared.notServedTitle', 'Not available on this server yet')
            : // describeFailure already names the failure in the reader's
              // language — a refused conversation reads as "not found", not as
              // a generic "something went wrong".
              describeFailure(thread.error).title
        }
        message={
          notServed
            ? tx(
                'shared.notServedThread',
                'Conversations with your patients and colleagues will open here once the clinician service is enabled for this app.'
              )
            : describeFailure(thread.error).message
        }
        actionLabel={tr('opesCore.common.retry')}
        onAction={() => void refetch()}
      />
    );
  } else {
    const messages = data?.messages ?? [];
    body = (
      <>
        {messages.length === 0 && !inFlightBody && (
          <EmptyState
            icon="chat"
            tint="blue"
            title={tx('thread.emptyTitle', 'No messages yet')}
            message={tx('thread.emptyBody', 'Nothing has been written in this conversation.')}
          />
        )}
        {messages.map((message, i) => (
          <MessageBlock
            key={message.id}
            message={message}
            previous={messages[i - 1]}
            counterpartName={headerName}
          />
        ))}
        {!!inFlightBody && <Bubble mine body={inFlightBody} time="" pending tick="single" />}
      </>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <PaperWave />
      <KeyboardAvoidingView
        style={styles.flex}
        // `padding` on web shifts the whole page under the keyboard-less
        // browser viewport; iOS is the only platform that needs it.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ChatHeader
          name={headerName}
          subtitle={data?.subject}
          place={place}
          avatarIcon={avatarIcon}
          onBack={goBack}
          onMore={data ? openOptions : undefined}
        />

        <EncryptionBanner />

        {/* The chart link. `ChatHeader`'s own profile slot says "View Profile",
            which is the wrong claim for a clinical record, so this is a local
            strip rather than an edit to the shared chat chrome. */}
        {canChart && isPatientThread && !!data?.patient_id && (
          <TouchableOpacity
            style={styles.chartLink}
            activeOpacity={0.7}
            onPress={() => router.push(doctorRoutes.patient(data.patient_id as string))}
            accessibilityRole="button"
            accessibilityLabel={tx('thread.openChart', 'Open patient chart')}
          >
            <View style={styles.chartCircle}>
              <Icon name="clipboard" size={26} color={colors.tintBlue} />
            </View>
            <View style={styles.chartBody}>
              <Text style={styles.chartTitle} numberOfLines={1}>
                {tx('thread.openChart', 'Open patient chart')}
              </Text>
              {!!(data.patient_name ?? data.patient_health_id) && (
                <Text style={styles.chartMeta} numberOfLines={1}>
                  {data.patient_name ?? data.patient_health_id}
                </Text>
              )}
            </View>
            <Icon name="chevron-right" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        <ScrollView
          ref={scroller}
          style={styles.flex}
          contentContainerStyle={styles.content}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            threadId ? (
              <RefreshControl
                refreshing={thread.isFetching && !thread.isPending}
                onRefresh={() => void refetch()}
                tintColor={colors.blue}
              />
            ) : undefined
          }
        >
          {stale}
          {body}
        </ScrollView>

        {!!threadId && (
          <Composer
            placeholder={tx('thread.placeholder', 'Reply to your patient…')}
            onSend={handleSend}
            sending={send.isPending}
            disabled={closed || stateBusy || !thread.isSuccess}
            disabledNote={
              closed
                ? tx('thread.closedNote', 'This conversation is closed and cannot receive replies.')
                : undefined
            }
            bottomInset={insets.bottom}
          />
        )}
      </KeyboardAvoidingView>

      {dialog.element}
    </SafeAreaView>
  );
}

/**
 * One message: a day divider when the date turns over, then the bubble.
 *
 * The doctor contract carries no `card_type` and no `sender_name` — every row
 * is plain text from one of two seats — so there is no `CardBubble` branch
 * here. Nothing is rendered that the wire does not carry.
 */
function MessageBlock({
  message,
  previous,
  counterpartName,
}: {
  message: DoctorThreadMessage;
  previous?: DoctorThreadMessage;
  counterpartName: string;
}) {
  if (!message.body) return null;
  return (
    <>
      {startsNewDay(previous, message) && <DayDivider label={dayLabel(message.created_at)} />}
      <Bubble
        mine={message.is_mine}
        body={message.body}
        time={chatTime(message.created_at)}
        avatarName={counterpartName}
        showAvatar={!message.is_mine}
        // No read receipts exist on this contract; a single tick says only
        // "sent", which is all the server actually tells us.
        tick="single"
        read={false}
      />
    </>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    flex: { flex: 1 },
    content: { padding: spacing.md, gap: spacing.sm + 4, paddingBottom: spacing.lg },

    chartLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 4,
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: spacing.sm + 2,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chartCircle: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chartBody: { flex: 1, minWidth: 0 },
    chartTitle: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.sm,
      color: colors.textPrimary,
    },
    chartMeta: {
      marginTop: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
  });
