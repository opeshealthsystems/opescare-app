import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  FileText,
  Lock,
  MessageCircle,
  Paperclip,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Video,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { colors } from '../../theme/tokens';
import {
  useAppointmentsForMessaging,
  useMessageThread,
  useMessageThreads,
  useSendThreadMessage,
  useStartMessageThread,
  type MessageThreadSummary,
} from '../../lib/api/queries';
import {
  countUnreadThreads,
  describeMessage,
  fileKindLabel,
  filterThreads,
  formatFileSize,
  groupMessagesByDay,
  initialsFor,
  isSameCluster,
  resolveResourceRoute,
  sortThreadsByActivity,
  type MessageAttachment,
  type RichThreadMessage,
  type StructuredMessagePayload,
} from '../../lib/api/messagingQueries';

/**
 * Messages tab — a real messenger over the real messaging API.
 *
 * Two states live in this one file on purpose: the inbox, and the open
 * conversation. There is no `app/messages/[id].tsx` route in this fan-out and
 * this agent owns only this screen, so pushing to a thread route would be a
 * dead link. The conversation is therefore a second state of this screen
 * rather than a broken navigation target.
 *
 * Every field rendered comes from `MobileMessagingController`:
 *   • threads   → id, title, status, priority, thread_type, updated_at,
 *                 unread (boolean), last_message{body,is_mine,created_at}
 *   • messages  → id, is_mine, body, status, created_at
 * The API returns no participant name beyond `title`, no avatar URL, no
 * unread *count*, and no read receipts — so this screen derives avatars from
 * initials, badges "unread" as a boolean, and shows a plain "sent" tick
 * rather than pretending a provider has read anything.
 *
 * Non-text messages: `lib/api/messagingQueries.ts` documents exactly what the
 * backend can and cannot represent today. `describeMessage()` decides the
 * variant; because the controller does not serialise `message_type`,
 * `attachments` or a payload, every real message currently renders as text.
 * The attachment/structured/unsupported renderers below are the presentation
 * waiting for those fields — they draw nothing unless the API sends them.
 */
export default function MessagesScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeAppointmentId, setComposeAppointmentId] = useState<string | null>(null);
  const [composeBody, setComposeBody] = useState('');

  const threadsQuery = useMessageThreads();
  const appointmentsQuery = useAppointmentsForMessaging();
  const startThread = useStartMessageThread();

  const allThreads = useMemo(
    () => sortThreadsByActivity(threadsQuery.data ?? []),
    [threadsQuery.data],
  );
  const unreadCount = useMemo(() => countUnreadThreads(allThreads), [allThreads]);
  const visibleThreads = useMemo(() => {
    const scoped = unreadOnly ? allThreads.filter((thread) => thread.unread) : allThreads;
    return filterThreads(scoped, search);
  }, [allThreads, unreadOnly, search]);

  const contactableAppointments = useMemo(
    () => (appointmentsQuery.data?.data ?? []).filter((a) => !!a.provider_name),
    [appointmentsQuery.data],
  );

  const openCompose = () => {
    setComposeAppointmentId(null);
    setComposeBody('');
    setComposeOpen(true);
  };

  const submitCompose = async () => {
    const body = composeBody.trim();
    if (!body || !composeAppointmentId || startThread.isPending) return;
    try {
      const thread = await startThread.mutateAsync({ appointment_id: composeAppointmentId, body });
      setComposeOpen(false);
      setComposeBody('');
      setComposeAppointmentId(null);
      setActiveThreadId(thread.id);
    } catch {
      // startThread.isError renders the inline message below the form
    }
  };

  if (activeThreadId !== null) {
    return <ConversationView threadId={activeThreadId} onBack={() => setActiveThreadId(null)} />;
  }

  const hasThreads = allThreads.length > 0;

  return (
    <Screen className="px-0">
      <View className="flex-row items-start justify-between px-6 pb-1 pt-2">
        <View className="flex-1 pr-3">
          <Text className="text-2xl font-extrabold text-navy-text">{t('messages.title')}</Text>
          <Text className="mt-0.5 text-xs text-navy-secondary">{t('messages.subtitle')}</Text>
        </View>
        <Pressable
          onPress={openCompose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('messages.newConversation')}
        >
          <LinearGradient
            colors={[colors.brand[600], colors.brand[500], colors.brand[300]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            // className does not reach LinearGradient (no cssInterop) — inline only.
            style={{ height: 44, width: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
          >
            <Plus size={20} color={colors.white} />
          </LinearGradient>
        </Pressable>
      </View>

      {hasThreads ? (
        <>
          <View
            className="mx-6 mb-3 h-12 flex-row items-center rounded-2xl border px-4"
            style={{ borderColor: colors.cream[300], backgroundColor: colors.white }}
          >
            <Search size={16} color={colors.navy.muted} />
            <TextInput
              className="ml-2 h-12 flex-1 text-sm text-navy-text"
              placeholder={t('messages.searchPlaceholder')}
              placeholderTextColor={colors.navy.muted}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              returnKeyType="search"
            />
            {search.length > 0 ? (
              <Pressable
                onPress={() => setSearch('')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('messages.searchClear')}
              >
                <X size={16} color={colors.navy.muted} />
              </Pressable>
            ) : null}
          </View>

          <View className="mx-6 mb-4 flex-row gap-2">
            <FilterChip
              label={t('messages.filterAll')}
              count={allThreads.length}
              active={!unreadOnly}
              onPress={() => setUnreadOnly(false)}
            />
            <FilterChip
              label={t('messages.filterUnread')}
              count={unreadCount}
              active={unreadOnly}
              onPress={() => setUnreadOnly(true)}
            />
          </View>
        </>
      ) : null}

      {threadsQuery.isLoading ? (
        <InboxSkeleton />
      ) : threadsQuery.isError ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-cream-200">
            <MessageCircle size={26} color={colors.navy.muted} />
          </View>
          <Text className="mb-4 text-center text-sm text-navy-secondary">{t('messages.loadError')}</Text>
          <Pressable
            onPress={() => threadsQuery.refetch()}
            className="rounded-full border px-5 py-2.5"
            style={{ borderColor: colors.brand[500] }}
          >
            <Text className="text-sm font-semibold text-brand-600">{t('messages.retry')}</Text>
          </Pressable>
        </View>
      ) : hasThreads ? (
        <FlatList
          data={visibleThreads}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={threadsQuery.isRefetching}
              onRefresh={() => threadsQuery.refetch()}
              tintColor={colors.brand[500]}
            />
          }
          renderItem={({ item }) => (
            <ThreadRow item={item} onPress={() => setActiveThreadId(item.id)} />
          )}
          ListEmptyComponent={
            // Two different "nothing here" causes: an unproductive search, and
            // the Unread filter on an inbox with nothing unread. The second is
            // the common one — it deserves reassurance, not a search hint.
            unreadOnly && !search.trim() ? (
              <View className="items-center px-4 pt-10">
                <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-brand-50">
                  <Check size={22} color={colors.brand[600]} />
                </View>
                <Text className="mb-1 text-center text-base font-bold text-navy-text">
                  {t('messages.caughtUpTitle')}
                </Text>
                <Text className="text-center text-sm text-navy-secondary">
                  {t('messages.caughtUpBody')}
                </Text>
              </View>
            ) : (
              <View className="items-center px-4 pt-10">
                <View className="mb-4 h-14 w-14 items-center justify-center rounded-full bg-cream-200">
                  <Search size={22} color={colors.navy.muted} />
                </View>
                <Text className="mb-1 text-center text-base font-bold text-navy-text">
                  {t('messages.noResultsTitle')}
                </Text>
                <Text className="text-center text-sm text-navy-secondary">
                  {t('messages.noResultsBody')}
                </Text>
              </View>
            )
          }
        />
      ) : (
        <View className="flex-1 items-center justify-center px-8">
          <View className="mb-5 h-20 w-20 items-center justify-center rounded-full bg-brand-50">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-100">
              <MessageCircle size={26} color={colors.brand[600]} />
            </View>
          </View>
          <Text className="mb-2 text-center text-lg font-bold text-navy-text">
            {t('messages.emptyTitle')}
          </Text>
          <Text className="mb-6 text-center text-sm leading-5 text-navy-secondary">
            {t('messages.emptyBody')}
          </Text>
          <View className="w-full">
            <Button
              label={t('messages.startFirstConversation')}
              onPress={openCompose}
              showChevron={false}
              leftIcon={Plus}
            />
          </View>
        </View>
      )}

      <ComposeSheet
        visible={composeOpen}
        onClose={() => setComposeOpen(false)}
        appointments={contactableAppointments}
        loading={appointmentsQuery.isLoading}
        selectedId={composeAppointmentId}
        onSelect={setComposeAppointmentId}
        body={composeBody}
        onChangeBody={setComposeBody}
        onSubmit={submitCompose}
        submitting={startThread.isPending}
        failed={startThread.isError}
      />
    </Screen>
  );
}

/* ── Inbox pieces ─────────────────────────────────────────────────────── */

function FilterChip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="flex-row items-center rounded-full border px-4 py-2"
      style={{
        borderColor: active ? colors.brand[500] : colors.cream[300],
        backgroundColor: active ? colors.brand[500] : colors.white,
      }}
    >
      <Text
        className="text-xs font-bold"
        style={{ color: active ? colors.white : colors.navy.secondary }}
      >
        {label}
      </Text>
      <View
        className="ml-2 min-w-[20px] items-center rounded-full px-1.5 py-0.5"
        style={{ backgroundColor: active ? 'rgba(255,255,255,0.25)' : colors.cream[200] }}
      >
        <Text
          className="text-[10px] font-bold"
          style={{ color: active ? colors.white : colors.navy.secondary }}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

function InboxSkeleton() {
  return (
    <View className="px-6" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2, 3].map((row) => (
        <View key={row} className="mb-3 flex-row items-center rounded-2xl bg-white p-4">
          <View className="h-[52px] w-[52px] rounded-full" style={{ backgroundColor: colors.cream[200] }} />
          <View className="ml-3 flex-1">
            <View
              className="h-3.5 rounded-full"
              style={{ backgroundColor: colors.cream[200], width: '55%' }}
            />
            <View
              className="mt-2.5 h-3 rounded-full"
              style={{ backgroundColor: colors.cream[200], width: '85%' }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function ThreadRow({ item, onPress }: { item: MessageThreadSummary; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const unread = !!item.unread;
  const closed = item.status === 'closed';
  const preview = item.last_message
    ? `${item.last_message.is_mine ? `${t('messages.you')}: ` : ''}${item.last_message.body}`
    : t('messages.threadEmpty');
  const stamp = item.last_message?.created_at ?? item.updated_at;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="mb-3 flex-row items-center rounded-2xl p-4"
      style={{
        backgroundColor: unread ? colors.brand[50] : colors.white,
        borderWidth: 1,
        borderColor: unread ? colors.brand[100] : colors.white,
      }}
    >
      <View
        className="h-[52px] w-[52px] items-center justify-center rounded-full"
        style={{
          backgroundColor: unread ? colors.brand[100] : colors.cream[200],
          borderWidth: 2,
          borderColor: unread ? colors.brand[500] : colors.cream[300],
        }}
      >
        <Text className="text-sm font-extrabold" style={{ color: colors.brand[700] }}>
          {initialsFor(item.title)}
        </Text>
      </View>

      <View className="ml-3 flex-1">
        <View className="flex-row items-center">
          <Text
            className={`flex-1 text-sm text-navy-text ${unread ? 'font-extrabold' : 'font-bold'}`}
            numberOfLines={1}
          >
            {item.title || t('messages.careTeam')}
          </Text>
          {stamp ? (
            <Text
              className="ml-2 text-[10px] font-semibold"
              style={{ color: unread ? colors.brand[600] : colors.navy.muted }}
            >
              {formatStamp(stamp, i18n.language, t)}
            </Text>
          ) : null}
        </View>

        <View className="mt-1 flex-row items-center">
          <Text
            className={`flex-1 text-xs ${unread ? 'font-semibold text-navy-text' : 'text-navy-secondary'}`}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {unread ? (
            <View
              className="ml-2 h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: colors.brand[500] }}
              accessibilityLabel={t('messages.unreadLabel')}
            />
          ) : null}
        </View>

        {closed || isElevated(item.priority) ? (
          <View className="mt-2 flex-row gap-1.5">
            {closed ? <MiniChip label={t('messages.statusClosed')} tone="muted" /> : null}
            {isElevated(item.priority) ? (
              <MiniChip label={priorityLabel(t, item.priority)} tone="warning" />
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function MiniChip({ label, tone }: { label: string; tone: 'muted' | 'warning' }) {
  const palette =
    tone === 'warning'
      ? { bg: colors.semantic.warningSurface, fg: colors.semantic.warning }
      : { bg: colors.cream[200], fg: colors.navy.secondary };
  return (
    <View className="self-start rounded-full px-2 py-0.5" style={{ backgroundColor: palette.bg }}>
      <Text className="text-[10px] font-bold" style={{ color: palette.fg }}>
        {label}
      </Text>
    </View>
  );
}

/* ── Conversation ─────────────────────────────────────────────────────── */

function ConversationView({ threadId, onBack }: { threadId: number; onBack: () => void }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [replyBody, setReplyBody] = useState('');

  const threadQuery = useMessageThread(threadId);
  const sendMessage = useSendThreadMessage(threadId);

  const thread = threadQuery.data;
  const title = thread?.title || t('messages.careTeam');
  const closed = thread?.status === 'closed';
  const messages = (thread?.messages ?? []) as RichThreadMessage[];
  const groups = useMemo(() => groupMessagesByDay(messages), [messages]);

  // While the POST is in flight TanStack keeps the submitted body in
  // `variables`, so the outgoing bubble is a real in-flight request rather
  // than an invented message.
  const inFlightBody = sendMessage.isPending ? sendMessage.variables : undefined;

  const submitReply = async () => {
    const body = replyBody.trim();
    if (!body || sendMessage.isPending) return;
    setReplyBody('');
    try {
      await sendMessage.mutateAsync(body);
      threadQuery.refetch();
    } catch {
      setReplyBody(body);
    }
  };

  return (
    <Screen className="px-0">
      <View className="flex-row items-center px-6 pb-3 pt-2">
        <Pressable
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('messages.back')}
          className="h-11 w-11 items-center justify-center rounded-full border"
          style={{ borderColor: colors.brand[300] }}
        >
          <ArrowLeft size={18} color={colors.brand[600]} />
        </Pressable>
        <View className="ml-3 flex-1">
          <Text className="text-base font-extrabold text-navy-text" numberOfLines={1}>
            {threadQuery.isLoading ? '…' : title}
          </Text>
          <View className="mt-0.5 flex-row items-center">
            <ShieldCheck size={11} color={colors.semantic.success} />
            <Text className="ml-1 text-[11px] font-semibold" style={{ color: colors.semantic.success }}>
              {t('messages.secureTitle')}
            </Text>
          </View>
        </View>
      </View>

      <View
        className="mx-6 mb-3 flex-row items-center rounded-2xl px-4 py-3"
        style={{ backgroundColor: colors.semantic.successSurface }}
      >
        <Lock size={15} color={colors.semantic.success} />
        <Text className="ml-2.5 flex-1 text-[11px] leading-4 text-navy-secondary">
          {t('messages.secureBody')}
        </Text>
      </View>

      {threadQuery.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.brand[500]} />
        </View>
      ) : threadQuery.isError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="mb-4 text-center text-sm text-navy-secondary">
            {t('messages.threadLoadError')}
          </Text>
          <Pressable
            onPress={() => threadQuery.refetch()}
            className="rounded-full border px-5 py-2.5"
            style={{ borderColor: colors.brand[500] }}
          >
            <Text className="text-sm font-semibold text-brand-600">{t('messages.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {messages.length === 0 && !inFlightBody ? (
            <View className="items-center px-6 pt-14">
              <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-cream-200">
                <MessageCircle size={22} color={colors.navy.muted} />
              </View>
              <Text className="text-center text-sm text-navy-secondary">{t('messages.threadEmpty')}</Text>
            </View>
          ) : null}

          {groups.map((group) => (
            <View key={group.key || 'undated'}>
              {group.key ? (
                <DaySeparator
                  iso={group.messages[0]?.created_at ?? null}
                  locale={i18n.language}
                  t={t}
                />
              ) : null}
              {group.messages.map((message, index) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  grouped={isSameCluster(group.messages[index - 1], message)}
                  isClusterTail={!isSameCluster(message, group.messages[index + 1] ?? message) ||
                    index === group.messages.length - 1}
                  threadTitle={title}
                  locale={i18n.language}
                />
              ))}
            </View>
          ))}

          {inFlightBody ? <PendingBubble body={inFlightBody} /> : null}
        </ScrollView>
      )}

      {sendMessage.isError ? (
        <Text className="px-6 pb-2 text-center text-[11px] font-semibold" style={{ color: colors.semantic.danger }}>
          {t('messages.sendError')}
        </Text>
      ) : null}

      {closed ? (
        <View
          className="mx-6 mb-4 flex-row items-center justify-center rounded-2xl px-4 py-4"
          style={{ backgroundColor: colors.cream[200] }}
        >
          <Lock size={14} color={colors.navy.muted} />
          <Text className="ml-2 text-xs font-semibold text-navy-secondary">
            {t('messages.threadClosed')}
          </Text>
        </View>
      ) : threadQuery.isSuccess ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="border-t px-5 pb-3 pt-3" style={{ borderColor: colors.cream[300] }}>
            {replyBody.length > MESSAGE_MAX - 200 ? (
              <Text className="mb-1.5 pr-16 text-right text-[10px] font-semibold text-navy-muted">
                {t('messages.charCount', { used: replyBody.length, max: MESSAGE_MAX })}
              </Text>
            ) : null}
            <View className="flex-row items-end gap-2">
              <View
                className="min-h-[48px] flex-1 justify-center rounded-3xl border px-4 py-2"
                style={{ borderColor: colors.cream[300], backgroundColor: colors.white }}
              >
                <TextInput
                  className="max-h-28 text-sm text-navy-text"
                  placeholder={t('messages.replyPlaceholder')}
                  placeholderTextColor={colors.navy.muted}
                  value={replyBody}
                  onChangeText={setReplyBody}
                  maxLength={MESSAGE_MAX}
                  multiline
                />
              </View>
              <Pressable
                onPress={submitReply}
                disabled={!replyBody.trim() || sendMessage.isPending}
                accessibilityRole="button"
                accessibilityLabel={t('messages.composeSend')}
                className="h-12 w-12 items-center justify-center rounded-full"
                style={{
                  backgroundColor: colors.brand[500],
                  opacity: !replyBody.trim() || sendMessage.isPending ? 0.45 : 1,
                }}
              >
                {sendMessage.isPending ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Send size={18} color={colors.white} />
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </Screen>
  );
}

const MESSAGE_MAX = 4000; // matches the controller's `max:4000` validation rule

function DaySeparator({
  iso,
  locale,
  t,
}: {
  iso: string | null;
  locale: string;
  t: (key: string) => string;
}) {
  const label = formatDayLabel(iso, locale, t);
  if (!label) return null;
  return (
    <View className="my-3 items-center">
      <View className="rounded-full px-3 py-1" style={{ backgroundColor: colors.cream[200] }}>
        <Text className="text-[10px] font-bold text-navy-secondary">{label}</Text>
      </View>
    </View>
  );
}

function MessageRow({
  message,
  grouped,
  isClusterTail,
  threadTitle,
  locale,
}: {
  message: RichThreadMessage;
  grouped: boolean;
  isClusterTail: boolean;
  threadTitle: string;
  locale: string;
}) {
  const mine = !!message.is_mine;
  const rendered = describeMessage(message);
  const isCard = rendered.variant !== 'text';

  return (
    <View
      className="flex-row items-end"
      style={{
        marginTop: grouped ? 2 : 10,
        justifyContent: mine ? 'flex-end' : 'flex-start',
      }}
    >
      {!mine ? (
        <View className="mr-2 w-7">
          {isClusterTail ? (
            <View
              className="h-7 w-7 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.brand[100] }}
            >
              <Text className="text-[10px] font-extrabold" style={{ color: colors.brand[700] }}>
                {initialsFor(threadTitle)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Kept under 100% minus the 36px avatar gutter so a wide card can never
          push a received message off the edge of the stream. */}
      <View style={{ maxWidth: isCard ? '86%' : '78%' }}>
        {rendered.variant === 'text' ? (
          <TextBubble
            body={rendered.body}
            mine={mine}
            grouped={grouped}
            isClusterTail={isClusterTail}
            createdAt={message.created_at}
            status={message.status}
            locale={locale}
          />
        ) : rendered.variant === 'attachment' ? (
          <AttachmentMessage
            attachments={rendered.attachments}
            caption={rendered.caption}
            createdAt={message.created_at}
            locale={locale}
          />
        ) : rendered.variant === 'structured' ? (
          <StructuredMessage
            payload={rendered.payload}
            caption={rendered.caption}
            createdAt={message.created_at}
            locale={locale}
          />
        ) : (
          <UnsupportedMessage createdAt={message.created_at} locale={locale} />
        )}
      </View>
    </View>
  );
}

function TextBubble({
  body,
  mine,
  grouped,
  isClusterTail,
  createdAt,
  status,
  locale,
}: {
  body: string;
  mine: boolean;
  grouped: boolean;
  isClusterTail: boolean;
  createdAt: string | null;
  status: string | null;
  locale: string;
}) {
  const { t } = useTranslation();
  const tail = 6;
  const round = 18;
  return (
    <View
      className="px-4 py-2.5"
      style={{
        backgroundColor: mine ? colors.brand[500] : colors.white,
        borderWidth: mine ? 0 : 1,
        borderColor: colors.cream[300],
        borderTopLeftRadius: !mine && grouped ? tail : round,
        borderTopRightRadius: mine && grouped ? tail : round,
        borderBottomLeftRadius: !mine && isClusterTail ? tail : round,
        borderBottomRightRadius: mine && isClusterTail ? tail : round,
      }}
    >
      <Text
        className="text-sm leading-5"
        style={{ color: mine ? colors.white : colors.navy.text }}
      >
        {body}
      </Text>
      {isClusterTail ? (
        <View className="mt-1 flex-row items-center" style={{ justifyContent: 'flex-end' }}>
          {createdAt ? (
            <Text
              className="text-[10px]"
              style={{ color: mine ? 'rgba(255,255,255,0.75)' : colors.navy.muted }}
            >
              {formatClock(createdAt, locale)}
            </Text>
          ) : null}
          {mine ? (
            <View className="ml-1" accessibilityLabel={t('messages.sentLabel')}>
              <Check size={12} color={status === 'sent' ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)'} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Outgoing message whose POST has not resolved yet — a real in-flight
 * request, drawn dimmed with a clock instead of a delivery tick. */
function PendingBubble({ body }: { body: string }) {
  const { t } = useTranslation();
  return (
    <View className="mt-2.5 flex-row justify-end">
      <View
        className="max-w-[80%] px-4 py-2.5"
        style={{
          backgroundColor: colors.brand[500],
          opacity: 0.55,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 6,
        }}
      >
        <Text className="text-sm leading-5 text-white">{body}</Text>
        <View className="mt-1 flex-row items-center justify-end">
          <Clock size={11} color="rgba(255,255,255,0.85)" />
          <Text className="ml-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.85)' }}>
            {t('messages.sending')}
          </Text>
        </View>
      </View>
    </View>
  );
}

/* ── Non-text message presentation ────────────────────────────────────────
 * These render only when the API sends the corresponding fields. See the
 * contract notes at the top of lib/api/messagingQueries.ts: today the mobile
 * controller serialises neither `attachments`, `message_type` nor a payload,
 * so none of these fire against the current backend. They are the shaped
 * landing place for clinician-shared content — not placeholders filled with
 * invented data.
 * ────────────────────────────────────────────────────────────────────── */

function CardShell({
  icon: Icon,
  title,
  chip,
  children,
  createdAt,
  locale,
}: {
  icon: LucideIcon;
  title: string;
  chip?: string | null;
  children: React.ReactNode;
  createdAt: string | null;
  locale: string;
}) {
  return (
    <View
      className="overflow-hidden rounded-2xl border"
      style={{ backgroundColor: colors.white, borderColor: colors.cream[300] }}
    >
      <View
        className="flex-row items-center border-b px-4 py-3"
        style={{ borderColor: colors.cream[300], backgroundColor: colors.cream[50] }}
      >
        <View
          className="h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: colors.brand[50] }}
        >
          <Icon size={16} color={colors.brand[600]} />
        </View>
        <Text className="ml-2.5 flex-1 text-xs font-extrabold text-navy-text" numberOfLines={1}>
          {title}
        </Text>
        {chip ? <MiniChip label={chip} tone="muted" /> : null}
      </View>
      {children}
      {createdAt ? (
        <Text className="px-4 pb-2.5 text-right text-[10px] text-navy-muted">
          {formatClock(createdAt, locale)}
        </Text>
      ) : null}
    </View>
  );
}

function AttachmentMessage({
  attachments,
  caption,
  createdAt,
  locale,
}: {
  attachments: MessageAttachment[];
  caption: string;
  createdAt: string | null;
  locale: string;
}) {
  const { t } = useTranslation();
  return (
    <CardShell
      icon={Paperclip}
      title={t('messages.attachmentTitle')}
      createdAt={createdAt}
      locale={locale}
    >
      {caption ? (
        <Text className="px-4 pt-3 text-sm leading-5 text-navy-text">{caption}</Text>
      ) : null}
      <View className="px-4 pb-3 pt-3">
        {attachments.map((attachment, index) => {
          const size = formatFileSize(attachment.file_size);
          const clean = (attachment.scan_status ?? 'clean').toLowerCase() === 'clean';
          return (
            <View
              key={attachment.id ?? `${attachment.file_name}-${index}`}
              className="mb-2 flex-row items-center rounded-xl border px-3 py-2.5"
              style={{ borderColor: colors.cream[300], backgroundColor: colors.cream[50] }}
            >
              <View
                className="h-9 w-9 items-center justify-center rounded-lg"
                style={{ backgroundColor: colors.brand[50] }}
              >
                <FileText size={16} color={colors.brand[600]} />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-xs font-bold text-navy-text" numberOfLines={1}>
                  {attachment.file_name}
                </Text>
                <Text className="mt-0.5 text-[10px] text-navy-muted">
                  {[fileKindLabel(attachment), size].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {!clean ? <MiniChip label={t('messages.attachmentScanning')} tone="warning" /> : null}
            </View>
          );
        })}
        {/* No mobile route serves an attachment's bytes yet (the only upload
            endpoint is the B2B CommunicationController), so this card is
            deliberately informational — offering a download that cannot
            resolve would be a dead end. */}
        <Text className="mt-1 text-[10px] leading-4 text-navy-muted">
          {t('messages.attachmentUnavailable')}
        </Text>
      </View>
    </CardShell>
  );
}

function StructuredMessage({
  payload,
  caption,
  createdAt,
  locale,
}: {
  payload: StructuredMessagePayload;
  caption: string;
  createdAt: string | null;
  locale: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const rows = payload.rows ?? [];
  // The route is resolved client-side from a resource *kind*; a server-supplied
  // path is never pushed. Unknown kinds simply render without a CTA.
  const route = resolveResourceRoute(payload.resource);

  return (
    <CardShell
      icon={Sparkles}
      title={payload.title || t('messages.structuredTitle')}
      chip={payload.subtitle}
      createdAt={createdAt}
      locale={locale}
    >
      {caption ? (
        <Text className="px-4 pt-3 text-sm leading-5 text-navy-text">{caption}</Text>
      ) : null}
      {rows.length > 0 ? (
        <View className="px-4 pt-3">
          {rows.map((row, index) => (
            <View
              key={`${row.label}-${index}`}
              className="flex-row items-start py-2"
              style={
                index < rows.length - 1
                  ? { borderBottomWidth: 1, borderColor: colors.cream[200] }
                  : undefined
              }
            >
              <Text className="flex-1 pr-3 text-[11px] text-navy-muted">{row.label}</Text>
              <Text className="flex-1 text-right text-[11px] font-bold text-navy-text">
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {route ? (
        <Pressable
          onPress={() => router.push(route)}
          accessibilityRole="button"
          className="mx-4 mb-3 mt-3 flex-row items-center justify-center rounded-xl py-2.5"
          style={{ backgroundColor: colors.brand[50], borderWidth: 1, borderColor: colors.brand[100] }}
        >
          <Text className="text-xs font-bold text-brand-600">{t('messages.cardOpen')}</Text>
          <ChevronRight size={14} color={colors.brand[600]} />
        </Pressable>
      ) : (
        <View className="pb-1" />
      )}
    </CardShell>
  );
}

function UnsupportedMessage({ createdAt, locale }: { createdAt: string | null; locale: string }) {
  const { t } = useTranslation();
  return (
    <CardShell
      icon={FileText}
      title={t('messages.unsupportedTitle')}
      createdAt={createdAt}
      locale={locale}
    >
      <Text className="px-4 pb-3 pt-3 text-xs leading-5 text-navy-secondary">
        {t('messages.unsupportedBody')}
      </Text>
    </CardShell>
  );
}

/* ── Compose ──────────────────────────────────────────────────────────── */

interface ComposeAppointment {
  id: string;
  provider_name?: string | null;
  facility_name?: string | null;
  appointment_type?: string | null;
  scheduled_at?: string | null;
}

function ComposeSheet({
  visible,
  onClose,
  appointments,
  loading,
  selectedId,
  onSelect,
  body,
  onChangeBody,
  onSubmit,
  submitting,
  failed,
}: {
  visible: boolean;
  onClose: () => void;
  appointments: ComposeAppointment[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  body: string;
  onChangeBody: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  failed: boolean;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(26,35,56,0.45)' }}>
        <View className="max-h-[88%] rounded-t-3xl bg-cream-100 px-6 pb-8 pt-4">
          <View className="mb-4 items-center">
            <View className="h-1 w-10 rounded-full" style={{ backgroundColor: colors.cream[300] }} />
          </View>
          <View className="mb-1 flex-row items-center justify-between">
            <Text className="text-lg font-extrabold text-navy-text">{t('messages.composeTitle')}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('messages.composeCancel')}
            >
              <X size={20} color={colors.navy.muted} />
            </Pressable>
          </View>
          <Text className="mb-4 text-xs leading-4 text-navy-secondary">
            {t('messages.composeHelp')}
          </Text>

          <Text className="mb-2 text-sm font-bold text-navy-text">{t('messages.composeAbout')}</Text>
          {loading ? (
            <View className="py-6">
              <ActivityIndicator color={colors.brand[500]} />
            </View>
          ) : appointments.length === 0 ? (
            <View
              className="mb-4 rounded-2xl px-4 py-4"
              style={{ backgroundColor: colors.semantic.warningSurface }}
            >
              <Text className="text-xs leading-5 text-navy-secondary">
                {t('messages.composeNoAppointments')}
              </Text>
            </View>
          ) : (
            <ScrollView className="mb-4" style={{ maxHeight: 190 }} showsVerticalScrollIndicator={false}>
              {appointments.map((appointment) => {
                const selected = selectedId === appointment.id;
                return (
                  <Pressable
                    key={appointment.id}
                    onPress={() => onSelect(appointment.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    className="mb-2 flex-row items-center rounded-2xl border px-3 py-3"
                    style={{
                      borderColor: selected ? colors.brand[500] : colors.cream[300],
                      backgroundColor: selected ? colors.brand[50] : colors.white,
                    }}
                  >
                    <View
                      className="h-10 w-10 items-center justify-center rounded-full"
                      style={{ backgroundColor: selected ? colors.brand[100] : colors.cream[200] }}
                    >
                      <Text className="text-[11px] font-extrabold" style={{ color: colors.brand[700] }}>
                        {initialsFor(appointment.provider_name)}
                      </Text>
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="text-sm font-bold text-navy-text" numberOfLines={1}>
                        {appointment.provider_name}
                      </Text>
                      <Text className="mt-0.5 text-[11px] text-navy-muted" numberOfLines={1}>
                        {[
                          appointment.facility_name ?? appointment.appointment_type,
                          appointment.scheduled_at
                            ? formatShortDate(appointment.scheduled_at, i18n.language)
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <View
                      className="h-5 w-5 items-center justify-center rounded-full border"
                      style={{
                        borderColor: selected ? colors.brand[500] : colors.cream[300],
                        backgroundColor: selected ? colors.brand[500] : 'transparent',
                      }}
                    >
                      {selected ? <Check size={12} color={colors.white} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <TextInput
            className="mb-2 rounded-2xl border px-4 py-3 text-sm text-navy-text"
            style={{ borderColor: colors.cream[300], backgroundColor: colors.white, minHeight: 96 }}
            placeholder={t('messages.composeMessagePlaceholder')}
            placeholderTextColor={colors.navy.muted}
            value={body}
            onChangeText={onChangeBody}
            maxLength={MESSAGE_MAX}
            multiline
            textAlignVertical="top"
          />
          <Text className="mb-3 text-right text-[10px] font-semibold text-navy-muted">
            {t('messages.charCount', { used: body.length, max: MESSAGE_MAX })}
          </Text>

          {failed ? (
            <Text
              className="mb-3 text-center text-[11px] font-semibold"
              style={{ color: colors.semantic.danger }}
            >
              {t('messages.sendError')}
            </Text>
          ) : null}

          <Button
            label={t('messages.composeSend')}
            onPress={onSubmit}
            loading={submitting}
            disabled={!body.trim() || !selectedId}
            showChevron={false}
            leftIcon={Send}
          />
        </View>
      </View>
    </Modal>
  );
}

/* ── Formatting ───────────────────────────────────────────────────────── */

function localeTag(locale: string) {
  return locale?.startsWith('fr') ? 'fr-FR' : 'en-US';
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function daysAgo(iso: string): number | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
}

function formatClock(iso: string, locale: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(localeTag(locale), { hour: '2-digit', minute: '2-digit' });
}

function formatShortDate(iso: string, locale: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(localeTag(locale), { day: 'numeric', month: 'short' });
}

/** Inbox timestamp: time today, "Yesterday", weekday this week, date beyond. */
function formatStamp(iso: string, locale: string, t: (key: string) => string) {
  const diff = daysAgo(iso);
  if (diff === null) return '';
  if (diff <= 0) return formatClock(iso, locale);
  if (diff === 1) return t('messages.yesterday');
  if (diff < 7) {
    return new Date(iso).toLocaleDateString(localeTag(locale), { weekday: 'short' });
  }
  return formatShortDate(iso, locale);
}

/** Date-separator label inside a conversation. */
function formatDayLabel(iso: string | null, locale: string, t: (key: string) => string) {
  if (!iso) return '';
  const diff = daysAgo(iso);
  if (diff === null) return '';
  if (diff <= 0) return t('messages.today');
  if (diff === 1) return t('messages.yesterday');
  const date = new Date(iso);
  return date.toLocaleDateString(localeTag(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function isElevated(priority: string | null | undefined) {
  const value = (priority ?? '').toLowerCase();
  return value === 'high' || value === 'urgent';
}

function priorityLabel(t: (key: string) => string, priority: string | null | undefined) {
  return (priority ?? '').toLowerCase() === 'urgent'
    ? t('messages.priorityUrgent')
    : t('messages.priorityHigh');
}
