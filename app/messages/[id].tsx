import { usePrivateScreen } from '@/lib/security/usePrivateScreen';
/**
 * Message thread — `/messages/[id]`. The Finder port of OPES MSG-002
 * (`UIUX/src/screens/chat/MessageThreadScreen.tsx`).
 *
 * Data is the existing layer, untouched: `useMessageThread(id)` loads the
 * conversation from `GET /mobile/messages/threads/{id}` (which marks it read
 * server-side) and `useSendThreadMessage(id)` posts to
 * `POST /mobile/messages/threads/{id}/messages`. Nothing here is local-state
 * theatre: the in-flight bubble is the mutation's own `variables`, and the
 * persisted message appears when the thread refetches.
 *
 * Every field rendered comes from `MobileMessagingController` — `id`,
 * `is_mine`, `body`, `status`, `created_at` per message — so the outgoing tick
 * is a single "sent" mark, not a pretend read receipt.
 */
import { PaperWave } from '@/components/ui/PaperWave';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EmptyState, spacing, useTheme, type IconName, type Palette, type Tint } from '@/components/opes-ui';
import { useMessageThread, useSendThreadMessage } from '@/lib/api/queries';
import {
  describeMessage,
  groupMessagesByDay,
  isSameCluster,
  type RichThreadMessage,
} from '@/lib/api/messagingQueries';
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
  ErrorBlock,
  errorMessage,
  MessageCard,
  QuickActionStrip,
  type CardHandlers,
} from '@/components/chat';

/** Matches the controller's `max:4000` validation rule. */
const MESSAGE_MAX = 4000;

type QuickAction = { icon: IconName; label: string; tint: Tint; href: Href };

export default function MessageThreadRoute() {
  usePrivateScreen();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ id?: string; title?: string }>();

  // Thread ids are numeric; anything else is a malformed link, not a thread.
  const parsed = Number(params.id);
  const threadId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const threadQuery = useMessageThread(threadId);
  const sendMessage = useSendThreadMessage(threadId);
  const queryClient = useQueryClient();
  const scroller = useRef<ScrollView>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const thread = threadQuery.data;

  // Loading the detail marks the thread read server-side. The inbox tab stays
  // mounted underneath this route, so its list (and the tab-bar badge, which
  // reads the same query) would keep the stale `unread` flag until a
  // pull-to-refresh; invalidate exactly the list key — not the detail just
  // fetched — so both catch up.
  useEffect(() => {
    if (thread) queryClient.invalidateQueries({ queryKey: ['message-threads'], exact: true });
  }, [thread, queryClient]);
  const closed = thread?.status === 'closed';
  // The title is the server's (the provider's name) — never translated.
  const title = thread?.title || (typeof params.title === 'string' ? params.title : '') || t('opesChat.thread.fallbackTitle');

  // While the POST is in flight TanStack keeps the submitted body in
  // `variables`, so the outgoing bubble is a real in-flight request rather
  // than an invented message.
  const inFlightBody = sendMessage.isPending ? sendMessage.variables : undefined;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/messages');
  };

  async function handleSend(body: string) {
    setSendError(null);
    try {
      await sendMessage.mutateAsync(body);
      await threadQuery.refetch();
    } catch (e) {
      setSendError(errorMessage(e, t('messages.sendError')));
      // Rethrow so the Composer puts the draft back — nothing typed is lost.
      throw e;
    }
  }

  const handlers: CardHandlers = {
    onOpenRoute: (route) => router.push(route as Href),
  };

  const quickActions: QuickAction[] = [
    { icon: 'pill', label: t('opesChat.thread.quickPrescription'), tint: 'purple', href: '/prescriptions' },
    { icon: 'calendar-plus', label: t('opesChat.thread.quickBookAppointment'), tint: 'amber', href: '/appointments/book' },
    { icon: 'document-text', label: t('documents.title'), tint: 'blue', href: '/documents' },
  ];

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <PaperWave />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ChatHeader
          name={title}
          subtitle={closed ? t('messages.statusClosed') : t('messages.secureTitle')}
          avatarName={thread?.title}
          verified={!!thread && !closed}
          onBack={goBack}
        />

        {/* The deployment's actual guarantee, not the template's HIPAA line. */}
        <EncryptionBanner text={t('messages.secureBody')} />

        <ScrollView
          ref={scroller}
          style={styles.flex}
          contentContainerStyle={styles.content}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            threadId !== null ? (
              <RefreshControl
                refreshing={threadQuery.isRefetching}
                onRefresh={() => threadQuery.refetch()}
                tintColor={colors.blue}
              />
            ) : undefined
          }
        >
          {threadId === null ? (
            <ErrorBlock message={t('messages.threadLoadError')} onRetry={goBack} retryLabel={t('messages.back')} />
          ) : (
            <AsyncBoundary
              state={threadQuery}
              loadingLabel={t('opesChat.thread.loading')}
              errorLabel={t('messages.threadLoadError')}
            >
              {(data) => {
                const messages = data.messages as RichThreadMessage[];
                const groups = groupMessagesByDay(messages);
                return (
                  <>
                    {messages.length === 0 && !inFlightBody && (
                      <EmptyState
                        icon="chat"
                        tint="blue"
                        title={t('opesChat.thread.emptyTitle')}
                        message={t('opesChat.thread.emptyMessage')}
                      />
                    )}
                    {groups.map((group) => (
                      <React.Fragment key={group.key || 'undated'}>
                        {!!group.key && <DayDivider label={dayLabel(group.messages[0]?.created_at)} />}
                        {group.messages.map((message, index) => (
                          <MessageBlock
                            key={message.id}
                            message={message}
                            grouped={isSameCluster(group.messages[index - 1], message)}
                            threadTitle={title}
                            handlers={handlers}
                          />
                        ))}
                      </React.Fragment>
                    ))}
                    {!!inFlightBody && <Bubble mine body={inFlightBody} time="" pending tick="single" />}
                  </>
                );
              }}
            </AsyncBoundary>
          )}
        </ScrollView>

        {threadQuery.isSuccess && !closed && (
          <QuickActionStrip
            actions={quickActions.map((q) => ({
              icon: q.icon,
              label: q.label,
              tint: q.tint,
              onPress: () => router.push(q.href),
            }))}
          />
        )}

        {threadId !== null && (
          <Composer
            placeholder={t('messages.replyPlaceholder')}
            onSend={handleSend}
            sending={sendMessage.isPending}
            disabled={closed || !threadQuery.isSuccess}
            disabledNote={closed ? t('messages.threadClosed') : undefined}
            error={sendError}
            maxLength={MESSAGE_MAX}
            bottomInset={insets.bottom}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * One message: a text bubble, or a rich card in a `CardBubble`. Inbound
 * bubbles inside a five-minute cluster keep the avatar gutter but drop the
 * avatar, so a run of replies reads as one voice.
 */
function MessageBlock({
  message,
  grouped,
  threadTitle,
  handlers,
}: {
  message: RichThreadMessage;
  grouped: boolean;
  threadTitle: string;
  handlers: CardHandlers;
}) {
  const mine = !!message.is_mine;
  const time = chatTime(message.created_at);
  const rendered = describeMessage(message);

  if (rendered.variant === 'text') {
    return (
      <Bubble
        mine={mine}
        body={rendered.body}
        time={time}
        avatarName={threadTitle}
        showAvatar={!grouped}
        // No read receipts exist server-side; a single tick says only "sent".
        tick="single"
        read={false}
      />
    );
  }

  return (
    <CardBubble senderName={threadTitle} time={time} showAvatar={!mine}>
      <MessageCard message={message} handlers={handlers} />
    </CardBubble>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    flex: { flex: 1 },
    content: { padding: spacing.md, gap: spacing.sm + 4, paddingBottom: spacing.lg },
  });
