/**
 * DoctorMessages — the clinician's message inbox.
 *
 * Reads `GET /staff/messages/threads`, which is the token-authenticated twin
 * of the desktop Communication Center: same visibility scope, same rows. The
 * server already orders unread-first, so what a doctor sees at the top of this
 * list is literally "who is waiting on me".
 *
 * Design: no new primitives. ScreenHeader / SegmentedTabs / ListRow /
 * EmptyState from `components`, the chat `useAsync` + `AsyncBoundary` gate, and
 * `Avatar` from the patient thread's shared pieces. Every count on screen is
 * the server's `unread_count` — nothing is derived or invented.
 */
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchStaffThreads, type StaffThread, type StaffThreadQuery } from '../../api';
import { Card, EmptyState, ListRow, ScreenHeader, SegmentedTabs } from '../../components';
import { useTranslation, type TFunction } from '../../i18n';
import { colors, radii, spacing, typography } from '../../theme/theme';
import { AsyncBoundary, Avatar, shortDate, chatTime, useAsync } from '../chat/shared';

type Folder = 'waiting' | 'all' | 'archived';

const FOLDER_KEYS: Folder[] = ['waiting', 'all', 'archived'];

const QUERY: Record<Folder, StaffThreadQuery> = {
  waiting: { unread: true, per_page: 100 },
  all: { per_page: 100 },
  archived: { status: 'archived', per_page: 100 },
};

const FOLDER_LABEL: Record<Folder, string> = {
  waiting: 'doctor.messages.folderWaiting',
  all: 'doctor.messages.folderAll',
  archived: 'doctor.messages.folderArchived',
};

export function DoctorMessagesScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const [folder, setFolder] = useState<Folder>('waiting');

  const folders = useMemo(
    () => FOLDER_KEYS.map((key) => ({ key, label: t(FOLDER_LABEL[key]) })),
    [t]
  );

  const state = useAsync<StaffThread[]>(
    () => fetchStaffThreads(QUERY[folder]).then((page) => page.data),
    [folder]
  );
  const { reload } = state;

  // Coming back from a thread must not leave a stale unread badge on screen:
  // opening a conversation clears it server-side, so re-read on focus.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const threads = state.data ?? [];
  const waiting = useMemo(() => threads.filter((t) => t.unread_count > 0).length, [threads]);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('doctor.messages.title')}
        subtitle={
          folder === 'waiting' && state.data !== null
            ? waiting === 0
              ? t('doctor.messages.nobodyWaiting')
              : t('doctor.messages.waiting', { count: waiting })
            : t('doctor.messages.defaultSubtitle')
        }
      />

      <SegmentedTabs
        options={folders}
        value={folder}
        onChange={(k) => setFolder(k as Folder)}
        style={styles.tabs}
      />

      <ScrollView
        contentContainerStyle={styles.content}
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
          loadingLabel={t('doctor.messages.loading')}
        >
          {(data) =>
            data.length === 0 ? (
              <EmptyState
                icon="chat"
                tint="blue"
                title={emptyTitle(folder, t)}
                message={emptyMessage(folder, t)}
              />
            ) : (
              <Card style={styles.list}>
                {data.map((thread, i) => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    divider={i < data.length - 1}
                    onPress={() =>
                      navigation.navigate('DoctorMessageThread', {
                        threadId: thread.id,
                        title: counterpart(thread, t),
                      })
                    }
                  />
                ))}
              </Card>
            )
          }
        </AsyncBoundary>
      </ScrollView>
    </View>
  );
}

/** One conversation. The unread pill is the server's count, verbatim. */
function ThreadRow({
  thread,
  divider,
  onPress,
}: {
  thread: StaffThread;
  divider: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const unread = thread.unread_count > 0;
  const name = counterpart(thread, t);

  return (
    <ListRow
      leading={<Avatar name={name} size={44} />}
      title={name}
      meta={[
        thread.kind === 'patient'
          ? thread.patient_number ?? t('doctor.messages.metaPatient')
          : t('doctor.messages.metaColleague'),
        thread.subject,
      ]}
      trailing={
        <View style={styles.trailing}>
          <Text style={styles.when}>{whenLabel(thread.last_message_at)}</Text>
          {unread ? (
            <View style={styles.unreadPill}>
              <Text style={styles.unreadPillText}>{thread.unread_count}</Text>
            </View>
          ) : null}
        </View>
      }
      subtitle={undefined}
      onPress={onPress}
      divider={divider}
      style={unread ? styles.rowUnread : undefined}
    />
  );
}

function counterpart(thread: StaffThread, t: TFunction): string {
  return (
    thread.counterpart_name ??
    thread.patient_name ??
    thread.subject ??
    t('doctor.messages.conversation')
  );
}

/** Today shows a clock, anything older shows a date. Never a fake "now". */
function whenLabel(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  return then.toDateString() === new Date().toDateString() ? chatTime(iso) : shortDate(iso);
}

function emptyTitle(folder: Folder, t: TFunction): string {
  if (folder === 'waiting') return t('doctor.messages.emptyWaitingTitle');
  if (folder === 'archived') return t('doctor.messages.emptyArchivedTitle');
  return t('doctor.messages.emptyAllTitle');
}

function emptyMessage(folder: Folder, t: TFunction): string {
  if (folder === 'waiting') return t('doctor.messages.emptyWaitingBody');
  if (folder === 'archived') return t('doctor.messages.emptyArchivedBody');
  return t('doctor.messages.emptyAllBody');
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  tabs: { marginHorizontal: spacing.md },
  content: { padding: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  list: { padding: 0 },
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
