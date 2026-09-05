/**
 * Doctor — Messages inbox (`/clinician/messages`).
 *
 * Port of `UIUX/src/screens/doctor/DoctorMessagesScreen.tsx` onto expo-router,
 * the OPES UI kit and this app's doctor foundation.
 *
 * The clinician's conversations, in the server's own order — unread first, so
 * the top of this list is literally "who is waiting on me". Three folders map
 * onto the contract's query, nothing more:
 *
 *   Waiting on You → `{ unread: true }`
 *   All            → `{}`
 *   Archived       → `{ status: 'archived' }`
 *
 * EVERY COUNT ON SCREEN IS THE SERVER'S. The badge on a row is
 * `thread.unread_count`, verbatim; the header's "n waiting" is
 * `GET /messages/unread-count`'s `unread_threads`, and when that count is not
 * available the subtitle says nothing about it rather than counting the page
 * that happens to be loaded. A page-scoped count and an inbox-scoped count are
 * different claims and must not be collapsed.
 *
 * Nothing here marks anything read: opening a thread is what does that, and it
 * happens server-side on the detail read. Coming back re-reads the list so a
 * cleared badge is the server's answer, not a local guess.
 *
 * Backend gap: the finder does not serve `/mobile/doctor/*` yet. A 404 (or any
 * failure with nothing on screen) renders an honest EmptyState with a retry —
 * never an empty list, which would read as "no conversations".
 *
 * i18n: `opesDoctor.messages.*`. Every string still carries a `defaultValue`
 * so a key added later is picked up and a key missing today still reads.
 * Locale files are not edited here.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Card,
  EmptyState,
  ListRow,
  ScreenHeader,
  SegmentedTabs,
  StaleNotice,
  radii,
  spacing,
  typography,
  useTheme,
  type Palette,
} from '@/components/opes-ui';
import { LoadingBlock, describeFailure, type Translate } from '@/components/care/shared';
// The patient side's chat chrome — reused, never forked.
import { Avatar, chatTime, shortDate } from '@/components/chat';
// ── Doctor foundation (owned by the foundation agent) ─────────────────────
import {
  useDoctorThreads,
  useDoctorUnreadCounts,
  type DoctorThread,
  type DoctorThreadQuery,
  isDoctorFeatureUnserved,
} from '@/lib/api/doctorQueries';
import { doctorRoutes } from '@/components/doctor/chartRoutes';

type Folder = 'waiting' | 'all' | 'archived';

const FOLDERS: readonly Folder[] = ['waiting', 'all', 'archived'];

/** One folder, one server query. A page of 100 is the OPES screen's horizon. */
const QUERY: Record<Folder, DoctorThreadQuery> = {
  waiting: { unread: true, per_page: 100 },
  all: { per_page: 100 },
  archived: { status: 'archived', per_page: 100 },
};

const FOLDER_LABEL: Record<Folder, [string, string]> = {
  waiting: ['messages.folderWaiting', 'Waiting on You'],
  all: ['messages.folderAll', 'All'],
  archived: ['messages.folderArchived', 'Archived'],
};

/**
 * The empty state per folder. Each states what is true OF THAT FOLDER —
 * "everything answered", "nothing archived" and "no conversations at all" are
 * three different facts and are never collapsed into one "nothing here".
 */
const EMPTY: Record<Folder, { title: [string, string]; message: [string, string] }> = {
  waiting: {
    title: ['messages.emptyWaitingTitle', 'Nothing waiting on you'],
    message: ['messages.emptyWaitingBody', 'Every conversation addressed to you has been answered.'],
  },
  all: {
    title: ['messages.emptyAllTitle', 'No conversations yet'],
    message: [
      'messages.emptyAllBody',
      'When a patient or a colleague writes to you, the conversation appears here.',
    ],
  },
  archived: {
    title: ['messages.emptyArchivedTitle', 'No archived conversations'],
    message: ['messages.emptyArchivedBody', 'Conversations you archive are kept here.'],
  },
};

/**
 * Today shows a clock, anything older shows a date, an unparseable value
 * shows nothing. Never a fabricated "now".
 */
function whenLabel(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  return then.toDateString() === new Date().toDateString() ? chatTime(iso) : shortDate(iso);
}

export default function DoctorMessagesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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

  const [folder, setFolder] = useState<Folder>('waiting');

  // Stable per folder, so switching back does not mint a new query key (and a
  // new network read) for a query the cache already answers.
  const query = useMemo(() => QUERY[folder], [folder]);
  const threads = useDoctorThreads(query);
  const { refetch } = threads;

  // The badge count is the server's own, shared (same query key, 30s stale)
  // with the tab bar in `_layout.tsx` — one read, two consumers.
  const counts = useDoctorUnreadCounts();
  const unreadThreads = counts.data?.unread_threads ?? null;

  // Coming back from a thread must not leave a stale unread badge on screen:
  // reading a conversation clears it server-side. The first focus IS the mount
  // fetch, so it is skipped.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void refetch();
      void counts.refetch();
      // `counts.refetch` is stable for the life of the query observer; listing
      // it would re-arm the effect on every render of a polled query.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refetch])
  );

  const folderOptions = useMemo(
    () => FOLDERS.map((key) => ({ key, label: tx(...FOLDER_LABEL[key]) })),
    [tx]
  );

  // `useDoctorThreads` answers the contract's paginated envelope
  // (`DoctorPage<T>` = { data, meta.pagination }) — the rows are one level in.
  const rows: DoctorThread[] = threads.data?.data ?? [];

  /**
   * The header's second line. It only claims a number when the SERVER gave us
   * one; otherwise it describes the screen instead of counting a page.
   */
  const subtitle =
    folder === 'waiting' && unreadThreads !== null
      ? unreadThreads === 0
        ? tx('messages.nobodyWaiting', 'Nobody is waiting on a reply.')
        : tx('messages.waiting', '{{count}} conversations waiting on your reply', {
            count: unreadThreads,
          })
      : tx('messages.defaultSubtitle', 'Your patient and colleague conversations');

  // A refresh that failed while rows are on screen must never pass as fresh.
  const stale =
    threads.isError && threads.data !== undefined ? (
      <StaleNotice
        message={describeFailure(threads.error).message}
        loadedAt={threads.dataUpdatedAt ? new Date(threads.dataUpdatedAt) : null}
        onRetry={() => void refetch()}
        retrying={threads.isFetching}
      />
    ) : null;

  let body: React.ReactNode;
  if (threads.isPending) {
    body = <LoadingBlock label={tx('messages.loading', 'Loading your conversations…')} />;
  } else if (threads.isError && threads.data === undefined) {
    const notServed = isDoctorFeatureUnserved(threads.error);
    body = (
      <EmptyState
        icon={notServed ? 'chat' : 'alert-circle'}
        tint={notServed ? 'blue' : 'red'}
        title={
          notServed
            ? tx('shared.notServedTitle', 'Not available on this server yet')
            : // describeFailure already names the failure in the reader's
              // language; don't flatten every failure into "unknown".
              describeFailure(threads.error).title
        }
        message={
          notServed
            ? tx(
                'shared.notServedMessages',
                'Your patient and colleague conversations will appear here once the clinician service is enabled for this app.'
              )
            : describeFailure(threads.error).message
        }
        actionLabel={tr('opesCore.common.retry')}
        onAction={() => void refetch()}
      />
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon="chat"
        tint="blue"
        title={tx(...EMPTY[folder].title)}
        message={tx(...EMPTY[folder].message)}
      />
    );
  } else {
    body = (
      <Card variant="flush">
        {rows.map((thread, i) => (
          <ThreadRow
            key={thread.id}
            thread={thread}
            divider={i < rows.length - 1}
            styles={styles}
            tx={tx}
            onPress={() => router.push(doctorRoutes.thread(thread.id))}
          />
        ))}
      </Card>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScreenHeader title={tx('messages.title', 'Messages')} subtitle={subtitle} />

      <SegmentedTabs
        options={folderOptions}
        value={folder}
        onChange={(key) => setFolder(key as Folder)}
        variant="pill"
        style={styles.tabs}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={threads.isFetching && !threads.isPending}
            onRefresh={() => void refetch()}
            tintColor={colors.blue}
          />
        }
      >
        {stale}
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * One conversation.
 *
 * The pill is `thread.unread_count` verbatim — never a derived "has unread"
 * boolean dressed up as a number, and never a zero drawn as an empty pill.
 */
function ThreadRow({
  thread,
  divider,
  styles,
  tx,
  onPress,
}: {
  thread: DoctorThread;
  divider: boolean;
  styles: ReturnType<typeof makeStyles>;
  tx: (key: string, defaultValue: string, params?: Record<string, unknown>) => string;
  onPress: () => void;
}) {
  const unread = thread.unread_count > 0;
  const name = counterpart(thread, tx);
  const when = whenLabel(thread.last_message_at);

  // A patient thread is identified by the Health ID this deployment keys on;
  // a colleague thread by the plain word. Neither is invented when absent.
  const who =
    thread.kind === 'patient'
      ? thread.patient_health_id ?? tx('messages.metaPatient', 'Patient')
      : tx('messages.metaColleague', 'Colleague');

  return (
    <ListRow
      leading={<Avatar name={name} size={44} />}
      title={name}
      meta={[who, thread.last_message_preview ?? thread.subject]}
      trailing={
        <View style={styles.trailing}>
          {!!when && <Text style={styles.when}>{when}</Text>}
          {unread && (
            <View style={styles.unreadPill}>
              <Text style={styles.unreadPillText}>{thread.unread_count}</Text>
            </View>
          )}
        </View>
      }
      onPress={onPress}
      divider={divider}
      style={unread ? styles.rowUnread : undefined}
    />
  );
}

/** Who this conversation is with, from the clinician's seat. */
function counterpart(
  thread: DoctorThread,
  tx: (key: string, defaultValue: string) => string
): string {
  return (
    thread.counterpart_name ??
    thread.patient_name ??
    thread.subject ??
    tx('messages.conversation', 'Conversation')
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.page },
    tabs: { marginHorizontal: spacing.md },
    content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },

    rowUnread: { backgroundColor: colors.tintBlueBg },
    trailing: { alignItems: 'flex-end', gap: spacing.xs },
    when: {
      fontFamily: typography.fontFamily.regular,
      fontSize: typography.size.xs,
      color: colors.textSecondary,
    },
    unreadPill: {
      minWidth: 22,
      paddingHorizontal: spacing.xs,
      paddingVertical: 1,
      borderRadius: radii.pill,
      backgroundColor: colors.blue,
      alignItems: 'center',
    },
    unreadPillText: {
      fontFamily: typography.fontFamily.semiBold,
      fontSize: typography.size.xs,
      color: colors.textOnBrand,
    },
  });
