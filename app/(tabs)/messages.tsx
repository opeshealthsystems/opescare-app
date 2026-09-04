/**
 * Messages tab — the inbox. The Finder port of OPES MSG-001
 * (`UIUX/src/screens/messaging/MessagesScreen.tsx`), laid out as a
 * `ScreenHeader` + search + filter chips + one flush `Card` of `ListRow`s.
 *
 * Opening a thread pushes `/messages/[id]` (app/messages/[id].tsx). Starting
 * a thread from an appointment lives in the compose sheet below and lands on
 * that same route once the server has created the thread.
 *
 * Every field rendered comes from `MobileMessagingController`:
 *   • threads → id, title, status, priority, thread_type, updated_at,
 *               unread (boolean), last_message{body,is_mine,created_at}
 * The API returns no participant name beyond `title`, no avatar URL and no
 * unread *count*, so avatars are initials and "unread" is a dot, not a number.
 */
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  a11yJoin,
  Card,
  Chip,
  EmptyState,
  GradientButton,
  Icon,
  ListRow,
  PillInput,
  radii,
  ScreenHeader,
  SectionHeader,
  spacing,
  StatusBadge,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { Avatar, ErrorBlock, InfoStrip, LoadingBlock, shortDate } from '@/components/chat';
import {
  useAppointmentsForMessaging,
  useMessageThreads,
  useStartMessageThread,
  type MessageThreadSummary,
} from '@/lib/api/queries';
import {
  countUnreadThreads,
  filterThreads,
  sortThreadsByActivity,
} from '@/lib/api/messagingQueries';

/** Matches the controller's `max:4000` validation rule. */
const MESSAGE_MAX = 4000;

export default function MessagesScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeAppointmentId, setComposeAppointmentId] = useState<string | null>(null);
  const [composeBody, setComposeBody] = useState('');

  const threadsQuery = useMessageThreads();
  const appointmentsQuery = useAppointmentsForMessaging();
  const startThread = useStartMessageThread();

  const allThreads = useMemo(() => sortThreadsByActivity(threadsQuery.data ?? []), [threadsQuery.data]);
  const unreadCount = useMemo(() => countUnreadThreads(allThreads), [allThreads]);
  const visibleThreads = useMemo(() => {
    const scoped = unreadOnly ? allThreads.filter((thread) => thread.unread) : allThreads;
    return filterThreads(scoped, search);
  }, [allThreads, unreadOnly, search]);

  const contactableAppointments = useMemo(
    () => (appointmentsQuery.data?.data ?? []).filter((a) => !!a.provider_name),
    [appointmentsQuery.data],
  );

  const openThread = (thread: MessageThreadSummary) =>
    router.push({ pathname: '/messages/[id]', params: { id: String(thread.id), title: thread.title } });

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
      router.push({ pathname: '/messages/[id]', params: { id: String(thread.id), title: thread.title } });
    } catch {
      // startThread.isError renders the inline message below the form
    }
  };

  const hasThreads = allThreads.length > 0;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader
        title={t('opesMessaging.inbox.title')}
        subtitle={t('messages.subtitle')}
        showBack={false}
        actions={[
          {
            icon: 'bell',
            onPress: () => router.push('/notifications'),
            accessibilityLabel: t('opesMessaging.inbox.notificationsA11y'),
          },
          {
            icon: 'edit',
            onPress: openCompose,
            accessibilityLabel: t('messages.newConversation'),
          },
        ]}
      />

      {threadsQuery.isLoading ? (
        <LoadingBlock label={t('opesMessaging.inbox.loading')} />
      ) : threadsQuery.isError ? (
        <ErrorBlock
          message={t('messages.loadError')}
          onRetry={() => threadsQuery.refetch()}
          retryLabel={t('messages.retry')}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={threadsQuery.isRefetching}
              onRefresh={() => threadsQuery.refetch()}
              tintColor={colors.blue}
            />
          }
        >
          {hasThreads ? (
            <>
              <PillInput
                icon={<Icon name="search" size={18} color={colors.blue} />}
                placeholder={t('messages.searchPlaceholder')}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
                accessibilityLabel={t('messages.searchPlaceholder')}
              />

              <View style={styles.chips}>
                <Chip
                  label={t('messages.filterAll')}
                  count={allThreads.length}
                  selected={!unreadOnly}
                  onPress={() => setUnreadOnly(false)}
                />
                <Chip
                  label={t('messages.filterUnread')}
                  count={unreadCount}
                  selected={unreadOnly}
                  onPress={() => setUnreadOnly(true)}
                />
              </View>

              {visibleThreads.length > 0 ? (
                <Card variant="flush">
                  {visibleThreads.map((thread, index) => (
                    <ThreadRow
                      key={thread.id}
                      thread={thread}
                      locale={i18n.language}
                      divider={index < visibleThreads.length - 1}
                      onPress={() => openThread(thread)}
                    />
                  ))}
                </Card>
              ) : unreadOnly && !search.trim() ? (
                // The Unread filter on an inbox with nothing unread is the
                // common case — it deserves reassurance, not a search hint.
                <EmptyState
                  icon="check-circle"
                  tint="green"
                  title={t('messages.caughtUpTitle')}
                  message={t('messages.caughtUpBody')}
                />
              ) : (
                <EmptyState
                  icon="search"
                  tint="blue"
                  title={t('messages.noResultsTitle')}
                  message={t('messages.noResultsBody')}
                />
              )}
            </>
          ) : (
            <EmptyState
              icon="chat"
              tint="blue"
              title={t('messages.emptyTitle')}
              message={t('messages.emptyBody')}
              actionLabel={t('messages.startFirstConversation')}
              onAction={openCompose}
            />
          )}
        </ScrollView>
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
    </SafeAreaView>
  );
}

/* ── Inbox row ────────────────────────────────────────────────────────── */

function ThreadRow({
  thread,
  locale,
  divider,
  onPress,
}: {
  thread: MessageThreadSummary;
  locale: string;
  divider: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const unread = !!thread.unread;
  const closed = thread.status === 'closed';
  const elevated = isElevated(thread.priority);
  const title = thread.title || t('messages.careTeam');
  const preview = thread.last_message
    ? `${thread.last_message.is_mine ? `${t('messages.you')}: ` : ''}${thread.last_message.body}`
    : t('messages.threadEmpty');
  const stampIso = thread.last_message?.created_at ?? thread.updated_at;
  const stamp = stampIso ? formatStamp(stampIso, locale, t) : '';

  return (
    <ListRow
      leading={<Avatar name={thread.title} size={44} />}
      title={title}
      subtitle={preview}
      chevron={false}
      divider={divider}
      onPress={onPress}
      accessibilityLabel={a11yJoin(title, preview, stamp, unread ? t('messages.unreadLabel') : null)}
      trailing={
        <View style={styles.rowTrailing}>
          {!!stamp && <Text style={[styles.stamp, unread && styles.stampUnread]}>{stamp}</Text>}
          <View style={styles.rowMarks}>
            {closed && <StatusBadge status="closed" tone="neutral" size="sm" label={t('messages.statusClosed')} />}
            {elevated && (
              <StatusBadge status={thread.priority} tone="warning" size="sm" label={priorityLabel(t, thread.priority)} />
            )}
            {unread && <View style={styles.unreadDot} />}
          </View>
        </View>
      }
    />
  );
}

/* ── Compose sheet ────────────────────────────────────────────────────── */

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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.scrimWrap}>
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('messages.composeCancel')}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.sheetGrab} />
            <View style={styles.sheetHead}>
              <View style={styles.flexMin}>
                <Text style={styles.sheetTitle} accessibilityRole="header">
                  {t('messages.composeTitle')}
                </Text>
                <Text style={styles.sheetSubtitle}>{t('messages.composeHelp')}</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('messages.composeCancel')}
              >
                <Icon name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <SectionHeader title={t('messages.composeAbout')} variant="overline" />
              {loading ? (
                <LoadingBlock />
              ) : appointments.length === 0 ? (
                <InfoStrip icon="alert-circle" text={t('messages.composeNoAppointments')} />
              ) : (
                <Card variant="flush">
                  {appointments.map((appointment, index) => {
                    const selected = selectedId === appointment.id;
                    const name = appointment.provider_name ?? t('messages.careTeam');
                    return (
                      <ListRow
                        key={appointment.id}
                        leading={<Avatar name={appointment.provider_name} size={40} />}
                        title={name}
                        meta={[
                          appointment.facility_name ?? appointment.appointment_type,
                          appointment.scheduled_at ? shortDate(appointment.scheduled_at) : null,
                        ]}
                        chevron={false}
                        divider={index < appointments.length - 1}
                        onPress={() => onSelect(appointment.id)}
                        style={selected ? styles.rowSelected : undefined}
                        trailing={
                          <Icon
                            name="check-circle"
                            size={22}
                            color={selected ? colors.statusNormal : colors.border}
                            strokeWidth={2}
                          />
                        }
                      />
                    );
                  })}
                </Card>
              )}

              <TextInput
                style={styles.composeInput}
                placeholder={t('messages.composeMessagePlaceholder')}
                placeholderTextColor={colors.textMuted}
                value={body}
                onChangeText={onChangeBody}
                maxLength={MESSAGE_MAX}
                multiline
                textAlignVertical="top"
                accessibilityLabel={t('messages.composeMessagePlaceholder')}
              />
              <Text style={styles.charCount}>{t('messages.charCount', { used: body.length, max: MESSAGE_MAX })}</Text>

              {failed && (
                <View style={styles.formError} accessibilityLiveRegion="polite" accessibilityRole="alert">
                  <Icon name="alert-circle" size={16} color={colors.statusCritical} />
                  <Text style={styles.formErrorText}>{t('messages.sendError')}</Text>
                </View>
              )}

              <GradientButton
                label={t('messages.composeSend')}
                onPress={onSubmit}
                loading={submitting}
                disabled={!body.trim() || !selectedId}
                icon="none"
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* ── Formatting ───────────────────────────────────────────────────────── */

type Translate = (key: string) => string;

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

/** Inbox timestamp: time today, "Yesterday", weekday this week, date beyond. */
function formatStamp(iso: string, locale: string, t: Translate) {
  const diff = daysAgo(iso);
  if (diff === null) return '';
  if (diff <= 0) return formatClock(iso, locale);
  if (diff === 1) return t('messages.yesterday');
  if (diff < 7) return new Date(iso).toLocaleDateString(localeTag(locale), { weekday: 'short' });
  return new Date(iso).toLocaleDateString(localeTag(locale), { day: 'numeric', month: 'short' });
}

function isElevated(priority: string | null | undefined) {
  const value = (priority ?? '').toLowerCase();
  return value === 'high' || value === 'urgent';
}

function priorityLabel(t: Translate, priority: string | null | undefined) {
  return (priority ?? '').toLowerCase() === 'urgent' ? t('messages.priorityUrgent') : t('messages.priorityHigh');
}

/**
 * `#RRGGBB` → `rgba(r,g,b,a)`. The kit palette has no `overlay` token, so the
 * scrim is derived from the palette's `navy` rather than hardcoded — it follows
 * a palette switch like every other colour on the sheet.
 */
function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/* ── Styles ───────────────────────────────────────────────────────────── */

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    flexMin: { flex: 1, minWidth: 0 },
    content: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
    chips: { flexDirection: 'row', gap: spacing.sm },

    // Row trailing: stamp above the marks, right-aligned.
    rowTrailing: { alignItems: 'flex-end', gap: 6 },
    rowMarks: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    stamp: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textMuted,
    },
    stampUnread: { fontFamily: typography.fontFamily.semiBold, color: colors.link },
    unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.badge },
    rowSelected: { backgroundColor: colors.primarySoft },

    // Compose sheet
    scrimWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: withAlpha(colors.navy, 0.45) },
    scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    sheet: {
      maxHeight: '88%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    sheetGrab: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: radii.pill,
      backgroundColor: colors.border,
      marginBottom: spacing.md,
    },
    sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
    sheetTitle: {
      fontFamily: typography.fontFamily.bold,
      fontSize: typography.size.lg,
      color: colors.textPrimary,
    },
    sheetSubtitle: {
      marginTop: 2,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textSecondary,
    },
    sheetScroll: { flexGrow: 0 },
    sheetBody: { gap: spacing.sm + 4, paddingBottom: spacing.sm },
    composeInput: {
      minHeight: 96,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.sm,
      lineHeight: typography.lineHeight.sm,
      color: colors.textPrimary,
    },
    charCount: {
      textAlign: 'right',
      fontFamily: typography.fontFamily.medium,
      fontSize: 10,
      color: colors.textMuted,
    },
    formError: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm + 2,
      borderRadius: radii.sm + 2,
      backgroundColor: colors.statusCriticalBg,
    },
    formErrorText: {
      flex: 1,
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.statusCritical,
    },
  });
